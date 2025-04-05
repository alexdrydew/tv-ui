import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { useRef, useEffect, useLayoutEffect } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../ui/context-menu";
import { info } from "@tauri-apps/plugin-log";

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

  useLayoutEffect(() => {
    if (isFocused && buttonRef.current) {
      buttonRef.current.focus();
    }
  }, [isFocused]);

  const focusSelf = (e: { currentTarget: { focus: () => void } }) => {
    onFocus();
    // we need to explicitly focus self here for in case the component
    // lost focus but isFocused it still true
    e.currentTarget.focus();
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Button
          ref={buttonRef}
          className={cn("flex flex-col items-center w-64 h-64")}
          onClick={onSelect}
          onMouseOver={focusSelf}
          onFocus={focusSelf}
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
