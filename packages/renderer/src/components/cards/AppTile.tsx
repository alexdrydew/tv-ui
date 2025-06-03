import React from 'react';
import { AppWindow } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppButton } from '../ui/appButton';
import { AppConfigId, LaunchInstanceId } from '@app/types';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from '../ui/context-menu';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useFocusKey } from '@/hooks/useFocusKey';

interface AppTileProps {
    name: string;
    icon: string | undefined;
    isRunning: boolean;
    runningInstanceIds: LaunchInstanceId[];
    onSelect: () => void;
    onFocus?: () => void;
    onKill: (launchInstanceId: LaunchInstanceId) => void;
    onRemove: () => void;
    onEdit: () => void;
    id: AppConfigId;
    style?: React.CSSProperties;
    className?: string;
    onMouseDown?: (e: React.MouseEvent) => void;
    onMouseUp?: (e: React.MouseEvent) => void;
    onTouchEnd?: (e: React.TouchEvent) => void;
    ref?: React.Ref<HTMLDivElement>;
}

export const AppTile: React.FC<AppTileProps> = ({
    id,
    name,
    icon,
    isRunning,
    runningInstanceIds,
    onSelect,
    onKill,
    onRemove,
    onEdit,
    style,
    className,
    onMouseDown,
    onMouseUp,
    onTouchEnd,
    ref,
}) => {
    const focusKey = useFocusKey('app-tile');
    const { ref: focusRef, focusSelf } = useFocusable({
        focusKey,
    });

    const handleKill = () => {
        if (runningInstanceIds.length > 0) {
            onKill(runningInstanceIds[0]);
        } else {
            console.warn(
                `Kill requested for ${name}, but no running instance IDs were provided.`,
            );
        }
    };

    return (
        <div
            ref={ref}
            style={style}
            className={cn('size-full', className)}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onTouchEnd={onTouchEnd}
        >
            <ContextMenu>
                <ContextMenuTrigger>
                    <AppButton
                        ref={focusRef}
                        data-testid={`app-tile-${id}`}
                        className="flex flex-col items-center w-full h-full relative"
                        onClick={onSelect}
                        onMouseEnter={focusSelf}
                        onFocus={focusSelf}
                    >
                        <div className="flex-1 flex items-center justify-center p-4">
                            {icon ? (
                                <img
                                    src={icon}
                                    alt={name}
                                    className="object-contain max-w-full max-h-full"
                                />
                            ) : (
                                <AppWindow
                                    data-testid="default-icon"
                                    className="object-contain size-full"
                                />
                            )}
                            {isRunning && (
                                <div
                                    data-testid="running-indicator"
                                    className="absolute top-2 right-2 w-3 h-3 bg-green-500 rounded-full"
                                    title={`Running (${runningInstanceIds.length} instance${runningInstanceIds.length === 1 ? '' : 's'})`}
                                />
                            )}
                        </div>
                        <div className="flex items-center justify-center p-2">
                            <h2 className="text-sm md:text-base font-bold text-center line-clamp-2">
                                {name}
                            </h2>
                        </div>
                    </AppButton>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-64">
                    <ContextMenuItem disabled={isRunning} onClick={onEdit}>
                        Edit
                    </ContextMenuItem>
                    <ContextMenuItem
                        disabled={!isRunning || runningInstanceIds.length === 0}
                        onClick={handleKill}
                        variant="destructive"
                    >
                        Kill
                    </ContextMenuItem>
                    <ContextMenuItem
                        // Disable Delete if any instance is running
                        disabled={isRunning}
                        onClick={onRemove}
                        variant="destructive"
                    >
                        Delete app
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
        </div>
    );
};
