import { versions } from './versions.js';
import '@zod-plugin/effect';

export { versions };
// export * from './configs/commands.js';
export { getAppConfigs, upsertAppConfig } from './configs/commands.js';

/**
 * Retrieves the value of an environment variable.
 * @param name The name of the environment variable.
 * @returns The value of the environment variable, or undefined if it's not set.
 */
export function getEnv(name: string): string | undefined {
    return process.env[name];
}
