/**
 * Builds and packages the extension with CRXJS and enables example logging by default.
 */
import { crx } from '@crxjs/vite-plugin';
import { defineConfig } from 'vite';
import zip from 'vite-plugin-zip-pack';
import manifest from './manifest.config';

export default defineConfig(({ command }) => ({
  plugins: [
    crx({ manifest }),
    zip({ inDir: 'dist/prod', outDir: 'dist', outFileName: 'prod.zip' }),
  ],
  build: { outDir: command === 'serve' ? 'dist/dev' : 'dist/prod' },
  define: { 'import.meta.env.LOGGING': JSON.stringify('true') },
}));
