import type { AppInitConfig } from './AppInitConfig.js';
import { createModuleRunner } from './ModuleRunner.js';
import { disallowMultipleAppInstance } from './modules/SingleInstanceApp.js';
import { createWindowManagerModule } from './modules/WindowManager.js';
import { terminateAppOnLastWindowClose } from './modules/ApplicationTerminatorOnLastWindowClose.js';
import { hardwareAccelerationMode } from './modules/HardwareAccelerationModule.js';
import { autoUpdater } from './modules/AutoUpdater.js';
import { allowInternalOrigins } from './modules/BlockNotAllowdOrigins.js';
import { allowExternalUrls } from './modules/ExternalUrls.js';
import { setupIpcHandlers } from './ipcHandlers.js'; // Import IPC setup
import type { WindowManager } from './modules/WindowManager.js'; // Import type

export async function initApp(initConfig: AppInitConfig) {
    const windowManager = createWindowManagerModule({
        initConfig,
        openDevTools: import.meta.env.DEV,
    });

    const moduleRunner = createModuleRunner()
        .init(windowManager) // Use the instance
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

    // Get the main window's webContents after the app is ready and window is created
    const webContents = (windowManager as WindowManager).mainWebContents;

    if (webContents) {
         // Ensure IPC handlers are set up after the window and its webContents are available
        if (webContents.isLoading()) {
             webContents.once('did-finish-load', () => {
                console.log('Window finished loading, setting up IPC handlers.');
                setupIpcHandlers(webContents);
            });
        } else {
            console.log('Window already loaded, setting up IPC handlers.');
            setupIpcHandlers(webContents);
        }
    } else {
        console.error('Failed to get main window webContents to set up IPC handlers.');
        // Handle this error appropriately, maybe quit the app?
        // app.quit();
    }
}
