import { AppConfig } from '@app/types';
import { Effect, pipe } from 'effect';
import os from 'node:os';
import { getDesktopEntries } from './linux.js'; // Assuming .js extension if compiling TS->JS

// Helper to attempt extracting the main command from an Exec string
// This is a basic implementation and might need refinement.
function extractCommandFromExec(exec: string | undefined): string | undefined {
    if (!exec) {
        return undefined;
    }
    // Remove common placeholders like %f, %F, %u, %U, %i, %c, %k and trim
    // This doesn't handle quoted arguments correctly yet.
    const commandPart = exec
        .replace(/%[a-zA-Z]/g, '')
        .trim()
        .split(' ')[0];
    return commandPart || undefined; // Return undefined if empty after processing
}

export function suggestAppConfig(): Effect.Effect<AppConfig[], never> {
    const platform = os.platform();

    if (platform === 'linux') {
        return pipe(
            getDesktopEntries(), // Returns Effect<DesktopEntryInternal[], never>
            Effect.map((desktopEntries) => {
                const suggestions: AppConfig[] = [];
                for (const entry of desktopEntries) {
                    // Use the raw exec string as the command for now
                    // A more sophisticated approach might parse arguments, handle env vars etc.
                    const command = entry.exec; // Using the raw exec string
                    // const command = extractCommandFromExec(entry.exec); // Alternative: try extracting base command

                    if (command) {
                        const suggestion: AppConfig = {
                            id: entry.id, // Use desktop file name as ID
                            name: entry.name,
                            command: command, // Use the extracted command
                            icon: entry.icon, // Optional icon
                            // cwd, args, env could potentially be inferred or left undefined
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
            // Catch potential errors during mapping, though getDesktopEntries handles most
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
        return Effect.succeed([]); // Return empty array for non-Linux platforms
    }
}
