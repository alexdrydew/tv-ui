export function attachConsole(): Promise<() => void> {
    throw new Error('Function not implemented.');
}

export function error(message: string): Promise<void> {
    console.error(message);
    return new Promise(() => {});
}

export function info(message: string): Promise<void> {
    console.info(message);
    return new Promise(() => {});
}
export function warn(message: string): Promise<void> {
    console.warn(message);
    return new Promise(() => {});
}
export function debug(message: string): Promise<void> {
    console.debug(message);
    return new Promise(() => {});
}
