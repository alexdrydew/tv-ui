import { AppModule } from '../AppModule.js';
import { ModuleContext } from '../ModuleContext.js';
import { BrowserWindow, type WebContents } from 'electron';
import type { AppInitConfig } from '../AppInitConfig.js';

export class WindowManager implements AppModule {
    #mainWindow: BrowserWindow | null = null;
    readonly #preload: { path: string };
    readonly #renderer: { path: string } | URL;
    readonly #openDevTools;

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
    }

    get mainWindow(): BrowserWindow | null {
        return this.#mainWindow;
    }

    get mainWebContents(): WebContents | null {
        return this.#mainWindow?.webContents ?? null;
    }

    async enable({ app }: ModuleContext): Promise<void> {
        await app.whenReady();
        await this.restoreOrCreateWindow(true);
        app.on('second-instance', () => this.restoreOrCreateWindow(true));
        app.on('activate', () => this.restoreOrCreateWindow(true));
    }

    async createWindow(): Promise<BrowserWindow> {
        this.#mainWindow = new BrowserWindow({
            show: false, // Use the 'ready-to-show' event to show the instantiated BrowserWindow.
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: false, // Sandbox disabled because the demo of preload script depend on the Node.js api
                webviewTag: false, // The webview tag is not recommended. Consider alternatives like an iframe or Electron's BrowserView. @see https://www.electronjs.org/docs/latest/api/webview-tag#warning
                preload: this.#preload.path,
            },
        });

        if (this.#renderer instanceof URL) {
            // Use this.#mainWindow here instead of the undefined browserWindow
            await this.#mainWindow.loadURL(this.#renderer.href);
        } else {
            await this.#mainWindow.loadFile(this.#renderer.path);
        }

        // Emitted when the window is ready to be shown
        // This helps in preventing a white screen during window initialization.
        this.#mainWindow.once('ready-to-show', () => {
            this.#mainWindow?.show();
            if (this.#openDevTools) {
                this.#mainWindow?.webContents.openDevTools();
            }
        });

        return this.#mainWindow;
    }

    async restoreOrCreateWindow(show = false): Promise<BrowserWindow> {
        // Attempt to find existing non-destroyed window
        let window = BrowserWindow.getAllWindows().find(
            (w) => !w.isDestroyed(),
        );

        // If a window exists, update our reference
        if (window) {
            this.#mainWindow = window;
        }
        // If no window exists, create one
        else {
            window = await this.createWindow();
            this.#mainWindow = window; // Ensure mainWindow is set after creation
        }

        if (show) {
            if (window.isMinimized()) {
                window.restore();
            }
            window.show();
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
