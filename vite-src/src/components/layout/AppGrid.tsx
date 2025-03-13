import { AppTile } from "@/components/cards/AppTile";
import { useFocusNavigation } from "@/hooks/useFocusNavigation";

interface App {
  id: string;
  name: string;
  icon: string;
  launchCommand: string;
  pid?: number;
}

interface AppGridProps {
  apps: App[];
  onLaunchApp: (command: string) => void;
}

export function AppGrid({ apps, onLaunchApp }: AppGridProps) {
  const { focusedIndex, setFocusedIndex } = useFocusNavigation(apps.length);

  const handleSelect = (command: string) => {
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
          onSelect={() => handleSelect(app.launchCommand)}
        />
      ))}
    </div>
  );
}
