import { cn } from "@/lib/utils";

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
  return (
    <div
      onClick={onSelect}
      onMouseEnter={onFocus}
      className={cn(
        "flex flex-col items-center p-6 rounded-xl transition-all duration-200",
        "w-48 h-48 md:w-64 md:h-64",
        isFocused
          ? "bg-primary scale-110 shadow-lg ring-4 ring-primary"
          : "bg-card hover:bg-card/80",
      )}
    >
      <div className="flex-1 flex items-center justify-center">
        <img src={icon} alt={name} className="w-24 h-24 md:w-32 md:h-32" />
        {isRunning && (
          <div className="absolute bottom-2 right-2 w-3 h-3 bg-green-500 rounded-full ring-2 ring-background" />
        )}
      </div>
      <h2 className="text-xl md:text-2xl font-bold mt-4">{name}</h2>
    </div>
  );
}
