import { HomePage } from "@/pages/HomePage";
import { useConsoleLogging } from "./hooks/useConsoleLogging";

function App() {
  useConsoleLogging();

  return <HomePage />;
}

export default App;
