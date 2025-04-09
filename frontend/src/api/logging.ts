import {
  attachConsole as tauriAttachConsole,
  error as tauriError,
  info as tauriInfo,
  warn as tauriWarn,
  debug as tauriDebug,
} from "@tauri-apps/plugin-log";

export function attachConsole(): Promise<() => void> {
  return tauriAttachConsole();
}

export function error(message: string): Promise<void> {
  return tauriError(message);
}

export function info(message: string): Promise<void> {
  return tauriInfo(message);
}
export function warn(message: string): Promise<void> {
  return tauriWarn(message);
}
export function debug(message: string): Promise<void> {
  return tauriDebug(message);
}
