    /// <reference types="vitest" />
    import { defineConfig } from 'vite';
    import tsconfigPaths from 'vite-tsconfig-paths';

    export default defineConfig({
        plugins: [tsconfigPaths()],
        test: {
            globals: true,
            environment: 'node', // Set environment to node
            // Optionally clear mocks between tests
            clearMocks: true,
            // Setup files if needed in the future
            // setupFiles: ['./src/test/setup.ts'],
            coverage: {
                provider: 'v8', // or 'istanbul'
                reporter: ['text', 'json', 'html'],
            },
            alias: {
                // Ensure aliases match tsconfig if needed, though tsconfigPaths should handle it
                // '#src/': new URL('./src/', import.meta.url).pathname,
            },
        },
    });
