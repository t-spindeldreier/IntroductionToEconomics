import { defineConfig } from 'vite';

// base './' makes every asset path relative, so the same build works at
// https://<user>.github.io/<repo>/ or at any other path without configuration.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  server: { port: 5173 },
});
