import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync("src-tauri/scripts/notifications.js", "utf8");

function response(body, { ok = true, status = 200, csrf = null } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    headers: { get: (name) => name.toLowerCase() === "x-csrf-token" ? csrf : null }
  };
}

function harness({ android = false, fetch }) {
  const events = new Map();
  const storage = new Map();
  const invokes = [];
  const notifications = [];
  let notificationPermissionRequests = 0;

  function Notification(title, options) {
    notifications.push({ title, options });
  }
  Notification.permission = android ? "default" : "granted";
  Notification.requestPermission = async () => {
    notificationPermissionRequests += 1;
    Notification.permission = "granted";
    return "granted";
  };

  const window = {
    __TAURI_INTERNALS__: {
      invoke: async (command, args) => {
        invokes.push({ command, args });
        if (command.endsWith("check_permissions")) return { notification: "prompt" };
        if (command.endsWith("request_permissions")) return { notification: "granted" };
        if (command.endsWith("get_token")) return { token: "fcm-test-token" };
      }
    },
    addEventListener: (name, listener) => events.set(name, listener)
  };

  const context = {
    window,
    location: { origin: "https://hub.cuit.dev" },
    navigator: { userAgent: android ? "Android" : "Windows" },
    document: {
      readyState: "complete",
      addEventListener: (name, listener) => events.set(name, listener)
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    Notification,
    fetch,
    console,
    setInterval: () => 1
  };

  vm.runInNewContext(source, context);
  return { events, invokes, notifications, storage, get notificationPermissionRequests() { return notificationPermissionRequests; } };
}

test("does not expose native integration to another origin", () => {
  const context = {
    window: {},
    location: { origin: "https://example.com" },
    navigator: { userAgent: "Windows" }
  };
  vm.runInNewContext(source, context);
  assert.equal(context.window.__CUIT_HUB_NOTIFICATIONS__, undefined);
});

test("desktop polling emits only notifications newer than its cursor", async () => {
  let pollCount = 0;
  const fetch = async (url) => {
    if (url === "/api") {
      return response({ data: { relationships: { actor: { data: { id: "1" } } } } });
    }
    pollCount += 1;
    const data = pollCount === 1
      ? [{ id: "10", attributes: { createdAt: "2026-09-05T00:00:00Z", isRead: false } }]
      : [{ id: "11", attributes: { createdAt: "2026-09-05T00:01:00Z", isRead: false, contentType: "newPost" } }];
    return response({ data, included: [] });
  };

  const app = harness({ fetch });
  await new Promise(setImmediate);
  assert.equal(app.notifications.length, 0);

  await app.events.get("focus")();
  assert.equal(app.notifications.length, 1);
  assert.equal(app.notifications[0].title, "CUIT Hub");
  assert.equal(app.notifications[0].options.body, "There is a new reply in a followed discussion.");
});

test("Android requests permission and registers its FCM token with FoF PWA", async () => {
  let tokenRequest;
  const fetch = async (url, options = {}) => {
    if (url === "/api") {
      return response(
        { data: { relationships: { actor: { data: { id: "1" } } } } },
        { csrf: "csrf-token" }
      );
    }
    if (url === "/api/pwa/firebase_push_subscriptions") {
      tokenRequest = options;
      return response({});
    }
    return response({ data: [], included: [] });
  };

  const app = harness({ android: true, fetch });
  await new Promise(setImmediate);
  await app.events.get("pointerup")();

  assert.ok(app.invokes.some(({ command }) => command === "plugin:fcm|request_permissions"));
  assert.ok(app.invokes.some(({ command }) => command === "plugin:fcm|get_token"));
  assert.equal(app.notificationPermissionRequests, 1);
  assert.equal(tokenRequest.headers["X-CSRF-Token"], "csrf-token");
  assert.deepEqual(JSON.parse(tokenRequest.body), {
    data: { attributes: { token: "fcm-test-token" } }
  });
});
