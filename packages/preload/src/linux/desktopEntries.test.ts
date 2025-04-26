import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Effect } from 'effect';
import { vol, fs } from 'memfs';
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
        vi.stubEnv('HOME', MOCK_HOME);
        vi.stubEnv('XDG_DATA_DIRS', '');
        vi.stubEnv('XDG_DATA_HOME', '');
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vol.reset();
        vi.unstubAllEnvs();
    });

    it('should return an empty array if no standard directories exist', async () => {
        const result = await Effect.runPromise(getDesktopEntries());
        expect(result).toEqual([]);
    });

    it('should return an empty array if standard directories exist but are empty', async () => {
        vol.fromJSON({
            [USR_SHARE_APPS]: null,
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
            [path.join(USR_SHARE_APPS, 'otherfile.txt')]: 'some text',
            [USR_LOCAL_SHARE_APPS]: null,
            [path.join(HOME_LOCAL_SHARE_APPS, 'app2.desktop')]:
                MOCK_DESKTOP_FILE_VALID.replace('Valid App', 'Valid App 2'),
            [subDirFilePath]: MOCK_DESKTOP_FILE_VALID.replace(
                'Valid App',
                'Valid App 3',
            ),
        });

        const result = await Effect.runPromise(getDesktopEntries());

        expect(result).toHaveLength(3);
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
                    filePath: path.resolve(subDirFilePath),
                }),
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

        const result = await Effect.runPromise(getDesktopEntries());

        expect(result).toHaveLength(3);
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
                MOCK_DESKTOP_FILE_NODISPLAY,
            [path.join(USR_SHARE_APPS, 'link.desktop')]:
                MOCK_DESKTOP_FILE_NOT_APP,
            [USR_LOCAL_SHARE_APPS]: null,
            [HOME_LOCAL_SHARE_APPS]: null,
        });

        const result = await Effect.runPromise(getDesktopEntries());

        expect(result).toHaveLength(1);
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

        const result = await Effect.runPromise(getDesktopEntries());

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(
            expect.objectContaining({ id: 'good', name: 'Valid App' }),
        );
    });

    it('should handle inaccessible directories gracefully', async () => {
        vol.fromJSON({
            [path.join(USR_SHARE_APPS, 'app1.desktop')]:
                MOCK_DESKTOP_FILE_VALID,
        });
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await Effect.runPromise(getDesktopEntries());

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('app1');

        expect(warnSpy).not.toHaveBeenCalled();

        warnSpy.mockRestore();
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
