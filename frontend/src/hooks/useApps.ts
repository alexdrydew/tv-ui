import { AppConfig, getAppConfigs } from "@/api/application";
import { initAppsFromConfigs } from "@/entities/app";
import { appConfigDir, join } from "@tauri-apps/api/path";
import { watchImmediate } from "@tauri-apps/plugin-fs";
import { debug, error, info } from "@tauri-apps/plugin-log";
import {
  APP_UPDATE_EVENT,
  CONFIG_UPDATE_EVENT,
  AppState,
} from "@/api/application";
import { App } from "@/entities/app";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";

export function useAppConfigs(configFileName: string): {
  configs: AppConfig[] | undefined;
  configFilePath: string | undefined;
} {
  const [configFilePath, setConfigFilePath] = useState<string | undefined>();

  useEffect(() => {
    appConfigDir().then(async (path) => {
      setConfigFilePath(await join(path, configFileName));
    });
  }, [configFileName]);

  const [config, setConfig] = useState<AppConfig[] | undefined>();

  useEffect(() => {
    if (!configFilePath) {
      return;
    }
    getAppConfigs(configFilePath).then(setConfig).catch(error);
  }, [configFilePath]);

  useEffect(() => {
    if (!configFilePath) {
      return;
    }

    debug(`Watching config file: ${configFilePath}`);

    const unWatch = watchImmediate(
      configFilePath,
      (event) => {
        if (typeof event.type !== "string" && "access" in event.type) {
          return;
        }

        debug(`File system event received: ${JSON.stringify(event)}`);
        if (event.paths.some((p) => p === configFilePath)) {
          info("Config file updated");
          getAppConfigs(configFilePath).then(setConfig).catch(error);
        }
      },
      { recursive: false },
    );

    return () => {
      unWatch.then((fn) => fn()).catch(error);
    };
  }, [configFilePath]);

  useEffect(() => {
    if (!configFilePath) {
      return;
    }
    const unlistenPromise = listen<AppConfig[]>(
      CONFIG_UPDATE_EVENT,
      (event) => {
        debug(`Config update event received: ${JSON.stringify(event.payload)}`);
        setConfig(event.payload);
      },
    );

    return () => {
      unlistenPromise.then((fn) => fn()).catch(error);
    };
  }, [configFilePath]); // Re-subscribe if configFilePath changes

  return { configs: config, configFilePath };
}

export function useAppStateUpdateEventsSubscription(
  onUpdate: (state: AppState) => void,
) {
  useEffect(() => {
    const unlistenPromise = listen<AppState>(APP_UPDATE_EVENT, (event) => {
      debug(`App state update event received: ${JSON.stringify(event)}`);
      onUpdate(event.payload);
    });

    return () => {
      unlistenPromise.then((fn) => fn()).catch(console.error);
    };
  }, [onUpdate]);
}

export function useApps(): {
  apps: App[] | undefined;
  configFilePath: string | undefined;
} {
  const { configs: appConfigs, configFilePath } = useAppConfigs("tv-ui.json");
  const [apps, setApps] = useState<App[] | undefined>([]);

  useEffect(() => {
    // Check configs specifically, not the whole object
    if (appConfigs === undefined) {
      setApps(undefined);
      return;
    }

    setApps(initAppsFromConfigs(appConfigs));
  }, [appConfigs]);

  const updateApps = useCallback(
    (state: AppState) => {
      if (apps === undefined) {
        return;
      }

      const newApps = [...apps];
      const targetAppIdx = newApps.findIndex(
        (app) => app.config.id == state.configId,
      );
      if (targetAppIdx === -1) {
        return;
      }

      const targetApp = { ...newApps[targetAppIdx] };
      const instanceIdx = targetApp.instances.findIndex(
        (instance) => instance.pid == state.pid,
      );
      if (instanceIdx === -1) {
        targetApp.instances.push(state);
      } else {
        targetApp.instances[instanceIdx] = state;
      }

      newApps[targetAppIdx] = targetApp;

      setApps(newApps);
      debug(JSON.stringify(newApps));
    },
    [apps],
  );

  useAppStateUpdateEventsSubscription(updateApps);

  return { apps, configFilePath };
}
