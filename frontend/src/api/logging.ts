import {
  attachConsole as tauriAttachConsole,
  error as tauriError,
  info as tauriInfo,
  log as tauriLog,
  warn as tauriWarn,
  debug as tauriDebug,
  trace as tauriTrace,
  type Options as TauriLogOptions,
  type LogEvent as TauriLogEvent,
} from "@tauri-apps/plugin-log";

// Re-export types if needed elsewhere, though often not necessary for simple logging
export type LogOptions = TauriLogOptions;
export type LogEvent = TauriLogEvent;

/**
 * Attaches the webview console.log, .warn, .error, .debug, and .trace functions to the backend logger.
 * Returns a function to detach the console.
 */
export function attachConsole(): Promise<() => void> {
  return tauriAttachConsole();
}

/**
 * Logs a message with the error level.
 * @param message The message to log. Supports string interpolation.
 * @param options Optional configuration for the log message.
 */
export function error(message: string, options?: LogOptions): Promise<void> {
  return tauriError(message, options);
}

/**
 * Logs a message with the info level.
 * @param message The message to log. Supports string interpolation.
 * @param options Optional configuration for the log message.
 */
export function info(message: string, options?: LogOptions): Promise<void> {
  return tauriInfo(message, options);
}

/**
 * Logs a message with the log level. (Usually maps to info or debug depending on config)
 * @param message The message to log. Supports string interpolation.
 * @param options Optional configuration for the log message.
 */
export function log(message: string, options?: LogOptions): Promise<void> {
  return tauriLog(message, options);
}

/**
 * Logs a message with the warn level.
 * @param message The message to log. Supports string interpolation.
 * @param options Optional configuration for the log message.
 */
export function warn(message: string, options?: LogOptions): Promise<void> {
  return tauriWarn(message, options);
}

/**
 * Logs a message with the debug level.
 * @param message The message to log. Supports string interpolation.
 * @param options Optional configuration for the log message.
 */
export function debug(message: string, options?: LogOptions): Promise<void> {
  return tauriDebug(message, options);
}

/**
 * Logs a message with the trace level.
 * @param message The message to log. Supports string interpolation.
 * @param options Optional configuration for the log message.
 */
export function trace(message: string, options?: LogOptions): Promise<void> {
  return tauriTrace(message, options);
}
