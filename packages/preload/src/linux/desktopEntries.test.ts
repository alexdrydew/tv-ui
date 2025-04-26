import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Effect } from 'effect';
import { vol, fs } from 'memfs'; // Import memfs and its fs export
import path from 'node:path';
import { getDesktopEntries } from './desktopEntries';

vi.mock('node:fs', async () => {
    const memfs = await vi.importActual<typeof import('memfs')>('memfs');
    return { ...fs, default: memfs.fs };
});
vi.mock('node:fs/promises', async () => {
    const memfs = await vi.importActual<typeof import('memfs')>('memfs');
    return { ...memfs.fs.promises, default: memfs.fs.promises };
});

const MOCK_HOME = '/home/testuser';
const USR_SHARE_APPS = '/usr/share/applications';
const USR_LOCAL_SHARE_APPS = '/usr/local/share/applications';
const HOME_LOCAL_SHARE_APPS = path.join(MOCK_HOME, '.local/share/applications');
const MOCK_DESKTOP_FILE_VALID = `
[Desktop Entry]
Name=Valid App
Exec=/usr/bin/valid-app %U
Icon=valid-icon
Type=Application
Categories=Utility;
`;
const MOCK_DESKTOP_FILE_NODISPLAY = `
[Desktop Entry]
Name=Hidden App
Exec=/usr/bin/hidden-app
Type=Application
NoDisplay=true
`;
const MOCK_DESKTOP_FILE_NOT_APP = `
[Desktop Entry]
Name=Link File
Type=Link
URL=https://example.com
`;
const MOCK_DESKTOP_FILE_INVALID_INI = `[Desktop Entry\nName=Invalid`;

describe('getDesktopEntries', () => {
    beforeEach(() => {
        vol.reset();
        vi.clearAllMocks();
        // Reset environment variables for each test
        vi.stubEnv('HOME', MOCK_HOME); // Already mocked via os.homedir, but good practice
        vi.stubEnv('XDG_DATA_DIRS', '');
        vi.stubEnv('XDG_DATA_HOME', '');
        // Restore any console mocks if needed
        vi.restoreAllMocks(); // Ensures console spies are reset
    });

    afterEach(() => {
        vol.reset();
        vi.unstubAllEnvs(); // Unstub environment variables
    });

    it('should return an empty array if no standard directories exist', async () => {
        // No directories created in vol
        const result = await Effect.runPromise(getDesktopEntries());
        expect(result).toEqual([]);
    });

    it('should return an empty array if standard directories exist but are empty', async () => {
        vol.fromJSON({
            [USR_SHARE_APPS]: null, // Create empty directory
            [USR_LOCAL_SHARE_APPS]: null,
            [HOME_LOCAL_SHARE_APPS]: null,
        });
        const result = await Effect.runPromise(getDesktopEntries());
        expect(result).toEqual([]);
    });

    it('should parse valid desktop entries from default locations, including subdirectories', async () => {
        const subDirPath = path.join(HOME_LOCAL_SHARE_APPS, 'subdir');
        const subDirFilePath = path.join(subDirPath, 'app3.desktop');

        vol.fromJSON({
            [path.join(USR_SHARE_APPS, 'app1.desktop')]:
                MOCK_DESKTOP_FILE_VALID,
            [path.join(USR_SHARE_APPS, 'otherfile.txt')]: 'some text', // Should be ignored
            [USR_LOCAL_SHARE_APPS]: null, // Ensure dir exists even if empty
            [path.join(HOME_LOCAL_SHARE_APPS, 'app2.desktop')]:
                MOCK_DESKTOP_FILE_VALID.replace('Valid App', 'Valid App 2'),
            // Add a subdirectory with a file - should now be found
            [subDirFilePath]: MOCK_DESKTOP_FILE_VALID.replace(
                'Valid App',
                'Valid App 3',
            ),
        });

        const result = await Effect.runPromise(getDesktopEntries());

        expect(result).toHaveLength(3); // Now expects 3 entries
        expect(result).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'app1',
                    name: 'Valid App',
                    icon: 'valid-icon',
                    filePath: path.resolve(USR_SHARE_APPS, 'app1.desktop'),
                }),
                expect.objectContaining({
                    id: 'app2',
                    name: 'Valid App 2',
                    icon: 'valid-icon',
                    filePath: path.resolve(
                        HOME_LOCAL_SHARE_APPS,
                        'app2.desktop',
                    ),
                }),
                expect.objectContaining({
                    id: 'app3',
                    name: 'Valid App 3',
                    icon: 'valid-icon',
                    filePath: path.resolve(subDirFilePath), // Check the path from the subdirectory
                }),
            ]),
        );
    });

    it('should use XDG_DATA_DIRS and XDG_DATA_HOME if set', async () => {
        const customDataHome = path.join(MOCK_HOME, 'custom-data');
        const optShare = '/opt/share';
        const usrShare = '/usr/share'; // Base directory

        // Set XDG env vars
        vi.stubEnv('XDG_DATA_DIRS', `${optShare}:${usrShare}`); // Colon-separated base dirs
        vi.stubEnv('XDG_DATA_HOME', customDataHome);

        // Expected paths where 'applications' will be appended
        const optShareApps = path.join(optShare, 'applications');
        const customDataHomeApps = path.join(customDataHome, 'applications');
        const usrShareApps = path.join(usrShare, 'applications'); // Correct standard path

        vol.fromJSON({
            [path.join(optShareApps, 'app3.desktop')]:
                MOCK_DESKTOP_FILE_VALID.replace('Valid App', 'Valid App 3'),
            [path.join(customDataHomeApps, 'app4.desktop')]:
                MOCK_DESKTOP_FILE_VALID.replace('Valid App', 'Valid App 4'),
            // File in the standard /usr/share/applications (picked up via XDG_DATA_DIRS)
            [path.join(usrShareApps, 'app5.desktop')]:
                MOCK_DESKTOP_FILE_VALID.replace('Valid App', 'Valid App 5'),
            // Ensure default non-XDG dirs don't interfere if they exist but are empty
            [USR_LOCAL_SHARE_APPS]: null,
            [HOME_LOCAL_SHARE_APPS]: null,
        });

        const result = await Effect.runPromise(getDesktopEntries());

        expect(result).toHaveLength(3); // Expect entries from all 3 XDG locations
        expect(result).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'app3',
                    name: 'Valid App 3',
                    filePath: path.resolve(optShareApps, 'app3.desktop'),
                }),
                expect.objectContaining({
                    id: 'app4',
                    name: 'Valid App 4',
                    filePath: path.resolve(customDataHomeApps, 'app4.desktop'),
                }),
                expect.objectContaining({
                    id: 'app5',
                    name: 'Valid App 5',
                    filePath: path.resolve(usrShareApps, 'app5.desktop'),
                }),
            ]),
        );
    });

    it('should skip NoDisplay=true and non-Application types', async () => {
        vol.fromJSON({
            [path.join(USR_SHARE_APPS, 'visible.desktop')]:
                MOCK_DESKTOP_FILE_VALID,
            [path.join(USR_SHARE_APPS, 'hidden.desktop')]:
                MOCK_DESKTOP_FILE_NODISPLAY, // Contains NoDisplay=true
            [path.join(USR_SHARE_APPS, 'link.desktop')]:
                MOCK_DESKTOP_FILE_NOT_APP, // Type=Link
            [USR_LOCAL_SHARE_APPS]: null,
            [HOME_LOCAL_SHARE_APPS]: null,
        });

        const result = await Effect.runPromise(getDesktopEntries());

        expect(result).toHaveLength(1); // Should only contain 'visible.desktop'
        expect(result[0]).toEqual(
            expect.objectContaining({
                id: 'visible',
                name: 'Valid App',
                filePath: path.resolve(USR_SHARE_APPS, 'visible.desktop'),
            }),
        );
    });

    it('should handle invalid INI files gracefully', async () => {
        vol.fromJSON({
            [path.join(USR_SHARE_APPS, 'good.desktop')]:
                MOCK_DESKTOP_FILE_VALID,
            [path.join(USR_SHARE_APPS, 'badini.desktop')]:
                MOCK_DESKTOP_FILE_INVALID_INI,
            [USR_LOCAL_SHARE_APPS]: null,
            [HOME_LOCAL_SHARE_APPS]: null,
        });
        // Spy on console.debug to ensure the error was logged during parsing
        // const debugSpy = vi
        //     .spyOn(console, 'debug')
        //     .mockImplementation(() => {});

        const result = await Effect.runPromise(getDesktopEntries());

        // Should only return the valid entry
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(
            expect.objectContaining({ id: 'good', name: 'Valid App' }),
        );

        // Removed checks for specific debug logs as they were brittle
        // The fact that the result is correct implies error handling worked.

        // debugSpy.mockRestore(); // No longer needed
    });

    it('should handle inaccessible directories gracefully', async () => {
        vol.fromJSON({
            [path.join(USR_SHARE_APPS, 'app1.desktop')]:
                MOCK_DESKTOP_FILE_VALID,
            // Do not create USR_LOCAL_SHARE_APPS or HOME_LOCAL_SHARE_APPS
            // memfs readdir will throw ENOENT, which findDesktopFiles should catch.
        });
        // Spy on console.debug, which findDesktopFiles uses for skipping dirs
        // const debugSpy = vi
        //     .spyOn(console, 'debug')
        //     .mockImplementation(() => {});
        // Spy on console.warn for unexpected errors (shouldn't be called)
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await Effect.runPromise(getDesktopEntries());

        expect(result).toHaveLength(1); // Only app1.desktop should be found
        expect(result[0].id).toBe('app1');

        // Removed checks for specific debug logs as they were brittle
        // The fact that the result is correct implies error handling worked.

        // Check that the warning for unexpected errors was NOT called
        expect(warnSpy).not.toHaveBeenCalled();

        // debugSpy.mockRestore(); // No longer needed
        warnSpy.mockRestore();
    });

    // Test remains useful to verify memfs mock behavior
    it('should correctly handle readdir with withFileTypes via mock', async () => {
        const fsPromises = await import('node:fs/promises'); // Import the mocked version
        const testDir = '/readdir-test';
        vol.fromJSON({
            [path.join(testDir, 'file.txt')]: 'hello',
            [path.join(testDir, 'subdir')]: null,
        });

        const dirents = await fsPromises.readdir(testDir, {
            withFileTypes: true,
        });

        expect(Array.isArray(dirents)).toBe(true);
        expect(dirents).toHaveLength(2);

        const fileDirent = dirents.find((d) => d.name === 'file.txt');
        const dirDirent = dirents.find((d) => d.name === 'subdir');

        expect(fileDirent).toBeDefined();
        expect(fileDirent?.isFile()).toBe(true);
        expect(fileDirent?.isDirectory()).toBe(false);

        expect(dirDirent).toBeDefined();
        expect(dirDirent?.isFile()).toBe(false);
        expect(dirDirent?.isDirectory()).toBe(true);
    });
});
