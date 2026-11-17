
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // Railway serves the site at the domain root. GitHub Pages overrides this base.
    base: process.env.VITE_BASE_PATH || '/',

    plugins: [
      react(),
      tailwindcss(),

      // Preserve unbundled images and other source assets.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build' as const,

        closeBundle(error?: Error): void {
          if (error) {
            return;
          }

          const distDir = path.resolve(import.meta.dirname, 'dist');
          const srcAssets = path.resolve(
            import.meta.dirname,
            'src/assets'
          );

          const distAssets = path.resolve(
            distDir,
            'src/assets'
          );

          if (
            fs.existsSync(distDir) &&
            fs.existsSync(srcAssets)
          ) {
            fs.cpSync(srcAssets, distAssets, {
              recursive: true,
              force: true,
            });
          }
        },
      },
    ],

    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },

    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },

    server: {
      // Preserve Google AI Studio HMR configuration.
      hmr: process.env.DISABLE_HMR !== 'true',

      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {},
    },
  };
});
