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

        // Mock UUID generation to be predictable
        mockRandomUUID
            .mockReturnValueOnce('uuid-app-one-first')
            .mockReturnValueOnce('uuid-app-one-second-ignored') // This one should be ignored due to dedupe
            .mockReturnValueOnce('uuid-app-two');

        // Mock icon fetching - only unique icons from *valid* entries should be requested
        const expectedIconIdentifiers = ['icon-one', 'icon-one-alt', 'icon-two'];
        const mockIconData = {
            'icon-one': 'data:image/png;base64,icon1',
            'icon-one-alt': 'data:image/png;base64,icon1alt',
            'icon-two': 'data:image/png;base64,icon2',
        };
        mockIpcRenderer.invoke.mockResolvedValue(mockIconData);

        const suggestions = await suggestAppConfigs();

        // Assertions
        expect(getDesktopEntries).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith(
            'get-freedesktop-icon',
            expectedIconIdentifiers, // Should request icons for both "App One" initially
            undefined,
            256,
        );

        // Check the final deduplicated suggestions
        expect(suggestions).toHaveLength(2);
        expect(suggestions).toEqual([
            // The *first* "App One" should be kept
            {
                id: 'uuid-app-one-first',
                name: 'App One',
                launchCommand: '/usr/bin/app-one-v1',
                icon: 'data:image/png;base64,icon1',
            },
            // "App Two" should be kept
            {
                id: 'uuid-app-two',
                name: 'App Two',
                launchCommand: '/usr/bin/app-two',
                icon: 'data:image/png;base64,icon2',
            },
        ]);

        // Check console logs for filtering and deduplication messages
        expect(console.info).toHaveBeenCalledWith(
            expect.stringContaining('Suggesting apps using Linux strategy'),
        );
        expect(console.info).toHaveBeenCalledWith(
            expect.stringContaining('Found 5 raw desktop entries'),
        );
        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining(
                'Skipping hidden entry: Hidden App (NoDisplay=true)',
            ),
        );
        expect(console.info).toHaveBeenCalledWith(
            expect.stringContaining('Skipping non-executable entry: No Exec App'),
        );
        expect(console.info).toHaveBeenCalledWith(
            expect.stringContaining(
                'Found 3 potentially valid entries. Need to fetch icons for 3 unique identifiers.',
            ),
        );
        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining(
                'Duplicate suggestion found for name "App One". Keeping the first one encountered.',
            ),
        );
        expect(console.info).toHaveBeenCalledWith(
            expect.stringContaining(
                'Returning 2 processed and deduplicated Linux suggestions.',
            ),
        );
    });

    // Add more tests later for other platforms, error handling, icon fetching edge cases etc.
});
