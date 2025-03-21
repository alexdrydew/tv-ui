import { AppTile } from "@/components/cards/AppTile";
import { App, is_launched } from "@/entities/app";
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
    <div className="flex gap-8 p-4">
      {apps.map((app, index) => (
        <AppTile
          key={app.config.id}
          name={app.config.name}
          icon={app.config.icon}
          isFocused={focusedIndex === index}
          isRunning={is_launched(app)}
          onFocus={() => setFocusedIndex(index)}
          onSelect={() => handleSelect(app)}
        />
      ))}
    </div>
  );
}
