import { AppConfig } from '@app/types';
import { Effect, pipe } from 'effect';
import os from 'node:os';
import { getDesktopEntries } from './linux.js';

export function suggestAppConfigs(): Effect.Effect<AppConfig[], never> {
    const platform = os.platform();

    if (platform === 'linux') {
        return pipe(
            getDesktopEntries(),
            Effect.map((desktopEntries) => {
                const suggestions: AppConfig[] = [];
                for (const entry of desktopEntries) {
                    const command = entry.exec;

                    if (command) {
                        const suggestion: AppConfig = {
                            id: entry.id,
                            name: entry.name,
                            launchCommand: command,
                            icon: entry.icon,
                        };
                        suggestions.push(suggestion);
                    } else {
                        console.warn(
                            `Could not determine command for suggestion: ${entry.name} (${entry.filePath})`,
                        );
                    }
                }
                return suggestions;
            }),
            Effect.catchAll((error) => {
                console.error(
                    'Unexpected error mapping desktop entries to AppConfig:',
                    error,
                );
                return Effect.succeed([]);
            }),
        );
    } else {
        console.log(
            `App config suggestion not implemented for platform: ${platform}`,
        );
        return Effect.succeed([]);
    }
}
