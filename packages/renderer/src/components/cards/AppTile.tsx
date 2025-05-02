import { AppWindow } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../ui/appButton';
import { useRef, useLayoutEffect } from 'react';
import { AppConfigId, LaunchInstanceId } from '@app/types';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from '../ui/context-menu';

interface AppTileProps {
    name: string;
    icon: string | undefined;
    isFocused: boolean;
    isRunning: boolean;
    runningInstanceIds: LaunchInstanceId[];
    onSelect: () => void;
    onFocus: () => void;
    onKill: (launchInstanceId: LaunchInstanceId) => void;
    onRemove: () => void;
    onEdit: () => void;
    id: AppConfigId;
}

export function AppTile({
    id,
    name,
    icon,
    isFocused,
    isRunning,
    runningInstanceIds,
    onSelect,
    onFocus,
    onKill,
    onRemove,
    onEdit,
}: AppTileProps) {
    const buttonRef = useRef<HTMLButtonElement>(null);

    useLayoutEffect(() => {
        if (isFocused && buttonRef.current) {
            buttonRef.current.focus();
        }
    }, [isFocused]);

    const focusSelf = (e: { currentTarget: { focus: () => void } }) => {
        onFocus();
        e.currentTarget.focus();
    };

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
        <ContextMenu>
            <ContextMenuTrigger>
                <Button
                    ref={buttonRef}
                    data-testid={`app-tile-${id}`}
                    className={cn(
                        'flex flex-col items-center w-64 h-64 relative',
                    )}
                    onClick={onSelect}
                    onMouseOver={focusSelf}
                    onFocus={focusSelf}
                >
                    <div className="flex-1 w-48 h-48 items-center justify-center">
                        {icon ? (
                            <img
                                src={icon}
                                alt={name}
                                className="object-contain size-full"
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
                                className="absolute bottom-2 right-2 w-3 h-3 bg-green-500 rounded-full"
                                title={`Running (${runningInstanceIds.length} instance${runningInstanceIds.length === 1 ? '' : 's'})`}
                            />
                        )}
                    </div>
                    <div className="flex items-center justify-center">
                        <h2 className="flex-1 text-xl md:text-2xl font-bold">
                            {name}
                        </h2>
                    </div>
                </Button>
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
    );
}
