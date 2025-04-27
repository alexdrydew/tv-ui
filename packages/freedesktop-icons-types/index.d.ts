declare module 'freedesktop-icons' {
    function freedesktopIcons(
        icons: string[] | string,
        themes?: string[] | string,
        exts?: string[] | string,
        fallbackPaths?: string[] | string,
    ): Promise<string | null>;
    export default freedesktopIcons;
}
