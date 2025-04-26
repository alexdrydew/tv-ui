import { versions } from './versions.js';
import type { LaunchInstanceId } from '@app/types';

export { versions };
export {
    getAppConfigs,
    upsertAppConfig,
    removeAppConfig,
    watchConfigFile,
} from './configs/commands.js';
export { launchApp } from './apps/commands.js';
export { onConfigUpdate, onAppUpdate } from './events.js';

export { killApp } from './apps/commands.js';
export type { LaunchInstanceId };
// FIX: Remove incorrect export that caused TS error
// export { getDesktopEntries } from './linux/desktopEntries.js';

// FIX: Export the main suggestion function from its correct location.
// Assuming the build process handles the .js extension, otherwise use './configs/suggestions/index.ts'
export { suggestAppConfigs } from './configs/suggestions/index.js';

/**
 * Retrieves the value of an environment variable.
 * @param name The name of the environment variable.
 * @returns The value of the environment variable, or undefined if it's not set.
 */
export function getEnv(name: string): string | undefined {
    return process.env[name];
}
