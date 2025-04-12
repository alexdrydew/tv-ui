import { attachConsole, error } from "@/api/logging"; // Use the new API module
import { useEffect } from "react";

export function useConsoleLogging() {
    useEffect(() => {
        const cleanup = attachConsole();
        return () => {
            cleanup.then((f) => f()).catch(error);
        };
    }, []);
}
