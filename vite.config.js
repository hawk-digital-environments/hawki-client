import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import dtsPlugin from 'vite-plugin-dts';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'HawkiClient',
            fileName: 'hawki-client'
        },
        // do not minify if watching for changes
        minify: process.argv.includes('--watch') ? false : 'esbuild',
    },
    resolve: {
        alias: {
            '@lib': resolve(__dirname, 'src')
        }
    },
    plugins: [dtsPlugin()]
});
