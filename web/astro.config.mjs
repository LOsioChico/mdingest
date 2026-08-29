import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  output: 'static',
  site: 'https://mdingest.knightker.workers.dev',
  integrations: [
    react(),
    sitemap(),
  ],
  build: {
    format: 'directory',
    inlineStylesheets: 'always',
  },
  devToolbar: { enabled: false },
  vite: {
    server: {
      fs: {
        strict: false,
      },
    },
    resolve: {
      alias: {
        '@shared': fileURLToPath(new URL('../shared/', import.meta.url)),
      },
    },
  },
});
