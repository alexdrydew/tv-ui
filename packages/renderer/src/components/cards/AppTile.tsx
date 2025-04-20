import { AppWindow } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../ui/appButton';
import { useRef, useLayoutEffect } from 'react';
import { AppConfigId, LaunchInstanceId } from '@app/types'; // Import LaunchInstanceId
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
    isRunning: boolean; // Indicates if *any* instance is running
    runningInstanceIds: LaunchInstanceId[]; // Pass the IDs of running instances
    onSelect: () => void;
    onFocus: () => void;
    onKill: (launchInstanceId: LaunchInstanceId) => void; // Changed: Expects instance ID
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
    runningInstanceIds, // Receive running instance IDs
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
        // we need to explicitly focus self here in case the component
        // lost focus but isFocused it still true
        e.currentTarget.focus();
    };

    // Handler for the Kill menu item. Kills the first running instance.
    // A more complex UI could allow choosing which instance to kill.
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
                                className="object-contain"
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
                                title={`Running (${runningInstanceIds.length} instance${runningInstanceIds.length === 1 ? '' : 's'})`} // Add tooltip
                            />
                        )}
                    </div>
                    <h2 className="text-xl md:text-2xl font-bold mt-4">
                        {name}
                    </h2>
                </Button>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-64">
                <ContextMenuItem disabled={isRunning} onClick={onEdit}>
                    Edit
                </ContextMenuItem>
                <ContextMenuItem
                    // Disable Kill if no instances are running
                    disabled={!isRunning || runningInstanceIds.length === 0}
                    onClick={handleKill} // Use the new handler
                    variant="destructive"
                >
                    {/* TODO: Improve text if multiple instances? "Kill Instance"? */}
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
