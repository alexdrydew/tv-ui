import { versions } from './versions.js';
import '@zod-plugin/effect';

export { versions };
// export * from './configs/commands.js';
export { getAppConfigs, upsertAppConfig } from './configs/commands.js';
