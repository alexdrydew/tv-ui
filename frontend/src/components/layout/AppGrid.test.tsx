import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { AppGrid } from "./AppGrid";
import { App } from "@/entities/app";

vi.mock("@/components/cards/AppTile", () => ({
  AppTile: ({ name, isFocused, ... }: any) => (
    <div data-testid={`app-tile-${name}`} data-focused={String(isFocused)}>
      {name}
    </div>
  ),
}));

const mockApps: App[] = [
  {
    config: {
      id: "app1",
      name: "App One",
      icon: "icon1.png",
      launchCommand: "cmd1",
    },
    instances: [],
  },
  {
    config: {
      id: "app2",
      name: "App Two",
      icon: "icon2.png",
      launchCommand: "cmd2",
    },
    instances: [],
  },
  {
    config: {
      id: "app3",
      name: "App Three",
      icon: "icon3.png",
      launchCommand: "cmd3",
    },
    instances: [],
  },
];

const mockOnLaunchApp = vi.fn();
const mockOnKillApp = vi.fn();

describe("AppGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.focus();
  });

  afterEach(() => {
    cleanup();
  });

  it("should focus the first app tile initially", () => {
    render(
      <AppGrid
        apps={mockApps}
        onLaunchApp={mockOnLaunchApp}
        onKillApp={mockOnKillApp}
      />,
    );
    expect(screen.getByTestId("app-tile-App One")).toHaveAttribute(
      "data-focused",
      "true",
    );
    expect(screen.getByTestId("app-tile-App Two")).toHaveAttribute(
      "data-focused",
      "false",
    );
    expect(screen.getByTestId("app-tile-App Three")).toHaveAttribute(
      "data-focused",
      "false",
    );
  });

  describe("Keyboard Navigation: ArrowRight", () => {
    it("should focus the next app tile when ArrowRight is pressed", () => {
      render(
        <AppGrid
          apps={mockApps}
          onLaunchApp={mockOnLaunchApp}
          onKillApp={mockOnKillApp}
        />,
      );
      fireEvent.keyDown(document.body, { key: "ArrowRight" });

      expect(screen.getByTestId("app-tile-App One")).toHaveAttribute(
        "data-focused",
        "false",
      );
      expect(screen.getByTestId("app-tile-App Two")).toHaveAttribute(
        "data-focused",
        "true",
      );
      expect(screen.getByTestId("app-tile-App Three")).toHaveAttribute(
        "data-focused",
        "false",
      );
    });

    it("should focus the last app tile when ArrowRight is pressed multiple times", () => {
      render(
        <AppGrid
          apps={mockApps}
          onLaunchApp={mockOnLaunchApp}
          onKillApp={mockOnKillApp}
        />,
      );
      fireEvent.keyDown(document.body, { key: "ArrowRight" });
      fireEvent.keyDown(document.body, { key: "ArrowRight" });

      expect(screen.getByTestId("app-tile-App One")).toHaveAttribute(
        "data-focused",
        "false",
      );
      expect(screen.getByTestId("app-tile-App Two")).toHaveAttribute(
        "data-focused",
        "false",
      );
      expect(screen.getByTestId("app-tile-App Three")).toHaveAttribute(
        "data-focused",
        "true",
      );
    });

    it("should not change focus when ArrowRight is pressed on the last app tile", () => {
      render(
        <AppGrid
          apps={mockApps}
          onLaunchApp={mockOnLaunchApp}
          onKillApp={mockOnKillApp}
        />,
      );
      fireEvent.keyDown(document.body, { key: "ArrowRight" });
      fireEvent.keyDown(document.body, { key: "ArrowRight" });
      expect(screen.getByTestId("app-tile-App Three")).toHaveAttribute(
        "data-focused",
        "true",
      );

      fireEvent.keyDown(document.body, { key: "ArrowRight" });

      expect(screen.getByTestId("app-tile-App One")).toHaveAttribute(
        "data-focused",
        "false",
      );
      expect(screen.getByTestId("app-tile-App Two")).toHaveAttribute(
        "data-focused",
        "false",
      );
      expect(screen.getByTestId("app-tile-App Three")).toHaveAttribute(
        "data-focused",
        "true",
      );
    });
  });

  describe("Keyboard Navigation: ArrowLeft", () => {
    it("should focus the previous app tile when ArrowLeft is pressed", () => {
      render(
        <AppGrid
          apps={mockApps}
          onLaunchApp={mockOnLaunchApp}
          onKillApp={mockOnKillApp}
        />,
      );
      fireEvent.keyDown(document.body, { key: "ArrowRight" });
      expect(screen.getByTestId("app-tile-App Two")).toHaveAttribute(
        "data-focused",
        "true",
      );

      fireEvent.keyDown(document.body, { key: "ArrowLeft" });

      expect(screen.getByTestId("app-tile-App One")).toHaveAttribute(
        "data-focused",
        "true",
      );
      expect(screen.getByTestId("app-tile-App Two")).toHaveAttribute(
        "data-focused",
        "false",
      );
      expect(screen.getByTestId("app-tile-App Three")).toHaveAttribute(
        "data-focused",
        "false",
      );
    });

    it("should not change focus when ArrowLeft is pressed on the first app tile", () => {
      render(
        <AppGrid
          apps={mockApps}
          onLaunchApp={mockOnLaunchApp}
          onKillApp={mockOnKillApp}
        />,
      );
      expect(screen.getByTestId("app-tile-App One")).toHaveAttribute(
        "data-focused",
        "true",
      );

      fireEvent.keyDown(document.body, { key: "ArrowLeft" });

      expect(screen.getByTestId("app-tile-App One")).toHaveAttribute(
        "data-focused",
        "true",
      );
      expect(screen.getByTestId("app-tile-App Two")).toHaveAttribute(
        "data-focused",
        "false",
      );
      expect(screen.getByTestId("app-tile-App Three")).toHaveAttribute(
        "data-focused",
        "false",
      );
    });
  });
});
