import { App } from '@app/types';
import {
    FocusContext,
    useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import React, { useEffect } from 'react';

interface AppGridProps<T extends App> {
    apps: T[];
    onLaunchApp: (app: T) => void;
    onKillApp: (app: T) => void;
    onRemoveApp: (app: T) => void;
    onEditApp: (app: T) => void;
    renderItem: (props: {
        app: T;
        index: number;
        onLaunchApp: (app: T) => void;
        onKillApp: (app: T) => void;
        onRemoveApp: (app: T) => void;
        onEditApp: (app: T) => void;
    }) => React.ReactNode;
}

export function AppGrid<T extends App>({
    apps,
    onLaunchApp,
    onKillApp,
    onRemoveApp,
    onEditApp,
    renderItem,
}: AppGridProps<T>) {
    const { ref, focusKey, focusSelf } = useFocusable({ forceFocus: true });

    useEffect(() => {
        focusSelf();
    }, [focusSelf]);

    return (
        <FocusContext.Provider value={focusKey}>
            <div ref={ref} className="flex flex-wrap gap-8 p-4">
                {apps.map((app, index) =>
                    renderItem({
                        app,
                        index,
                        onLaunchApp,
                        onKillApp,
                        onRemoveApp,
                        onEditApp,
                    }),
                )}
            </div>
        </FocusContext.Provider>
    );
}
