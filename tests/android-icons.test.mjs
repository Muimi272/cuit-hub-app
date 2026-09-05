import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { syncAndroidIcons } from "../scripts/sync-android-icons.mjs";

test("custom Android icons replace generated launcher resources", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cuit-android-icons-"));
  const resourceRoot = path.join(fixtureRoot, "res");

  try {
    const defaults = [
      "drawable/ic_launcher_foreground.xml",
      "mipmap-hdpi/ic_launcher.webp",
      "mipmap-anydpi-v26/ic_launcher_round.webp"
    ];
    for (const relative of defaults) {
      const file = path.join(resourceRoot, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "default Tauri resource");
    }

    const sourceRoot = path.resolve("src-tauri/icons/android");
    syncAndroidIcons({ sourceRoot, resourceRoot });

    for (const relative of defaults) {
      assert.equal(fs.existsSync(path.join(resourceRoot, relative)), false);
    }

    const sourceFiles = fs.readdirSync(sourceRoot, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile());
    assert.equal(sourceFiles.length, 18);

    for (const entry of sourceFiles) {
      const source = path.join(entry.parentPath, entry.name);
      const relative = path.relative(sourceRoot, source);
      assert.deepEqual(
        fs.readFileSync(path.join(resourceRoot, relative)),
        fs.readFileSync(source),
        `${relative} was not copied exactly`
      );
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true });
  }
});
