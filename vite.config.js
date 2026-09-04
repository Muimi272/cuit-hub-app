import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  publicDir: false,
  build: {
    outDir: "../dist",
    emptyOutDir: true
  },
  server: {
    strictPort: true
  }
});
