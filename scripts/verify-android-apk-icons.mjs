import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const apkPath = process.argv[2];
if (!apkPath || !fs.existsSync(apkPath)) {
  throw new Error("Usage: node scripts/verify-android-apk-icons.mjs <apk-path>");
}

const sourceRoot = path.join(process.cwd(), "src-tauri", "icons", "android");
const expectedPngs = fs.readdirSync(sourceRoot, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".png"))
  .map((entry) => path.join(entry.parentPath, entry.name));

function archive(command, args) {
  return execFileSync(command, args, { encoding: null, maxBuffer: 20 * 1024 * 1024 });
}

let list;
let extract;
try {
  list = archive("unzip", ["-Z1", apkPath]).toString("utf8").split(/\r?\n/);
  extract = (entry) => archive("unzip", ["-p", apkPath, entry]);
} catch (error) {
  if (process.platform !== "win32") throw error;
  list = archive("tar", ["-tf", apkPath]).toString("utf8").split(/\r?\n/);
  extract = (entry) => archive("tar", ["-xOf", apkPath, entry]);
}

for (const source of expectedPngs) {
  const relative = path.relative(sourceRoot, source).split(path.sep).join("/");
  const [directory, filename] = relative.split("/");
  const directoryPattern = directory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const entryPattern = new RegExp(`^res/${directoryPattern}(?:-v4)?/${filename}$`);
  const entry = list.find((candidate) => entryPattern.test(candidate));
  if (!entry) throw new Error(`APK is missing custom icon resource ${relative}`);

  const expected = PNG.sync.read(fs.readFileSync(source));
  const actual = PNG.sync.read(extract(entry));
  if (expected.width !== actual.width || expected.height !== actual.height ||
      !expected.data.equals(actual.data)) {
    throw new Error(`APK icon pixels differ from ${relative}`);
  }
}

const adaptiveIcons = ["ic_launcher.xml", "ic_launcher_round.xml"];
for (const filename of adaptiveIcons) {
  if (!list.some((entry) => new RegExp(`^res/mipmap-anydpi-v26/${filename}$`).test(entry))) {
    throw new Error(`APK is missing adaptive icon resource ${filename}`);
  }
}

console.log(`Verified ${expectedPngs.length} custom launcher PNGs and both adaptive icons in ${apkPath}.`);
