import { TvAppLayout } from "@/components/layout/TvAppLayout";
import { Header } from "@/components/layout/Header";
import { AppGrid } from "@/components/layout/AppGrid";
import { info, error } from "@tauri-apps/plugin-log";
import { App, instantiateApp } from "@/entities/app";
import { useApps } from "@/hooks/useApps";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

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

  const apps = useApps();

  if (apps === undefined) {
    return <div>Loading apps...</div>;
  }

  return (
    <TvAppLayout>
      <Header />
      <main className="py-8">
        <h2 className="text-2xl md:text-3xl font-bold mb-6 px-8">Apps</h2>
        <AppGrid apps={apps} onLaunchApp={handleLaunchApp} />
      </main>
      <Toaster />
    </TvAppLayout>
  );
}
