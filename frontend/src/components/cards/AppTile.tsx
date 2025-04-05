import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { useRef, useEffect } from "react";
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
}

export function AppTile({
  name,
  icon,
  isFocused,
  isRunning,
  onSelect,
  onFocus,
  onKill,
}: AppTileProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isFocused && buttonRef.current) {
      buttonRef.current.focus();
    }
  }, [isFocused]);

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Button
          ref={buttonRef}
          className={cn(
            "flex flex-col items-center w-64 h-64 focus:bg-primary/90 focus:scale-110 focus:shadow-lg focus:ring-4 focus:ring-primary",
          )}
          onClick={onSelect}
          onMouseOver={onFocus}
          onFocus={onFocus}
        >
          <div className="flex-1 flex items-center justify-center">
            <img src={icon} alt={name} className="w-32 h-32" />
            {isRunning && (
              <div className="absolute bottom-2 right-2 w-3 h-3 bg-green-500 rounded-full ring-2 ring-background" />
            )}
          </div>
          <h2 className="text-xl md:text-2xl font-bold mt-4">{name}</h2>
        </Button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuItem onClick={onKill} variant="destructive">
          Kill
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
