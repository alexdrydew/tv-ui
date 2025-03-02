import { AppTile } from "@/components/cards/AppTile";
import { useFocusNavigation } from "@/hooks/useFocusNavigation";

interface App {
  id: string;
  name: string;
  icon: string;
  launchCommand: string;
}

interface AppGridProps {
  apps: App[];
  onLaunchApp: (command: string) => void;
}

export function AppGrid({ apps, onLaunchApp }: AppGridProps) {
  const ITEMS_PER_ROW = 4;
  const { focusedIndex, setFocusedIndex } = useFocusNavigation(
    apps.length,
    ITEMS_PER_ROW,
  );

  const handleSelect = (command: string) => {
    onLaunchApp(command);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 p-4">
      {apps.map((app, index) => (
        <AppTile
          key={app.id}
          name={app.name}
          icon={app.icon}
          isFocused={focusedIndex === index}
          onFocus={() => setFocusedIndex(index)}
          onSelect={() => handleSelect(app.launchCommand)}
        />
      ))}
    </div>
  );
}
