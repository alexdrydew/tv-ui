import { AppTile } from "@/components/cards/AppTile";
import { App, isLaunched } from "@/entities/app";
import { useFocusNavigation } from "@/hooks/useFocusNavigation";
import { toast } from "sonner";
import { killApp } from "@/api/application";

interface AppGridProps {
  apps: App[];
  onLaunchApp: (command: App) => void;
}

export function AppGrid({ apps, onLaunchApp }: AppGridProps) {
  const { focusedIndex, setFocusedIndex } = useFocusNavigation(apps.length);

  const handleSelect = (command: App) => {
    onLaunchApp(command);
  };

  const handleKillApp = async (app: App) => {
    try {
      await killApp(app.config.id);
      toast.success(`${app.config.name} terminated`, {
        description: "Application was successfully stopped",
      });
    } catch (error) {
      toast.error(`Failed to kill ${app.config.name}`, {
        description: `${error}`,
      });
    }
  };

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
          onSelect={() => handleSelect(app)}
          onKill={() => handleKillApp(app)}
        />
      ))}
    </div>
  );
}
