import { TvAppLayout } from "@/components/layout/TvAppLayout";
import { Header } from "@/components/layout/Header";
import { AppGrid } from "@/components/layout/AppGrid";
import { invoke } from "@tauri-apps/api/core";
import { info, error } from "@tauri-apps/plugin-log";
import { useAppConfiguration, App } from "@/hooks/useAppConfiguration";

export function HomePage() {
  const handleLaunchApp = (app: App) => {
    info(`Launching app: ${app.name}`);
    invoke("launch_app", { executablePath: app.launchCommand, appId: app.id })
      .then((pid) => {
        info(`App launched with PID: ${pid}`);
      })
      .catch((e) => {
        error(`Failed to launch app: ${e}`);
      });
  };

  const { apps, loading } = useAppConfiguration();

  if (loading) {
    return <div>Loading apps...</div>;
  }

  return (
    <TvAppLayout>
      <Header />
      <main className="py-8">
        <h2 className="text-2xl md:text-3xl font-bold mb-6 px-8">Apps</h2>
        <AppGrid apps={apps} onLaunchApp={handleLaunchApp} />
      </main>
    </TvAppLayout>
  );
}
