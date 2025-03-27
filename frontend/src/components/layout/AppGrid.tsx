import { AppTile } from "@/components/cards/AppTile";
import { App, isLaunched } from "@/entities/app";
import { useFocusNavigation } from "@/hooks/useFocusNavigation";

interface AppGridProps {
  apps: App[];
  onLaunchApp: (command: App) => void;
}

export function AppGrid({ apps, onLaunchApp }: AppGridProps) {
  const { focusedIndex, setFocusedIndex } = useFocusNavigation(apps.length);

  const handleSelect = (command: App) => {
    onLaunchApp(command);
  };

  return (
    // ai! add red border for this div
    <div className="flex gap-8 p-4 border-2 border-red-500">
      {apps.map((app, index) => (
        <AppTile
          key={app.config.id}
          name={app.config.name}
          icon={app.config.icon}
          isFocused={focusedIndex === index}
          isRunning={isLaunched(app)}
          onFocus={() => setFocusedIndex(index)}
          onSelect={() => handleSelect(app)}
        />
      ))}
    </div>
  );
}
