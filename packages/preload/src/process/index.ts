import { Effect } from 'effect';
import { UnknownException } from 'effect/Cause';
import {
    mapProcessError,
    type ProcessError,
    SignalSendFailedError,
} from './errors.js';

/**
 * Sends a signal to a process identified by its PID.
 * Wraps `process.kill` in an Effect, mapping known errors.
 *
 * @param pid The process ID to send the signal to.
 * @param signal The signal to send (e.g., 'SIGKILL', 'SIGTERM'). Defaults to 'SIGTERM'.
 * @returns An Effect that resolves with void on success or fails with a ProcessError or UnknownException.
 */
export function killProcessEffect(
    pid: number,
    signal: NodeJS.Signals | number = 'SIGTERM', // Default to SIGTERM
): Effect.Effect<void, ProcessError | UnknownException> {
    return Effect.try({
        try: () => {
            const success = process.kill(pid, signal);
            if (!success) {
                throw new SignalSendFailedError({ pid, signal });
            }
            console.debug(`Successfully sent signal ${signal} to PID ${pid}.`);
        },
        catch: (error) => mapProcessError(error, pid),
    });
}
