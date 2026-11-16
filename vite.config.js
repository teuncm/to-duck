import { defineConfig } from "vite";

export default defineConfig({
  // Work on a custom domain, a GitHub repository subpath, or a local preview.
  base: "./",
  server: {
    port: 5174,
    strictPort: true,
  },
});
