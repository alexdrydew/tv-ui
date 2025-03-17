import { APP_UPDATE_EVENT } from "@/api/application";
import { App } from "@/entities/app";
import { listen } from "@tauri-apps/api/event";
import { debug } from "@tauri-apps/plugin-log";
import { useEffect, useState } from "react";

export function useAppsState(apps: App[]): [App[], (apps: App[]) => void] {
  const [appsState, setAppsState] = useState(apps);

  useEffect(() => {
    let unlisten: () => void = () => {};

    async function subscribeToAppEvents() {
      unlisten = await listen(APP_UPDATE_EVENT, (event) => {
        console.log(event);
        debug(`event: ${JSON.stringify(event)}`);
      });
    }

    subscribeToAppEvents();

    return () => unlisten();
  }, []);

  return [appsState, setAppsState];
}
