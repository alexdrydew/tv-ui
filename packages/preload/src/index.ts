import { versions } from './versions.js';

export { versions };
export {
    getAppConfigs,
    upsertAppConfig,
    removeAppConfig,
} from './configs/commands.js';
export { launchApp, killApp } from './apps/commands.js';
export { onConfigUpdate, onAppUpdate } from './events.js';

/**
 * Retrieves the value of an environment variable.
 * @param name The name of the environment variable.
 * @returns The value of the environment variable, or undefined if it's not set.
 */
export function getEnv(name: string): string | undefined {
    return process.env[name];
}
