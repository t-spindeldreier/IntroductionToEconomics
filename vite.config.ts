import { defineConfig } from 'vite';

// base './' makes every asset path relative, so the same build works at
// https://<user>.github.io/<repo>/ or at any other path without configuration.
// The build time is the version: shown on the host page, and written to version.json
// so an open page can notice that it is older than what is deployed (see main.ts).
const BUILD = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [{
    name: 'version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) });
    },
  }],
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  server: { port: 5173 },
});
