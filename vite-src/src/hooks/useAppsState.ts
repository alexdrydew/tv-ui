import { APP_UPDATE_EVENT } from "@/api/application";
import { AppStateSchema } from "@/api/schema";
import { App, LaunchedApp } from "@/entities/app";
import { listen } from "@tauri-apps/api/event";
import { debug } from "@tauri-apps/plugin-log";
import { useEffect, useState } from "react";

export function useAppsState(
  apps: Record<string, App>,
): [Record<string, App>, (apps: Record<string, App>) => void] {
  const [appsState, setAppsState] = useState(apps);

  useEffect(() => {
    let unlisten: () => void = () => {};

    async function subscribeToAppEvents() {
      unlisten = await listen(APP_UPDATE_EVENT, (event) => {
        const updatedState = AppStateSchema.parse(event);
        const currentApp = appsState[updatedState.id];
        const launchedApp: LaunchedApp = {
          ...currentApp,
          state: updatedState,
        };
        appsState[updatedState.id] = launchedApp;
        setAppsState(appsState);
        debug(`event: ${JSON.stringify(updatedState)}`);
      });
    }

    subscribeToAppEvents();

    return () => unlisten();
  }, []);

  return [appsState, setAppsState];
}
