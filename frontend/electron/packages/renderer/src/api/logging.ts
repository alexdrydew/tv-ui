export function attachConsole(): Promise<() => void> {
  throw new Error("Function not implemented.");
}

export function error(_message: string): Promise<void> {
  return new Promise(() => {});
}

export function info(_message: string): Promise<void> {
  return new Promise(() => {});
}
export function warn(_message: string): Promise<void> {
  return new Promise(() => {});
}
export function debug(_message: string): Promise<void> {
  return new Promise(() => {});
}
