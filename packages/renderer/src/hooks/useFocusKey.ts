import { useId, useMemo } from 'react';

/**
 * Generates a unique and stable focus key string for spatial navigation components.
 *
 * @param prefix - A prefix for the generated key.
 * @returns A unique string suitable for use as a focus key.
 */
export function useFocusKey(prefix: string): string {
    const uniqueId = useId();
    const componentId = useMemo(
        () => `sn:${prefix}-${uniqueId}`,
        [prefix, uniqueId],
    );
    return componentId;
}
