import { AppTile } from "@/components/cards/AppTile";
import { App } from "@/hooks/useAppConfiguration";
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
          key={app.id}
          name={app.name}
          icon={app.icon}
          isFocused={focusedIndex === index}
          isRunning={app.pid !== undefined}
          onFocus={() => setFocusedIndex(index)}
          onSelect={() => handleSelect(app)}
        />
      ))}
    </div>
  );
}
