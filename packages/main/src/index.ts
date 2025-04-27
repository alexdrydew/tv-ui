import { ipcMain } from 'electron';
import freedesktopIcons from 'freedesktop-icons';
import type { AppInitConfig } from './AppInitConfig.js';
import { createModuleRunner } from './ModuleRunner.js';
import { disallowMultipleAppInstance } from './modules/SingleInstanceApp.js';
import { createWindowManagerModule } from './modules/WindowManager.js';
import { terminateAppOnLastWindowClose } from './modules/ApplicationTerminatorOnLastWindowClose.js';
import { hardwareAccelerationMode } from './modules/HardwareAccelerationModule.js';
import { autoUpdater } from './modules/AutoUpdater.js';
import { allowInternalOrigins } from './modules/BlockNotAllowdOrigins.js';
import { allowExternalUrls } from './modules/ExternalUrls.js';

export async function initApp(initConfig: AppInitConfig) {
    // Handle icon lookups from preload
    ipcMain.handle(
        'get-freedesktop-icon',
        async (
            _event,
            iconName: string | string[],
            themes?: string | string[],
            exts?: string | string[],
            fallbackPaths?: string | string[],
        ): Promise<string | null> => {
            try {
                // Directly pass arguments; freedesktopIcons handles undefined correctly
                return await freedesktopIcons(
                    iconName,
                    themes,
                    exts,
                    fallbackPaths,
                );
            } catch (error) {
                console.error('Error looking up freedesktop icon:', error);
                return null; // Return null or throw, depending on desired error handling
            }
        },
    );

    const moduleRunner = createModuleRunner()
        .init(
            createWindowManagerModule({
                initConfig,
                openDevTools: import.meta.env.DEV,
            }),
        )
        .init(disallowMultipleAppInstance())
        .init(terminateAppOnLastWindowClose())
        .init(hardwareAccelerationMode({ enable: false }))
        .init(autoUpdater())

        // Install DevTools extension if needed
        // .init(chromeDevToolsExtension({extension: 'VUEJS3_DEVTOOLS'}))

        // Security
        .init(
            allowInternalOrigins(
                new Set(
                    initConfig.renderer instanceof URL
                        ? [initConfig.renderer.origin]
                        : [],
                ),
            ),
        )
        .init(
            allowExternalUrls(
                new Set(
                    initConfig.renderer instanceof URL
                        ? [
                              'https://vite.dev',
                              'https://developer.mozilla.org',
                              'https://solidjs.com',
                              'https://qwik.dev',
                              'https://lit.dev',
                              'https://react.dev',
                              'https://preactjs.com',
                              'https://www.typescriptlang.org',
                              'https://vuejs.org',
                          ]
                        : [],
                ),
            ),
        );

    await moduleRunner;
}
