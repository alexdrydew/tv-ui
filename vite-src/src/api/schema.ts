export type AppExitResult = "Success" | { ExitCode: number } | { Signal: number } | "Unknown" | null;

export interface AppState {
  id: string;
  pid: number;
  exit_result: AppExitResult;
}
