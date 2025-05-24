import type { AppModule } from '../AppModule.js';
import { ModuleContext } from '../ModuleContext.js';
import { BrowserWindow, ipcMain } from 'electron';
import type { AppInitConfig } from '../AppInitConfig.js';
import { GlobalKeyboardListener } from 'node-global-key-listener';
import { LAUNCHER_CONFIG_UPDATE_CHANNEL, LauncherConfig } from '@app/types';

class WindowManager implements AppModule {
    readonly #preload: { path: string };
    readonly #renderer: { path: string } | URL;
    readonly #openDevTools;
    readonly #isDev: boolean;
    #currentWindow: BrowserWindow | null = null;
    #globalKeyListener: GlobalKeyboardListener;

    constructor({
        initConfig,
        openDevTools = false,
    }: {
        initConfig: AppInitConfig;
        openDevTools?: boolean;
    }) {
        this.#preload = initConfig.preload;
        this.#renderer = initConfig.renderer;
        this.#openDevTools = openDevTools;
        this.#isDev = initConfig.isDev;
        this.#globalKeyListener = new GlobalKeyboardListener();
    }

    async enable({ app }: ModuleContext): Promise<void> {
        await app.whenReady();
        const window = await this.restoreOrCreateWindow(true);
        this.#currentWindow = window;

        app.on('second-instance', () => this.restoreOrCreateWindow(true));
        app.on('activate', () => this.restoreOrCreateWindow(true));

        this.#setupLauncherConfigHandler();

        app.on('will-quit', () => {
            this.#cleanup();
        });
    }

    #setupLauncherConfigHandler(): void {
        ipcMain.handle(
            LAUNCHER_CONFIG_UPDATE_CHANNEL,
            (_event, config: LauncherConfig) => {
                console.log(
                    'Received launcher config update in main process:',
                    config,
                );
                this.#setupGlobalKeyListener(config);
            },
        );
    }

    #setupGlobalKeyListener(launcherConfig: LauncherConfig): void {
        try {
            if (this.#globalKeyListener) {
                this.#cleanup();
            }

            const keyCode = launcherConfig.toggleAppKeyCode;
            console.log(`Setting up global key listener for key: ${keyCode}`);
            this.#globalKeyListener.addListener((e) => {
                if (e.name === keyCode && e.state === 'UP') {
                    this.#toggleWindowVisibility();
                }
            });
        } catch (error) {
            console.error('Failed to setup global key listener:', error);
            if (this.#globalKeyListener) {
                this.#cleanup();
            }
        }
    }

    #toggleWindowVisibility(): void {
        if (!this.#currentWindow || this.#currentWindow.isDestroyed()) {
            return;
        }

        if (this.#currentWindow.isFocused()) {
            this.#currentWindow.hide();
        } else {
            this.#currentWindow.restore();
            this.#currentWindow.show();
            this.#currentWindow.focus();
        }
    }

    #cleanup(): void {
        try {
            this.#globalKeyListener.kill();
            this.#globalKeyListener = new GlobalKeyboardListener();
        } catch (error) {
            console.error('Failed to cleanup global shortcuts:', error);
        }
    }

    async createWindow(): Promise<BrowserWindow> {
        const browserWindow = new BrowserWindow({
            show: false,
            fullscreen: !this.#isDev,
            titleBarStyle: 'hidden',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: false,
                webviewTag: false,
                preload: this.#preload.path,
            },
        });

        if (this.#renderer instanceof URL) {
            await browserWindow.loadURL(this.#renderer.href);
        } else {
            await browserWindow.loadFile(this.#renderer.path);
        }

        return browserWindow;
    }

    async restoreOrCreateWindow(show = false) {
        let window = BrowserWindow.getAllWindows().find(
            (w) => !w.isDestroyed(),
        );

        if (window === undefined) {
            window = await this.createWindow();
        }

        this.#currentWindow = window;

        if (!show) {
            return window;
        }

        if (window.isMinimized()) {
            window.restore();
        }

        window?.show();

        if (this.#openDevTools) {
            window?.webContents.openDevTools();
        }

        if (!this.#isDev) {
            window.focus();
        }

        return window;
    }
}

export function createWindowManagerModule(
    ...args: ConstructorParameters<typeof WindowManager>
) {
    return new WindowManager(...args);
}
