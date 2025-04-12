import { App } from '@/entities/app';
import { useFocusNavigation } from '@/hooks/useFocusNavigation';
import React from 'react';

interface AppGridProps<T extends App> {
    apps: T[];
    onLaunchApp: (app: T) => void;
    onKillApp: (app: T) => void;
    onRemoveApp: (app: T) => void;
    onEditApp: (app: T) => void;
    renderItem: (props: {
        app: T;
        index: number;
        isFocused: boolean;
        setFocusedIndex: (index: number) => void;
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
    const { focusedIndex, setFocusedIndex } = useFocusNavigation(apps.length);

    return (
        <div className="flex gap-8 p-4">
            {apps.map((app, index) =>
                renderItem({
                    app,
                    index,
                    isFocused: focusedIndex === index,
                    setFocusedIndex,
                    onLaunchApp,
                    onKillApp,
                    onRemoveApp,
                    onEditApp,
                }),
            )}
        </div>
    );
}
