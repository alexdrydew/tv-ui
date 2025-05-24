import type { LaunchInstanceId, LauncherConfig } from '@app/types';

export {
    getAppConfigs,
    upsertAppConfig,
    removeAppConfig,
    watchConfigFile,
    getSuggestedAppConfigs,
} from './configs/commands.js';
export { launchApp } from './apps/commands.js';
export {
    onConfigUpdate,
    onAppUpdate,
    onLauncherConfigUpdate,
} from './events.js';

export { killApp } from './apps/commands.js';
export type { LaunchInstanceId };

export {
    getLauncherConfig,
    watchLauncherConfigFile,
} from './launcher/commands.js';
export type { LauncherConfig };

/**
 * Retrieves the value of an environment variable.
 * @param name The name of the environment variable.
 * @returns The value of the environment variable, or undefined if it's not set.
 */
export function getEnv(name: string): string | undefined {
    return process.env[name];
}
