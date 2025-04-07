import { cn } from "@/lib/utils";
import { Button } from "../ui/appButton";
import { useRef, useLayoutEffect } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../ui/context-menu";

interface AppTileProps {
  name: string;
  icon: string;
  isFocused: boolean;
  isRunning: boolean;
  onSelect: () => void;
  onFocus: () => void;
  onKill: () => void;
  onRemove: () => void;
}

export function AppTile({
  name,
  icon,
  isFocused,
  isRunning,
  onSelect,
  onFocus,
  onKill,
  onRemove,
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

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Button
          ref={buttonRef}
          className={cn("flex flex-col items-center w-64 h-64 relative")}
          onClick={onSelect}
          onMouseOver={focusSelf}
          onFocus={focusSelf}
        >
          <div className="flex-1 flex items-center justify-center">
            <img src={icon} alt={name} className="w-32 h-32" />
            {isRunning && (
              <div
                data-testid="running-indicator"
                className="absolute bottom-2 right-2 w-3 h-3 bg-green-500 rounded-full"
              />
            )}
          </div>
          <h2 className="text-xl md:text-2xl font-bold mt-4">{name}</h2>
        </Button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuItem
          disabled={!isRunning}
          onClick={onKill}
          variant="destructive"
        >
          Kill
        </ContextMenuItem>
        <ContextMenuItem
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
