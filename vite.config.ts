import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'local-review-preview-flag',
      apply: 'serve',
      config() {
        return {
          define: {
            'import.meta.env.VITE_REVIEW_UI_PREVIEW': JSON.stringify('1'),
          },
        };
      },
    },
    {
      name: 'keep-local-review-preview-out-of-build',
      apply: 'build',
      generateBundle(_options, bundle) {
        for (const fileName of Object.keys(bundle)) {
          if (fileName.includes('local-preview')) {
            throw new Error('local-preview must not enter the production build');
          }
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
  build: {
    reportCompressedSize: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },
});
