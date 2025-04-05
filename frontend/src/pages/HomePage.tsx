import { TvAppLayout } from "@/components/layout/TvAppLayout";
import { Header } from "@/components/layout/Header";
import { AppGrid } from "@/components/layout/AppGrid";
import { info, error } from "@tauri-apps/plugin-log";
import { App, instantiateApp } from "@/entities/app";
import { useApps } from "@/hooks/useApps";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { killApp } from "@/api/application";

export function HomePage() {
  const handleLaunchApp = (app: App) => {
    info(`Launching app: ${app.config.name}`);
    instantiateApp(app)
      .then((appState) => {
        toast(`${app.config.name} launched successfully`, {
          description: `PID: ${appState.pid}`,
        });
        info(`App launched with PID: ${appState.pid}`);
      })
      .catch((e) => {
        toast(`Failed to launch app: ${app.config.name}`, {
          description: `${e}`,
        });
        error(`Failed to launch app: ${e}`);
      });
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

  const apps = useApps();

  if (apps === undefined) {
    return <div>Loading apps...</div>;
  }

  return (
    <TvAppLayout>
      <Header />
      <main className="py-8">
        <h2 className="text-2xl md:text-3xl font-bold mb-6 px-8">Apps</h2>
        <AppGrid
          apps={apps}
          onLaunchApp={handleLaunchApp}
          onKillApp={handleKillApp}
        />
      </main>
      <Toaster />
    </TvAppLayout>
  );
}
