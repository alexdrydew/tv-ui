export const dropDuplicates = <T extends object>(
    arr: T[],
    path: NestedKeyOf<T>,
): T[] => {
    const seen = new Set();
    return arr.filter((el) => {
        const keys = path.split('.');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let value: any = el;
        for (const k of keys) {
            value = value[k];
        }

        return seen.has(value) ? (seen.add(value), true) : false;
    });
};

// https://gist.github.com/pffigueiredo/9161240b8c09d51ea448fd43de4d8bbc#gistcomment-4003118
type NestedKeyOf<ObjectType extends object> = {
    [Key in keyof ObjectType &
        (string | number)]: ObjectType[Key] extends object
        ? ObjectType[Key] extends { pop: unknown; push: unknown }
            ? `${Key}`
            : `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
        : `${Key}`;
}[keyof ObjectType & (string | number)];
