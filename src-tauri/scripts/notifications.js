(() => {
  "use strict";

  if (window.__CUIT_HUB_NOTIFICATIONS__ || location.origin !== "https://hub.cuit.dev") return;
  window.__CUIT_HUB_NOTIFICATIONS__ = true;

  const invoke = (command, args = {}) => window.__TAURI_INTERNALS__.invoke(command, args);
  const isAndroid = /Android/i.test(navigator.userAgent);
  const cursorKey = "cuit-hub.notification-cursor.v1";
  const tokenKey = "cuit-hub.fcm-token.v1";
  let signedIn = false;
  let permissionPromptHandled = false;

  async function getSession() {
    const response = await fetch("/api", { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error(`Forum session request failed: ${response.status}`);

    const payload = await response.json();
    const forum = payload.data || payload.resources?.[0];
    const actor = forum?.relationships?.actor?.data;
    return { actor, csrfToken: response.headers.get("x-csrf-token") };
  }

  async function syncFcmToken(requestPermission) {
    if (!isAndroid) return false;

    try {
      const session = await getSession();
      signedIn = Boolean(session.actor);
      if (!signedIn) return false;

      let state = (await invoke("plugin:fcm|check_permissions"))?.notification;
      if ((state === "prompt" || state === "prompt-with-rationale") && requestPermission) {
        state = (await invoke("plugin:fcm|request_permissions"))?.notification;
      }
      if (state !== "granted") return false;

      await invoke("plugin:fcm|register");
      const { token } = await invoke("plugin:fcm|get_token");
      if (!token) return false;

      if (localStorage.getItem(tokenKey) !== token) {
        const response = await fetch("/api/pwa/firebase_push_subscriptions", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(session.csrfToken ? { "X-CSRF-Token": session.csrfToken } : {})
          },
          body: JSON.stringify({ data: { attributes: { token } } })
        });
        if (!response.ok) throw new Error(`FCM token sync failed: ${response.status}`);
        localStorage.setItem(tokenKey, token);
      }

      return true;
    } catch (error) {
      console.warn("[CUIT Hub] Native push is not ready:", error);
      return false;
    }
  }

  function notificationText(item, included) {
    const type = item.attributes?.contentType;
    const messages = {
      postLiked: "Someone liked your post.",
      postMentioned: "Someone mentioned your post.",
      userMentioned: "Someone mentioned you.",
      newPost: "There is a new reply in a followed discussion.",
      newDiscussion: "There is a new discussion.",
      discussionRenamed: "A followed discussion was renamed."
    };
    const fromId = item.relationships?.fromUser?.data?.id;
    const sender = included.find((entry) => entry.type === "users" && entry.id === fromId);
    const name = sender?.attributes?.displayName || sender?.attributes?.username;
    const message = messages[type] || "You have a new forum notification.";
    return name ? `${name}: ${message}` : message;
  }

  async function pollNotifications() {
    try {
      const response = await fetch("/api/notifications?page[limit]=20&sort=-createdAt", {
        credentials: "include",
        cache: "no-store"
      });
      if (!response.ok) return;

      const payload = await response.json();
      const items = Array.isArray(payload.data) ? payload.data : [];
      const included = Array.isArray(payload.included) ? payload.included : [];
      const keys = items.map((item) => `${item.attributes?.createdAt || ""}:${item.id}`);
      const newest = keys.sort().at(-1) || new Date().toISOString();
      const previous = localStorage.getItem(cursorKey);
      localStorage.setItem(cursorKey, newest);
      if (!previous || typeof Notification === "undefined" || Notification.permission !== "granted") return;

      items
        .filter((item) => !item.attributes?.isRead)
        .filter((item) => `${item.attributes?.createdAt || ""}:${item.id}` > previous)
        .reverse()
        .forEach((item) => new Notification("CUIT Hub", { body: notificationText(item, included) }));
    } catch (error) {
      console.debug("[CUIT Hub] Notification polling skipped:", error);
    }
  }

  async function enableAfterUserGesture() {
    if (!signedIn || permissionPromptHandled) return;
    permissionPromptHandled = true;

    if (isAndroid) {
      await syncFcmToken(true);
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } else if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    await pollNotifications();
  }

  async function initialize() {
    try {
      signedIn = Boolean((await getSession()).actor);
    } catch {
      signedIn = false;
    }

    if (signedIn && isAndroid) await syncFcmToken(false);
    await pollNotifications();
  }

  window.addEventListener("focus", initialize);
  document.addEventListener("pointerup", enableAfterUserGesture, { passive: true });
  setInterval(initialize, 60_000);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
