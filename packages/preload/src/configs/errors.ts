import { AppConfigId } from '@app/types';
import { Data } from 'effect';

export class ConfigNotFoundError extends Data.TaggedError(
    'ConfigNotFoundError',
)<{
    readonly configId: AppConfigId;
    readonly message?: string;
}> {
    constructor(args: { configId: AppConfigId; message?: string }) {
        super({
            ...args,
            message:
                args.message ?? `Config with ID '${args.configId}' not found.`,
        });
    }
}
