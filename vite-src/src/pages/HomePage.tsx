import { TvAppLayout } from "@/components/layout/TvAppLayout";
import { Header } from "@/components/layout/Header";
import { AppGrid } from "@/components/layout/AppGrid";
// import { api } from "@/lib/api";

const SAMPLE_APPS = [
  {
    id: "1",
    name: "Netflix",
    icon: "/icons/netflix.png",
    launchCommand: "netflix://app",
  },
  {
    id: "2",
    name: "YouTube",
    icon: "/icons/youtube.png",
    launchCommand: "youtube://app",
  },
  {
    id: "3",
    name: "Spotify",
    icon: "/icons/spotify.png",
    launchCommand: "spotify://app",
  },
];

export function HomePage() {
  const handleLaunchApp = (command: string) => {
    console.log(command);
    // api.os.execCommand(command).catch((error) => {
    //   console.error("Failed to launch app:", error);
    // });
  };

  return (
    <TvAppLayout>
      <Header />
      <main className="py-8">
        <h2 className="text-2xl md:text-3xl font-bold mb-6 px-8">Apps</h2>
        <AppGrid apps={SAMPLE_APPS} onLaunchApp={handleLaunchApp} />
      </main>
    </TvAppLayout>
  );
}
