import { AppConfig, AppConfigId } from '@app/types';
import { Effect, pipe } from 'effect';
import { invokeConfigUpdateListeners } from '../events.js';
import { ConfigNotFoundError } from './errors.js';
import { readConfigsFromFile, writeConfigsToFileEffect } from './fs.js';

export async function getAppConfigs(configPath: string): Promise<AppConfig[]> {
    const effect = readConfigsFromFile(configPath);
    return Effect.runPromise(effect).then((res) => Object.values(res));
}

export async function upsertAppConfig(
    configToUpsert: AppConfig,
    configPath: string,
): Promise<void> {
    const effect = pipe(
        readConfigsFromFile(configPath),
        Effect.map((configsRecord) => {
            configsRecord[configToUpsert.id] = configToUpsert;
            return configsRecord;
        }),
        Effect.flatMap((updatedConfigsRecord) =>
            pipe(
                writeConfigsToFileEffect(configPath, updatedConfigsRecord),
                Effect.tap(() =>
                    invokeConfigUpdateListeners(updatedConfigsRecord),
                ),
            ),
        ),
    );

    return Effect.runPromise(effect);
}

export async function removeAppConfig(
    configIdToRemove: AppConfigId,
    configPath: string,
): Promise<void> {
    // const runningState = launchedApps.get(configIdToRemove);
    // if (runningState && runningState.exitResult === null) {
    //     throw new Error(
    //         `Cannot remove config for running app: ${configIdToRemove}`,
    //     );
    // }

    const effect = pipe(
        readConfigsFromFile(configPath),
        Effect.flatMap((configsRecord) => {
            if (!(configIdToRemove in configsRecord)) {
                return Effect.fail(
                    new ConfigNotFoundError({ configId: configIdToRemove }),
                );
            }
            delete configsRecord[configIdToRemove];
            return Effect.succeed(configsRecord);
        }),
        Effect.flatMap((updatedConfigsRecord) =>
            pipe(
                writeConfigsToFileEffect(configPath, updatedConfigsRecord),
                Effect.tap(() =>
                    invokeConfigUpdateListeners(updatedConfigsRecord),
                ),
            ),
        ),
    );
    return Effect.runPromise(effect);
}
