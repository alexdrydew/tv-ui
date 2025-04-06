import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { AppTile } from "./AppTile";

describe("AppTile", () => {
  const mockOnSelect = vi.fn();
  const mockOnFocus = vi.fn();
  const mockOnKill = vi.fn();

  const defaultProps = {
    name: "Test App",
    icon: "test-icon.png",
    isFocused: false,
    isRunning: false,
    onSelect: mockOnSelect,
    onFocus: mockOnFocus,
    onKill: mockOnKill,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the app name and icon", () => {
    render(<AppTile {...defaultProps} />);
    expect(screen.getByText("Test App")).toBeInTheDocument();
    expect(screen.getByAltText("Test App")).toHaveAttribute(
      "src",
      "test-icon.png",
    );
  });

  it("calls onSelect when clicked", async () => {
    render(<AppTile {...defaultProps} />);
    const button = screen.getByRole("button", { name: /Test App/i });
    await userEvent.click(button);
    expect(mockOnSelect).toHaveBeenCalledTimes(1);
  });

  it("calls onFocus when focused", () => {
    render(<AppTile {...defaultProps} />);
    const button = screen.getByRole("button", { name: /Test App/i });
    fireEvent.focus(button);
    expect(mockOnFocus).toHaveBeenCalledTimes(2);
  });

  it("calls onFocus when hovered", async () => {
    render(<AppTile {...defaultProps} />);
    const button = screen.getByRole("button", { name: /Test App/i });
    await userEvent.hover(button);
    expect(mockOnFocus).toHaveBeenCalledTimes(2);
  });

  it("focuses the button when isFocused is true", () => {
    render(<AppTile {...defaultProps} isFocused={true} />);
    const button = screen.getByRole("button", { name: /Test App/i });
    expect(button).toHaveFocus();
    // TODO: should it really be called?
    expect(mockOnFocus).toHaveBeenCalledTimes(1);
  });

  it("shows running indicator when isRunning is true", () => {
    render(<AppTile {...defaultProps} isRunning={true} />);
    const button = screen.getByRole("button", { name: /Test App/i });
    // TODO: what us we slightly change color?
    const indicator = button.querySelector(".bg-green-500");
    expect(indicator).toBeInTheDocument();
    // TODO: should we really check such specific classes?
    expect(indicator).toHaveClass(
      "absolute bottom-2 right-2 w-3 h-3 rounded-full",
    );
  });

  it("does not show running indicator when isRunning is false", () => {
    render(<AppTile {...defaultProps} isRunning={false} />);
    const button = screen.getByRole("button", { name: /Test App/i });
    // TODO: what us we slightly change color?
    const indicator = button.querySelector(".bg-green-500");
    expect(indicator).not.toBeInTheDocument();
  });

  it("context menu 'Kill' option is disabled when not running", async () => {
    render(<AppTile {...defaultProps} isRunning={false} />);
    const button = screen.getByRole("button", { name: /Test App/i });
    fireEvent.contextMenu(button);

    const killMenuItem = await screen.findByRole("menuitem", { name: "Kill" });
    expect(killMenuItem).toBeInTheDocument();
    expect(killMenuItem).toHaveAttribute("aria-disabled", "true");
  });

  it("context menu 'Kill' option is enabled and calls onKill when running", async () => {
    render(<AppTile {...defaultProps} isRunning={true} />);
    const button = screen.getByRole("button", { name: /Test App/i });
    fireEvent.contextMenu(button);

    const killMenuItem = await screen.findByRole("menuitem", { name: "Kill" });
    expect(killMenuItem).toBeInTheDocument();
    expect(killMenuItem).not.toHaveAttribute("aria-disabled", "true");

    await userEvent.click(killMenuItem);
    expect(mockOnKill).toHaveBeenCalledTimes(1);
  });
});
