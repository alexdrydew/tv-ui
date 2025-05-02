export function isNodePlatform(value: string): value is NodeJS.Platform {
    return [
        'aix',
        'android',
        'darwin',
        'freebsd',
        'haiku',
        'linux',
        'openbsd',
        'sunos',
        'win32',
        'cygwin',
        'netbsd',
    ].includes(value);
}
