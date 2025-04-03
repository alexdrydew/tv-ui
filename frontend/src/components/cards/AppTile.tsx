import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { useRef, useEffect } from "react";

interface AppTileProps {
  name: string;
  icon: string;
  isFocused: boolean;
  isRunning: boolean;
  onSelect: () => void;
  onFocus: () => void;
}

export function AppTile({
  name,
  icon,
  isFocused,
  isRunning,
  onSelect,
  onFocus,
}: AppTileProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isFocused && buttonRef.current) {
      buttonRef.current.focus();
    }
  }, [isFocused]);

  return (
    <Button
      ref={buttonRef}
      className={cn(
        "flex flex-col items-center w-64 h-64 focus:bg-accent focus:text-accent-foreground",
        isFocused && "bg-primary scale-110 shadow-lg ring-4 ring-primary",
      )}
      onClick={onSelect}
      onMouseEnter={onFocus}
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
  );
}
