import { useEffect, useState } from "react";
import { getApps } from "@/api/application";
import { watchImmediate, exists, mkdir } from "@tauri-apps/plugin-fs";
import { appConfigDir, join } from "@tauri-apps/api/path";
import { debug, info, error, attachConsole } from "@tauri-apps/plugin-log";

export interface App {
  id: string;
  name: string;
  icon: string;
  launchCommand: string;
  pid?: number;
}

async function setupConsoleLogging() {
  try {
    return await attachConsole();
  } catch (e) {
    error(`Failed to attach console: ${e}`);
    return () => {};
  }
}

async function loadAppsFromConfig() {
  const appConfigPath = await appConfigDir();
  const configPath = await join(appConfigPath, "tv-ui.json");
  return await getApps(configPath);
}

async function setupFileWatcher(onConfigChange: () => void) {
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
        onConfigChange();
      }
    },
    { recursive: false },
  );

  return stop;
}

export function useAppConfiguration() {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unwatch: () => void = () => {};
    let detachConsole: () => void = () => {};

    async function initialize() {
      try {
        detachConsole = await setupConsoleLogging();

        const fetchApps = async () => {
          try {
            const configApps = await loadAppsFromConfig();
            setApps(configApps.length > 0 ? configApps : []);
          } catch (e) {
            error(`Failed to load apps: ${e}`);
          } finally {
            setLoading(false);
            debug("Finished loading apps");
          }
        };

        try {
          unwatch = await setupFileWatcher(fetchApps);
        } catch (e) {
          error(`Error setting up watcher: ${e}`);
        }

        await fetchApps();
      } catch (e) {
        error(`Initialization error: ${e}`);
        setLoading(false);
      }
    }

    initialize();

    return () => {
      unwatch();
      detachConsole();
    };
  }, []);

  return { apps, loading };
}
