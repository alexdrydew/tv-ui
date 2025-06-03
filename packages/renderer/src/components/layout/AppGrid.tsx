import { App } from '@app/types';
import {
    FocusContext,
    useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import React, { useMemo } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout';
import 'react-grid-layout/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

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
    tileWidth?: number;
    tileHeight?: number;
}

type GridBreakpoint = 'lg' | 'md' | 'sm' | 'xs' | 'xxs';

export function AppGrid<T extends App>({
    apps,
    onLaunchApp,
    onKillApp,
    onRemoveApp,
    onEditApp,
    renderItem,
    tileWidth = 2,
    tileHeight = 2,
}: AppGridProps<T>) {
    const { ref, focusKey } = useFocusable({
        focusKey: 'sn:main-app-grid',
        forceFocus: true,
    });

    const cols = useMemo(() => {
        return { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
    }, []);

    const layouts = useMemo(() => {
        const layout = (bp: GridBreakpoint) =>
            apps.map((app, index) => ({
                i: app.config.id,
                x: (index * tileWidth) % cols[bp],
                y: Math.floor(index / cols[bp]) * tileHeight,
                w: tileWidth,
                h: tileHeight,
            }));

        return {
            lg: layout('lg'),
            md: layout('md'),
            sm: layout('sm'),
            xs: layout('xs'),
            xxs: layout('xxs'),
        };
    }, [apps, cols, tileHeight, tileWidth]);

    const breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };

    return (
        <FocusContext.Provider value={focusKey}>
            <div ref={ref} className="p-4">
                <ResponsiveGridLayout
                    className="layout"
                    layouts={layouts}
                    breakpoints={breakpoints}
                    cols={cols}
                    rowHeight={120}
                    margin={[16, 16]}
                    containerPadding={[0, 0]}
                    isDraggable={false}
                    isResizable={false}
                    useCSSTransforms={true}
                    compactType="vertical"
                >
                    {apps.map((app, index) => (
                        <div key={app.config.id}>
                            {renderItem({
                                app,
                                index,
                                onLaunchApp,
                                onKillApp,
                                onRemoveApp,
                                onEditApp,
                            })}
                        </div>
                    ))}
                </ResponsiveGridLayout>
            </div>
        </FocusContext.Provider>
    );
}
