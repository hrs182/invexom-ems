import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Serverless browser demo (VITE_BROWSER_DEMO=1): the real EMS handlers run
// in-page against sql.js. Node builtins used by the services are aliased to
// browser shims, and electron/services/database.js is swapped for the sql.js
// backend. The branch in src/lib/ipc.ts is DCE'd out of all other builds.
const isBrowserDemo = process.env.VITE_BROWSER_DEMO === '1';
const shim = (name: string) => path.resolve(__dirname, 'web/shims', `${name}.ts`);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Swap the better-sqlite3 database module for the sql.js backend.
    // (resolve.alias can't express this as a regex in Vite 8's native
    // binding, so a tiny resolveId plugin does it.)
    ...(isBrowserDemo
      ? [
          {
            name: 'ems-browser-db-swap',
            enforce: 'pre' as const,
            resolveId(source: string, importer: string | undefined) {
              if (!importer) return null;
              if (source === './database.js' || source.endsWith('/database.js')) {
                const resolved = path.resolve(path.dirname(importer), source);
                if (resolved.endsWith(path.join('electron', 'services', 'database.js'))) {
                  return path.resolve(__dirname, 'web/browser-db/database-browser.ts');
                }
              }
              return null;
            },
          },
          // Ship an .htaccess so Apache serves .wasm with the correct MIME
          // type (enables streaming WebAssembly compilation).
          {
            name: 'ems-demo-htaccess',
            async writeBundle() {
              const fs = await import('node:fs');
              const src = path.resolve(__dirname, 'web/htaccess-demo');
              const dest = path.resolve(__dirname, 'dist-static/.htaccess');
              fs.copyFileSync(src, dest);
            },
          },
        ]
      : []),
  ],
  base: './',
  define: {
    // Baked-in build timestamp — surfaced in startup diagnostics.
    __EMS_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    // Browser demo runs without Electron/Node: paths live under /browser.
    ...(isBrowserDemo ? { 'process.env.EMS_WEB_DATA_DIR': JSON.stringify('/browser') } : {}),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
      // Node builtins used by the services -> browser shims (demo build only).
      ...(isBrowserDemo
        ? {
            'node:fs': shim('fs'),
            'node:path': shim('path'),
            'node:url': shim('url'),
            'node:crypto': shim('crypto'),
            // bare 'crypto' (used by scryptsy) -> same shim
            crypto: shim('crypto'),
            'node:child_process': shim('child_process'),
            'node:os': shim('os'),
            'node:https': shim('https'),
            'node:module': shim('module'),
          }
        : {}),
    },
  },
  build: {
    outDir: isBrowserDemo ? 'dist-static' : 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
