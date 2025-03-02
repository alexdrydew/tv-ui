import { HomePage } from "@/pages/HomePage";
import { useEffect } from "react";
// import { setupRemoteControl } from "@/lib/remote-control";

function App() {
  useEffect(() => {
    // setupRemoteControl();
  }, []);

  return <HomePage />;
}

export default App;
