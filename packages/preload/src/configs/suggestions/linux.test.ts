import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { vol, fs } from 'memfs';
import path from 'node:path';
import { getDesktopEntries } from './linux.js'; // Changed import path

vi.mock('node:fs', async () => {
    const memfs = await vi.importActual<typeof import('memfs')>('memfs');
    // Ensure symlinkSync is part of the mock if needed, though promises version is preferred
    return { ...memfs.fs, default: memfs.fs };
});
vi.mock('node:fs/promises', async () => {
    const memfs = await vi.importActual<typeof import('memfs')>('memfs');
    // Ensure symlink is part of the promises mock
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
// Syntactically valid INI, but missing the required [Desktop Entry] section for schema validation
const MOCK_DESKTOP_FILE_INVALID_SCHEMA = `
[Some Other Section]
Name=Invalid Schema App
Exec=/usr/bin/invalid
`;

describe('getDesktopEntries', () => {
    beforeEach(() => {
        vol.reset();
        vi.clearAllMocks();
        vi.stubEnv('HOME', MOCK_HOME);
        vi.stubEnv('XDG_DATA_DIRS', '');
        vi.stubEnv('XDG_DATA_HOME', '');
        // Mock console methods BEFORE each test
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'info').mockImplementation(() => {});
        vi.spyOn(console, 'debug').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {}); // Mock error too if used by Effect logging
    });

    afterEach(() => {
        vol.reset();
        vi.unstubAllEnvs();
        vi.restoreAllMocks(); // This restores the console mocks too
    });

    it('should return an empty array if no standard directories exist', async () => {
        const result = await getDesktopEntries();
        expect(result).toEqual([]);
        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('Searching for desktop entries'),
        );
    });

    it('should return an empty array if standard directories exist but are empty', async () => {
        vol.fromJSON({
            [USR_SHARE_APPS]: null,
            [USR_LOCAL_SHARE_APPS]: null,
            [HOME_LOCAL_SHARE_APPS]: null,
        });
        const result = await getDesktopEntries();
        expect(result).toEqual([]);
        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('Searching for desktop entries'),
        );
    });

    it('should parse valid desktop entries from default locations, including subdirectories', async () => {
        const subDirPath = path.join(HOME_LOCAL_SHARE_APPS, 'subdir');
        const subDirFilePath = path.join(subDirPath, 'app3.desktop');

        vol.fromJSON({
            [path.join(USR_SHARE_APPS, 'app1.desktop')]:
                MOCK_DESKTOP_FILE_VALID,
            [path.join(USR_SHARE_APPS, 'otherfile.txt')]: 'some text',
            [USR_LOCAL_SHARE_APPS]: null,
            [path.join(HOME_LOCAL_SHARE_APPS, 'app2.desktop')]:
                MOCK_DESKTOP_FILE_VALID.replace('Valid App', 'Valid App 2'),
            [subDirFilePath]: MOCK_DESKTOP_FILE_VALID.replace(
                'Valid App',
                'Valid App 3',
            ),
        });

        const result = await getDesktopEntries();

        expect(result).toHaveLength(3);
        expect(result).toEqual(
            expect.arrayContaining([
                {
                    entry: {
                        name: 'Valid App',
                        icon: 'valid-icon',
                        exec: '/usr/bin/valid-app %U',
                    },
                    status: 'valid',
                },
                {
                    entry: {
                        name: 'Valid App 2',
                        icon: 'valid-icon',
                        exec: '/usr/bin/valid-app %U',
                    },
                    status: 'valid',
                },
                {
                    entry: {
                        name: 'Valid App 3',
                        icon: 'valid-icon',
                        exec: '/usr/bin/valid-app %U',
                    },
                    status: 'valid',
                },
            ]),
        );
        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('Searching for desktop entries'),
        );
    });

    it('should use XDG_DATA_DIRS and XDG_DATA_HOME if set', async () => {
        const customDataHome = path.join(MOCK_HOME, 'custom-data');
        const optShare = '/opt/share';
        const usrShare = '/usr/share';

        vi.stubEnv('XDG_DATA_DIRS', `${optShare}:${usrShare}`);
        vi.stubEnv('XDG_DATA_HOME', customDataHome);

        const optShareApps = path.join(optShare, 'applications');
        const customDataHomeApps = path.join(customDataHome, 'applications');
        const usrShareApps = path.join(usrShare, 'applications');

        vol.fromJSON({
            [path.join(optShareApps, 'app3.desktop')]:
                MOCK_DESKTOP_FILE_VALID.replace('Valid App', 'Valid App 3'),
            [path.join(customDataHomeApps, 'app4.desktop')]:
                MOCK_DESKTOP_FILE_VALID.replace('Valid App', 'Valid App 4'),
            [path.join(usrShareApps, 'app5.desktop')]:
                MOCK_DESKTOP_FILE_VALID.replace('Valid App', 'Valid App 5'),
            // Standard dirs should be ignored when XDG vars are set
            [path.join(USR_LOCAL_SHARE_APPS, 'ignored1.desktop')]:
                MOCK_DESKTOP_FILE_VALID.replace('Valid App', 'Ignored 1'),
            [path.join(HOME_LOCAL_SHARE_APPS, 'ignored2.desktop')]:
                MOCK_DESKTOP_FILE_VALID.replace('Valid App', 'Ignored 2'),
        });

        const result = await getDesktopEntries();

        expect(result).toHaveLength(3);
        expect(result).toEqual(
            expect.arrayContaining([
                {
                    entry: {
                        name: 'Valid App 3',
                        exec: '/usr/bin/valid-app %U',
                        icon: 'valid-icon',
                    },
                    status: 'valid',
                },
                {
                    entry: {
                        name: 'Valid App 4',
                        exec: '/usr/bin/valid-app %U',
                        icon: 'valid-icon',
                    },
                    status: 'valid',
                },
                {
                    entry: {
                        name: 'Valid App 5',
                        exec: '/usr/bin/valid-app %U',
                        icon: 'valid-icon',
                    },
                    status: 'valid',
                },
            ]),
        );
        // Ensure ignored files were not picked up
        expect(result).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ entry: { name: 'Ignored 1' } }),
                expect.objectContaining({ entry: { name: 'Ignored 2' } }),
            ]),
        );
        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('Searching for desktop entries'),
        );
    });

    it('should find desktop entries in deeply nested directories within XDG paths', async () => {
        const customDataHome = path.join(MOCK_HOME, 'custom-data');
        const optShare = '/opt/share';
        const usrShareBase = '/usr/share'; // Use the base directory

        // Set XDG env vars - this should *replace* the defaults
        vi.stubEnv('XDG_DATA_DIRS', `${optShare}:${usrShareBase}`);
        vi.stubEnv('XDG_DATA_HOME', customDataHome);

        // Define paths based on XDG vars
        const optShareApps = path.join(optShare, 'applications');
        const customDataHomeApps = path.join(customDataHome, 'applications');
        const usrShareApps = path.join(usrShareBase, 'applications'); // Correct base for search

        // Define nested paths for placing files
        const usrShareAppsNested = path.join(
            usrShareApps, // Use the correct base path
            'nested1',
            'nested2',
        );
        const customDataHomeAppsNested = path.join(
            customDataHomeApps,
            'another-level',
        );
        // Define paths for standard locations (should be ignored)
        const homeLocalShareAppsNested = path.join(
            HOME_LOCAL_SHARE_APPS,
            'deep',
            'down',
        );

        vol.fromJSON({
            // Standard location, top level (should be ignored)
            [path.join(USR_LOCAL_SHARE_APPS, 'app-std-local.desktop')]:
                MOCK_DESKTOP_FILE_VALID.replace('Valid App', 'Std Local App'),
            // Standard location, nested (should be ignored)
            [path.join(homeLocalShareAppsNested, 'app-home-nested.desktop')]:
                MOCK_DESKTOP_FILE_VALID.replace('Valid App', 'Home Nested App'),

            // --- Expected files ---
            // XDG_DATA_DIRS location (/opt/share), top level
            [path.join(optShareApps, 'app-opt.desktop')]:
                MOCK_DESKTOP_FILE_VALID.replace('Valid App', 'Opt App'),
            // XDG_DATA_DIRS location (/usr/share), nested
            [path.join(usrShareAppsNested, 'app-usr-nested.desktop')]:
                MOCK_DESKTOP_FILE_VALID.replace('Valid App', 'Usr Nested App'),
            // XDG_DATA_HOME location, top level
            [path.join(customDataHomeApps, 'app-custom-home.desktop')]:
                MOCK_DESKTOP_FILE_VALID.replace('Valid App', 'Custom Home App'),
            // XDG_DATA_HOME location, nested
            [path.join(
                customDataHomeAppsNested,
                'app-custom-home-nested.desktop',
            )]: MOCK_DESKTOP_FILE_VALID.replace(
                'Valid App',
                'Custom Home Nested App',
            ),
            // --- End Expected files ---

            // Add some non-desktop files to ensure they are ignored
            [path.join(usrShareAppsNested, 'readme.txt')]: 'ignore me',
            [path.join(homeLocalShareAppsNested, 'config.json')]: '{}', // In ignored dir
            [path.join(customDataHomeAppsNested, 'data.bin')]: 'binary', // In searched dir
        });

        const result = await getDesktopEntries();

        // Should only find the 4 files within the specified XDG paths
        expect(result).toHaveLength(4);
        expect(result).toEqual(
            expect.arrayContaining([
                // Files from XDG_DATA_DIRS
                {
                    entry: {
                        name: 'Opt App',
                        exec: '/usr/bin/valid-app %U',
                        icon: 'valid-icon',
                    },
                    status: 'valid',
                },
                {
                    entry: {
                        name: 'Usr Nested App',
                        exec: '/usr/bin/valid-app %U',
                        icon: 'valid-icon',
                    },
                    status: 'valid',
                },
                // Files from XDG_DATA_HOME
                {
                    entry: {
                        name: 'Custom Home App',
                        exec: '/usr/bin/valid-app %U',
                        icon: 'valid-icon',
                    },
                    status: 'valid',
                },
                {
                    entry: {
                        name: 'Custom Home Nested App',
                        exec: '/usr/bin/valid-app %U',
                        icon: 'valid-icon',
                    },
                    status: 'valid',
                },
            ]),
        );
        // Explicitly check that ignored files were not included
        expect(result).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ entry: { name: 'Std Local App' } }),
                expect.objectContaining({ entry: { name: 'Home Nested App' } }),
            ]),
        );
        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('Searching for desktop entries'),
        );
    });

    it('should handle invalid INI files gracefully', async () => {
        const logSpy = vi.mocked(console.log); // Use vi.mocked for type safety
        vol.fromJSON({
            [path.join(USR_SHARE_APPS, 'good.desktop')]:
                MOCK_DESKTOP_FILE_VALID,
            [path.join(USR_SHARE_APPS, 'badschema.desktop')]: // Use the schema-invalid file
                MOCK_DESKTOP_FILE_INVALID_SCHEMA,
            [USR_LOCAL_SHARE_APPS]: null,
            [HOME_LOCAL_SHARE_APPS]: null,
        });

        const result = await getDesktopEntries();

        // Should only return the valid entry
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            entry: {
                name: 'Valid App',
                exec: '/usr/bin/valid-app %U',
                icon: 'valid-icon',
            },
            status: 'valid',
        });

        // Check that the initial search log happened, and then the error log
        expect(logSpy).toHaveBeenCalledTimes(2);
        // 1. The initial search log
        expect(logSpy).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining('Searching for desktop entries'),
        );
        // 2. The error log for the bad schema file (expect one string argument containing 'ParseError')
        expect(logSpy).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining(
                'Failed to process item when collecting desktop entries:',
            ) && expect.stringContaining('ParseError'), // Check the string contains the error type
        );
    });

    it('should handle inaccessible directories gracefully', async () => {
        const logSpy = vi.mocked(console.log); // Use vi.mocked for type safety
        // Simulate an inaccessible directory by not creating USR_LOCAL_SHARE_APPS
        vol.fromJSON({
            [path.join(USR_SHARE_APPS, 'app1.desktop')]:
                MOCK_DESKTOP_FILE_VALID,
            // [USR_LOCAL_SHARE_APPS]: null, // This directory won't exist
            [HOME_LOCAL_SHARE_APPS]: null, // This one exists but is empty
        });
        const result = await getDesktopEntries();

        // Should still find the entry in the accessible directory
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            entry: {
                name: 'Valid App',
                exec: '/usr/bin/valid-app %U',
                icon: 'valid-icon',
            },
            status: 'valid',
        });
        // Ensure only the initial "Searching..." log was called
        expect(logSpy).toHaveBeenCalledTimes(1);
        expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('Searching for desktop entries'),
        );
    });

    it('should return entries with appropriate status (valid, hidden, non-executable)', async () => {
        const MOCK_DESKTOP_FILE_NO_EXEC = `
[Desktop Entry]
Name=No Exec App
Icon=no-exec-icon
Type=Application
`;
        vol.fromJSON({
            [path.join(USR_SHARE_APPS, 'valid.desktop')]:
                MOCK_DESKTOP_FILE_VALID,
            [path.join(USR_SHARE_APPS, 'hidden.desktop')]:
                MOCK_DESKTOP_FILE_NODISPLAY,
            [path.join(USR_SHARE_APPS, 'noexec.desktop')]:
                MOCK_DESKTOP_FILE_NO_EXEC,
            // MOCK_DESKTOP_FILE_NOT_APP is invalid schema (missing required Name), so it won't be parsed successfully
            // [path.join(USR_SHARE_APPS, 'link.desktop')]: MOCK_DESKTOP_FILE_NOT_APP,
            [USR_LOCAL_SHARE_APPS]: null,
            [HOME_LOCAL_SHARE_APPS]: null,
        });

        const result = await getDesktopEntries();

        // Should return all successfully parsed entries with their status
        expect(result).toHaveLength(3);
        expect(result).toEqual(
            expect.arrayContaining([
                {
                    entry: {
                        name: 'Valid App',
                        exec: '/usr/bin/valid-app %U',
                        icon: 'valid-icon',
                    },
                    status: 'valid',
                },
                {
                    entry: {
                        name: 'Hidden App',
                        exec: '/usr/bin/hidden-app',
                        // Icon is optional, so undefined is expected if not present
                    },
                    status: 'hidden',
                },
                {
                    entry: {
                        name: 'No Exec App',
                        icon: 'no-exec-icon',
                    },
                    status: 'non-executable',
                },
            ]),
        );
        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('Searching for desktop entries'),
        );
    });

    it('should follow symbolic links to desktop files outside search directories', async () => {
        // 1. Define paths
        const searchDir = USR_SHARE_APPS;
        const targetDir = '/opt/myapps'; // Outside standard search paths
        const targetFile = path.join(targetDir, 'linked-app.desktop');
        const linkFile = path.join(searchDir, 'link-to-app.desktop');
        const targetContent = MOCK_DESKTOP_FILE_VALID.replace(
            'Valid App',
            'Linked App',
        );

        // 2. Setup filesystem using vol.fromJSON for directories and the target file
        vol.fromJSON({
            [searchDir]: null, // Create the search directory
            [targetDir]: null, // Create the target directory
            [targetFile]: targetContent, // Create the target file
            // Standard dirs needed for default search path calculation if XDG vars aren't set
            [USR_LOCAL_SHARE_APPS]: null,
            [HOME_LOCAL_SHARE_APPS]: null,
        });

        // 3. Create the symbolic link using the mocked fs/promises
        const fsPromises = await import('node:fs/promises');
        // Use await here as symlink is async
        await fsPromises.symlink(targetFile, linkFile);

        // 4. Call the function
        const result = await getDesktopEntries();

        // 5. Assertions
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            entry: {
                name: 'Linked App',
                exec: '/usr/bin/valid-app %U',
                icon: 'valid-icon',
            },
            status: 'valid',
        });
        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('Searching for desktop entries'),
        );
        // Check that the symlink itself was found during the scan (optional, depends on logging level)
        // expect(console.debug).toHaveBeenCalledWith(expect.stringContaining(linkFile));
    });

    it('should correctly handle readdir with withFileTypes via mock', async () => {
        // This test doesn't call getDesktopEntries, so no console.log mock needed here specifically
        vi.restoreAllMocks(); // Restore console mock if it interferes
        const fsPromises = await import('node:fs/promises');
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
