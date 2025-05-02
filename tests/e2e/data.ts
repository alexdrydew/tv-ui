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
