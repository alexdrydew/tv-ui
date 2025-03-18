import { APP_UPDATE_EVENT } from "@/api/application";
import { AppStateSchema } from "@/api/schema";
import { App, AppState } from "@/entities/app";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState, useCallback } from "react";

export function useAppsState(
  initialApps: App[]
): [Record<string, App>, (apps: App[]) => void] {
  const [appsState, setAppsState] = useState<Record<string, App>>(
    Object.fromEntries(initialApps.map(app => [app.config.id, app]))
  );

  useEffect(() => {
    const unlistenPromise = listen<AppState>(APP_UPDATE_EVENT, (event) => {
      const updatedState = AppStateSchema.parse(event.payload);
      setAppsState(prev => ({
        ...prev,
        [updatedState.id]: {
          ...prev[updatedState.id],
          state: updatedState
        }
      }));
    });

    return () => {
      unlistenPromise.then(fn => fn()).catch(console.error);
    };
  }, []);

  const updateApps = useCallback((newApps: App[]) => {
    setAppsState(prev => {
      const newState = { ...prev };
      // Merge new configs with existing state
      newApps.forEach(app => {
        newState[app.config.id] = {
          ...app,
          state: prev[app.config.id]?.state
        };
      });
      return newState;
    });
  }, []);

  return [appsState, updateApps];
}
