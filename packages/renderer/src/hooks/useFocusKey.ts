import { useId, useMemo } from 'react';

/**
 * Generates a unique and stable focus key string for spatial navigation components.
 *
 * @param prefix - An optional prefix for the generated key.
 * @returns A unique string suitable for use as a focus key.
 */
export function useFocusKey(prefix: string = 'focusable'): string {
    const uniqueId = useId();
    const componentId = useMemo(
        () => `${prefix}-${uniqueId}`,
        [prefix, uniqueId],
    );
    return componentId;
}
