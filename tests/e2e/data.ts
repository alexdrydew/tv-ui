import type { AppConfig } from '@app/types';

export const SINGLE_APP: AppConfig[] = [
    {
        id: 'test-app-1',
        name: 'Test App',
        launchCommand: 'sleep 1',
        icon: undefined,
    },
];
export const MINIMAL_PNG_DATA = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
);

// Minimal valid SVG (1x1 transparent pixel) as a string
export const MINIMAL_SVG_DATA = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"><rect width="1" height="1" fill="none"/></svg>`;
