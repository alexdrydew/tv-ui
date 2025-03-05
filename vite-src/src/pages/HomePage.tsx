import { TvAppLayout } from "@/components/layout/TvAppLayout";
import { Header } from "@/components/layout/Header";
import { AppGrid } from "@/components/layout/AppGrid";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export function HomePage() {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);

  const handleLaunchApp = (command: string) => {
    console.log(command);
    // api.os.execCommand(command).catch((error) => {
    //   console.error("Failed to launch app:", error);
    // });
  };

  useEffect(() => {
    invoke<App[]>("get_apps")
      .then((configApps) => {
        setApps(
          configApps.length > 0
            ? configApps
            : [
                {
                  id: "default-1",
                  name: "Sample App",
                  icon: "/icons/default.png",
                  launchCommand: "sample://app",
                },
              ],
        );
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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

interface App {
  id: string;
  name: string;
  icon: string;
  launchCommand: string;
}
