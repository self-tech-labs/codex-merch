import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {defineConfig, type Plugin} from 'vite';
import {reactRouter} from '@react-router/dev/vite';
import products from './merch/products.json';
import {merchantPilot} from './app/lib/merchant-policy';
import {validateCatalog} from './scripts/validate-catalog.mjs';

function copyMerchAssets(): Plugin {
  return {
    name: 'copy-merch-assets',
    async buildStart() {
      const {errors} = await validateCatalog();
      if (errors.length) this.error(errors.join('\n'));

      const pilot = products.find(
        (product) => product.slug === merchantPilot.productSlug,
      );
      if (!pilot) this.error('Approved merchant pilot product is missing');
      const pilotRevision = createHash('sha256')
        .update(JSON.stringify(pilot))
        .digest('hex');
      if (pilotRevision !== merchantPilot.approvedProductRevision) {
        this.error('Merchant pilot product changed after sign-off');
      }
      const referencedPilotAssets = new Set([
        pilot.assets.artwork,
        ...pilot.assets.printFiles.map((file) => file.path),
        ...pilot.assets.mockups,
        ...(pilot.assets.customerPhotos || []),
      ]);
      const approvedPilotAssets = new Set(
        Object.keys(merchantPilot.approvedAssetSha256),
      );
      if (
        referencedPilotAssets.size !== approvedPilotAssets.size ||
        [...referencedPilotAssets].some(
          (asset) => !approvedPilotAssets.has(asset),
        )
      ) {
        this.error('Merchant pilot asset set changed after sign-off');
      }
      for (const asset of referencedPilotAssets) {
        const digest = createHash('sha256')
          .update(await readFile(path.resolve(asset)))
          .digest('hex');
        const expected =
          merchantPilot.approvedAssetSha256[
            asset as keyof typeof merchantPilot.approvedAssetSha256
          ];
        if (digest !== expected) {
          this.error(`Merchant pilot asset changed after sign-off: ${asset}`);
        }
      }
    },
    async writeBundle() {
      const referenced = new Set<string>();
      for (const product of products) {
        if (product.workflow.status === 'draft' || product.workflow.status === 'archived') continue;
        referenced.add(product.assets.artwork);
        product.assets.mockups.forEach((asset) => referenced.add(asset));
        product.assets.customerPhotos?.forEach((asset) => referenced.add(asset));
        // Provider sync happens after a candidate deployment, so generated
        // products must expose immutable print files before final publication.
        product.production.placements.forEach((placement) => referenced.add(placement.file));
      }

      await Promise.all(
        [...referenced].map(async (asset) => {
          const source = path.resolve(asset);
          const destination = path.resolve('build/client', asset);
          if (!source.startsWith(`${path.resolve('assets')}${path.sep}`)) {
            throw new Error(`Refusing to publish unsafe merch asset: ${asset}`);
          }
          await mkdir(path.dirname(destination), {recursive: true});
          await copyFile(source, destination);
        }),
      );
    },
  };
}

export default defineConfig({
  plugins: [reactRouter(), copyMerchAssets()],
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
