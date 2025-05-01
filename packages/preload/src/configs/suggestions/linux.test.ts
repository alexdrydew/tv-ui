import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { vol, fs } from 'memfs';
import path from 'node:path';
import { getDesktopEntries } from './linux.js'; // Changed import path

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
        vi.stubEnv('HOME', MOCK_HOME);
        vi.stubEnv('XDG_DATA_DIRS', '');
        vi.stubEnv('XDG_DATA_HOME', '');
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vol.reset();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('should return an empty array if no standard directories exist', async () => {
        const result = await getDesktopEntries();
        expect(result).toEqual([]);
    });

    it('should return an empty array if standard directories exist but are empty', async () => {
        vol.fromJSON({
            [USR_SHARE_APPS]: null,
            [USR_LOCAL_SHARE_APPS]: null,
            [HOME_LOCAL_SHARE_APPS]: null,
        });
        const result = await getDesktopEntries();
        expect(result).toEqual([]);
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
            [USR_LOCAL_SHARE_APPS]: null,
            [HOME_LOCAL_SHARE_APPS]: null,
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
    });

    it('should handle invalid INI files gracefully', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        vol.fromJSON({
            [path.join(USR_SHARE_APPS, 'good.desktop')]:
                MOCK_DESKTOP_FILE_VALID,
            [path.join(USR_SHARE_APPS, 'badini.desktop')]:
                MOCK_DESKTOP_FILE_INVALID_INI,
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

        // Check that the error for the bad INI file was logged (via Effect failure)
        expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                'Failed to process item when collecting desktop entries:',
            ),
        );
        logSpy.mockRestore();
    });

    it('should handle inaccessible directories gracefully', async () => {
        // Simulate an inaccessible directory by not creating USR_LOCAL_SHARE_APPS
        vol.fromJSON({
            [path.join(USR_SHARE_APPS, 'app1.desktop')]:
                MOCK_DESKTOP_FILE_VALID,
            // [USR_LOCAL_SHARE_APPS]: null, // This directory won't exist
            [HOME_LOCAL_SHARE_APPS]: null,
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
    });

    it('should correctly handle readdir with withFileTypes via mock', async () => {
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
