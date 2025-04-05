import { AppTile } from "@/components/cards/AppTile";
import { App, isLaunched } from "@/entities/app";
import { useFocusNavigation } from "@/hooks/useFocusNavigation";

interface AppGridProps {
  apps: App[];
  onLaunchApp: (command: App) => void;
  onKillApp: (command: App) => void;
}

export function AppGrid({ apps, onLaunchApp, onKillApp }: AppGridProps) {
  const { focusedIndex, setFocusedIndex } = useFocusNavigation(apps.length);

  return (
    <div className="flex gap-8 p-4">
      {apps.map((app, index) => (
        <AppTile
          key={app.config.id}
          name={app.config.name}
          icon={app.config.icon}
          isFocused={focusedIndex === index}
          isRunning={isLaunched(app)}
          onFocus={() => setFocusedIndex(index)}
          onSelect={() => onLaunchApp(app)}
          onKill={() => onKillApp(app)}
        />
      ))}
    </div>
  );
}
