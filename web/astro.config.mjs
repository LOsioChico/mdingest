import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  output: 'static',
  integrations: [react()],
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
