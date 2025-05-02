import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import { ipcRenderer } from 'electron';
import { getDesktopEntries } from './linux.js';
import { suggestAppConfigs } from './index.js';
import crypto from 'crypto';

// Mock dependencies
vi.mock('node:os');
vi.mock('electron', () => ({
    ipcRenderer: {
        invoke: vi.fn(),
    },
}));
vi.mock('./linux.js');
vi.mock('crypto');

describe('suggestAppConfigs', () => {
    const mockIpcRenderer = vi.mocked(ipcRenderer);
    const mockGetDesktopEntries = vi.mocked(getDesktopEntries);
    const mockOsPlatform = vi.mocked(os.platform);
    const mockRandomUUID = vi.mocked(crypto.randomUUID);

    beforeEach(() => {
        vi.resetAllMocks();
        // Mock console methods BEFORE each test
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'info').mockImplementation(() => {});
        vi.spyOn(console, 'debug').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        // Default mocks
        mockOsPlatform.mockReturnValue('linux');
        mockRandomUUID.mockReturnValue('mock-uuid-1'); // Default mock UUID
    });

    afterEach(() => {
        vi.restoreAllMocks(); // This restores the console mocks too
    });

    it('should deduplicate suggestions based on application name, keeping the first encountered', async () => {
        const mockEntries = [
            // First entry for "App One"
            {
                entry: {
                    name: 'App One',
                    exec: '/usr/bin/app-one-v1',
                    icon: 'icon-one',
                },
                status: 'valid' as const,
            },
            // Duplicate name "App One", different exec/icon
            {
                entry: {
                    name: 'App One',
                    exec: '/usr/bin/app-one-v2',
                    icon: 'icon-one-alt',
                },
                status: 'valid' as const,
            },
            // Unique entry "App Two"
            {
                entry: {
                    name: 'App Two',
                    exec: '/usr/bin/app-two',
                    icon: 'icon-two',
                },
                status: 'valid' as const,
            },
            // Hidden entry, should be filtered out before deduplication
            {
                entry: {
                    name: 'Hidden App',
                    exec: '/usr/bin/hidden',
                    icon: 'icon-hidden',
                },
                status: 'hidden' as const,
            },
            // Non-executable entry, should be filtered out before deduplication
            {
                entry: { name: 'No Exec App', icon: 'icon-no-exec' },
                status: 'non-executable' as const,
            },
        ];
        mockGetDesktopEntries.mockResolvedValue(mockEntries);

        mockRandomUUID
            .mockReturnValueOnce('uuid-app-one-first') // For the first "App One"
            .mockReturnValueOnce('uuid-app-two'); // For "App Two"

        const expectedIconIdentifiers = ['icon-one', 'icon-two']; // Corrected: 'icon-one-alt' is removed by dedupe
        const mockIconData = {
            'icon-one': 'data:image/png;base64,icon1',
            'icon-two': 'data:image/png;base64,icon2',
        };
        mockIpcRenderer.invoke.mockResolvedValue(mockIconData);

        const suggestions = await suggestAppConfigs();

        // Assertions
        expect(getDesktopEntries).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith(
            'get-freedesktop-icons',
            expectedIconIdentifiers,
            undefined,
            256,
        );

        expect(suggestions).toHaveLength(2);
        expect(suggestions).toEqual([
            {
                id: 'uuid-app-one-first',
                name: 'App One',
                launchCommand: '/usr/bin/app-one-v1',
                icon: 'data:image/png;base64,icon1',
            },
            {
                id: 'uuid-app-two',
                name: 'App Two',
                launchCommand: '/usr/bin/app-two',
                icon: 'data:image/png;base64,icon2',
            },
        ]);
    });
});
