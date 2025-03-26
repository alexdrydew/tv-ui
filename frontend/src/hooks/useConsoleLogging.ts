import { attachConsole, error } from "@tauri-apps/plugin-log";
import { useEffect } from "react";

export function useConsoleLogging() {
  useEffect(() => {
    const cleanup = attachConsole();
    return () => {
      cleanup.then((f) => f()).catch(error);
    };
  }, []);
}
