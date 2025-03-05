import { TvAppLayout } from "@/components/layout/TvAppLayout";
import { Header } from "@/components/layout/Header";
import { AppGrid } from "@/components/layout/AppGrid";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { watchImmediate, exists, mkdir } from "@tauri-apps/plugin-fs";
import { appConfigDir, join } from "@tauri-apps/api/path";
import { debug, info, error, attachConsole } from "@tauri-apps/plugin-log";

const DEFAULT_APP = {
  id: "default-1",
  name: "Sample App",
  icon: "/icons/default.png",
  launchCommand: "sample://app",
};

export function HomePage() {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);

  const handleLaunchApp = (command: string) => {
    info(`Launching app: ${command}`);
    // api.os.execCommand(command).catch((error) => {
    //   error("Failed to launch app: {}", error);
    // });
  };

  useEffect(() => {
    let unwatch: () => void;
    let detachConsole: () => void;

    const setupLogging = async () => {
      try {
        detachConsole = await attachConsole();
      } catch (e) {
        error(`Failed to attach console: ${e}`);
      }
    };

    setupLogging();

    const fetchApps = async () => {
      try {
        const appConfigPath = await appConfigDir();
        const configPath = await join(appConfigPath, "tv-ui.json");
        const configApps = await invoke<App[]>("get_apps", {
          configPath,
        });
        setApps(configApps.length > 0 ? configApps : [DEFAULT_APP]);
      } catch (e) {
        error(`Failed to load apps: ${e}`);
      } finally {
        setLoading(false);
        debug("Finished loading apps");
      }
    };

    const setupWatcher = async () => {
      try {
        const appConfigPath = await appConfigDir();

        if (!(await exists(appConfigPath))) {
          info(`Creating app config directory: ${appConfigPath}`);
          await mkdir(appConfigPath, { recursive: true });
        }

        const configPath = await join(appConfigPath, "tv-ui.json");
        debug(`Setting up config watcher for: ${configPath}`);

        const stop = await watchImmediate(
          appConfigPath,
          (event) => {
            if (typeof event.type !== "string" && "access" in event.type) {
              return;
            }

            debug(`File system event received: ${JSON.stringify(event)}`);
            if (event.paths.some((p) => p === configPath)) {
              info("Config file updated, reloading apps...");
              fetchApps();
            }
          },
          { recursive: false },
        );
        unwatch = () => {
          debug("unwatched");
          stop();
        };
      } catch (e) {
        error(`Error setting up watcher: ${e}`);
      }
    };

    fetchApps();
    setupWatcher();

    return () => {
      if (unwatch) {
        unwatch();
      }
      if (detachConsole) {
        detachConsole();
      }
    };
  }, []);

  if (loading) {
    return <div>Loading apps...</div>;
  }

  info("loaded");

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
