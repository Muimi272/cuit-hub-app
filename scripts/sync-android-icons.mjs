import fs from "node:fs";
import path from "node:path";

const launcherNames = new Set([
  "ic_launcher",
  "ic_launcher_background",
  "ic_launcher_foreground",
  "ic_launcher_round"
]);

function filesBelow(root) {
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

export function syncAndroidIcons({ sourceRoot, resourceRoot }) {
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Android icon source directory is missing: ${sourceRoot}`);
  }

  fs.mkdirSync(resourceRoot, { recursive: true });
  const sourceFiles = filesBelow(sourceRoot);
  const desiredPaths = new Set(sourceFiles.map((file) =>
    path.relative(sourceRoot, file).split(path.sep).join("/")
  ));

  for (const file of filesBelow(resourceRoot)) {
    const relative = path.relative(resourceRoot, file).split(path.sep).join("/");
    const stem = path.parse(file).name;
    if (launcherNames.has(stem) && !desiredPaths.has(relative)) {
      fs.rmSync(file);
    }
  }

  for (const source of sourceFiles) {
    const relative = path.relative(sourceRoot, source);
    const destination = path.join(resourceRoot, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);

    if (!fs.readFileSync(source).equals(fs.readFileSync(destination))) {
      throw new Error(`Android icon verification failed after copying ${relative}`);
    }
  }

  console.log(`Installed and verified ${sourceFiles.length} custom Android icon resources.`);
}
