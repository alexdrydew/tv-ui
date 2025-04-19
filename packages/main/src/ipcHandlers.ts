import { ipcMain, type WebContents, type IpcMainInvokeEvent } from 'electron';
import { AppConfig, AppConfigId } from '@app/types';

let appManagerInstance: AppManager | null = null;
let mainWebContents: WebContents | null = null;

export function setupIpcHandlers(webContents: WebContents): void {
    if (appManagerInstance) {
        console.warn('IPC Handlers already initialized.');
        return;
    }

    mainWebContents = webContents;
    // Instantiate AppManager - it doesn't need webContents directly
    // as it uses the imported sendToRenderer function.
    appManagerInstance = new AppManager();

    console.log('Setting up IPC Handlers...');

    // Helper to wrap handlers with logging and error handling
    async function handleInvoke<T>(
        channel: string,
        handler: () => Promise<T>,
        event: IpcMainInvokeEvent,
        ...args: any[]
    ): Promise<T> {
        console.log(
            `IPC Received: ${channel}`,
            ...args.map((arg) =>
                typeof arg === 'object' ? JSON.stringify(arg) : arg,
            ),
        );
        try {
            return await handler();
        } catch (error: any) {
            console.error(`Error handling IPC ${channel}:`, error);
            // Rethrow the error so the renderer's invoke().catch() receives it
            throw new Error(
                error.message ||
                    'An unknown error occurred in the main process.',
            );
        }
    }

    ipcMain.handle(IpcChannel.GET_APP_CONFIGS, (event, configPath: string) =>
        handleInvoke(
            IpcChannel.GET_APP_CONFIGS,
            () => appManagerInstance!.getAppConfigs(configPath),
            event,
            configPath,
        ),
    );

    ipcMain.handle(IpcChannel.GET_APP_STATE, (event, configId: AppConfigId) =>
        handleInvoke(
            IpcChannel.GET_APP_STATE,
            () => appManagerInstance!.getAppState(configId),
            event,
            configId,
        ),
    );

    ipcMain.handle(
        IpcChannel.LAUNCH_APP,
        (event, command: string, configId: AppConfigId) =>
            handleInvoke(
                IpcChannel.LAUNCH_APP,
                () => appManagerInstance!.launchApp(command, configId),
                event,
                command,
                configId,
            ),
    );

    ipcMain.handle(IpcChannel.KILL_APP, (event, configId: AppConfigId) =>
        handleInvoke(
            IpcChannel.KILL_APP,
            () => appManagerInstance!.killApp(configId),
            event,
            configId,
        ),
    );

    ipcMain.handle(
        IpcChannel.UPSERT_APP_CONFIG,
        (event, configToUpsert: AppConfig, configPath: string) =>
            handleInvoke(
                IpcChannel.UPSERT_APP_CONFIG,
                () =>
                    appManagerInstance!.upsertAppConfig(
                        configToUpsert,
                        configPath,
                    ),
                event,
                configToUpsert,
                configPath,
            ),
    );

    ipcMain.handle(
        IpcChannel.REMOVE_APP_CONFIG,
        (event, configIdToRemove: AppConfigId, configPath: string) =>
            handleInvoke(
                IpcChannel.REMOVE_APP_CONFIG,
                () =>
                    appManagerInstance!.removeAppConfig(
                        configIdToRemove,
                        configPath,
                    ),
                event,
                configIdToRemove,
                configPath,
            ),
    );

    console.log('IPC Handlers setup complete.');
}

/**
 * Sends an event asynchronously from the main process to the renderer process
 * via the main browser window's WebContents.
 * Ensures the webContents exists and is not destroyed before sending.
 * @param channel The channel name to send the event on.
 * @param args Optional arguments to send with the event.
 */
export function sendToRenderer(channel: string, ...args: any[]): void {
    if (mainWebContents && !mainWebContents.isDestroyed()) {
        // console.log(`Sending to renderer [${channel}]:`, ...args); // Optional: Log outgoing events
        mainWebContents.send(channel, ...args);
    } else {
        // This can happen during startup/shutdown or if the window is closed unexpectedly.
        console.warn(
            `Cannot send event "${channel}" to renderer: mainWebContents is ${mainWebContents ? 'destroyed' : 'null'}.`,
        );
    }
}
