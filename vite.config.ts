import {cp} from 'node:fs/promises';
import path from 'node:path';
import {defineConfig, type Plugin} from 'vite';
import {reactRouter} from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';

function copyMerchAssets(): Plugin {
  return {
    name: 'copy-merch-assets',
    async writeBundle() {
      await cp(path.resolve('assets'), path.resolve('build/client/assets'), {
        recursive: true,
      });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), copyMerchAssets()],
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    // Allow a strict Content-Security-Policy
    // without inlining assets as base64:
    assetsInlineLimit: 0,
  },
  ssr: {
    optimizeDeps: {
      /**
       * Include dependencies here if they throw CJS<>ESM errors.
       * For example, for the following error:
       *
       * > ReferenceError: module is not defined
       * >   at /Users/.../node_modules/example-dep/index.js:1:1
       *
       * Include 'example-dep' in the array below.
       * @see https://vitejs.dev/config/dep-optimization-options
       */
      include: [
        'react-router > set-cookie-parser',
        'react-router > cookie',
        'react-router',
      ],
    },
  },
});
