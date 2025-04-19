import { defineConfig } from 'vite';
import { spawn } from 'child_process';
import electronPath from 'electron';

export default defineConfig({
    build: {
        ssr: true,
        sourcemap: 'inline',
        outDir: 'dist',
        assetsDir: '.',
        lib: {
            entry: 'src/index.ts',
            formats: ['es'],
        },
        rollupOptions: {
            output: {
                entryFileNames: '[name].js',
            },
        },
        emptyOutDir: true,
        reportCompressedSize: false,
    },
    plugins: [handleHotReload()],
});

/**
 * Implement Electron app reload when some file was changed
 * @return {import('vite').Plugin}
 */
function handleHotReload() {
    /** @type {import('vite').ViteDevServer|null} */
    let rendererWatchServer = null;

    return {
        name: '@app/preload-process-hot-reload',

        config(config, env) {
            if (env.mode !== 'development') {
                return;
            }

            const rendererWatchServerProvider = config.plugins.find(
                (p) => p.name === '@app/renderer-watch-server-provider',
            );
            if (!rendererWatchServerProvider) {
                throw new Error('Renderer watch server provider not found');
            }

            rendererWatchServer =
                rendererWatchServerProvider.api.provideRendererWatchServer();

            return {
                build: {
                    watch: {},
                },
            };
        },

        writeBundle() {
            if (!rendererWatchServer) {
                return;
            }

            rendererWatchServer.ws.send({
                type: 'full-reload',
            });
        },
    };
}
