import { versions } from './versions.js';
import type { LaunchInstanceId } from '@app/types'; // Import LaunchInstanceId type

export { versions };
export {
    getAppConfigs,
    upsertAppConfig,
    removeAppConfig,
    watchConfigFile, // Add watchConfigFile
} from './configs/commands.js';
export { launchApp } from './apps/commands.js'; // killApp signature changed
export { onConfigUpdate, onAppUpdate } from './events.js';

// Explicitly export killApp with the correct signature
export { killApp } from './apps/commands.js';
export type { LaunchInstanceId }; // Export type if needed elsewhere

/**
 * Retrieves the value of an environment variable.
 * @param name The name of the environment variable.
 * @returns The value of the environment variable, or undefined if it's not set.
 */
export function getEnv(name: string): string | undefined {
    return process.env[name];
}
