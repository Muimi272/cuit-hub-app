import fs from "node:fs";
import path from "node:path";
import { syncAndroidIcons } from "./sync-android-icons.mjs";

const root = process.cwd();
const androidRoot = path.join(root, "src-tauri", "gen", "android");
const appGradle = path.join(androidRoot, "app", "build.gradle.kts");
const firebaseConfig = process.env.GOOGLE_SERVICES_JSON_BASE64;
const keystore = process.env.ANDROID_KEYSTORE_BASE64;

if (!fs.existsSync(appGradle)) {
  throw new Error("Android project is missing. Run `npm run android:init -- --ci` first.");
}

syncAndroidIcons({
  sourceRoot: path.join(root, "src-tauri", "icons", "android"),
  resourceRoot: path.join(androidRoot, "app", "src", "main", "res")
});

if (firebaseConfig) {
  const decoded = Buffer.from(firebaseConfig, "base64").toString("utf8");
  const config = JSON.parse(decoded);
  const packageNames = (config.client || []).map(
    (client) => client.client_info?.android_client_info?.package_name
  );

  if (!packageNames.includes("dev.cuit.hub")) {
    throw new Error("google-services.json must contain the Android package dev.cuit.hub.");
  }

  fs.writeFileSync(path.join(androidRoot, "app", "google-services.json"), decoded);
  let gradle = fs.readFileSync(appGradle, "utf8");
  if (!gradle.includes("com.google.gms.google-services")) {
    gradle = gradle.replace(
      "plugins {",
      'plugins {\n    id("com.google.gms.google-services") version "4.4.4"'
    );
    fs.writeFileSync(appGradle, gradle);
  }
  console.log("Firebase configuration installed for Android background push.");
} else {
  console.warn("GOOGLE_SERVICES_JSON_BASE64 is not set; foreground notification polling remains enabled.");
}

if (keystore) {
  const required = ["ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing Android signing secrets: ${missing.join(", ")}`);

  const keyPath = path.join(androidRoot, "release.jks");
  fs.writeFileSync(keyPath, Buffer.from(keystore, "base64"));
  fs.writeFileSync(
    path.join(androidRoot, "keystore.properties"),
    [
      `password=${process.env.ANDROID_KEYSTORE_PASSWORD}`,
      `keyAlias=${process.env.ANDROID_KEY_ALIAS}`,
      `storeFile=${keyPath.replaceAll("\\", "/")}`,
      `keyPassword=${process.env.ANDROID_KEY_PASSWORD}`,
      ""
    ].join("\n")
  );
  console.log("Android release signing configuration installed.");
}
