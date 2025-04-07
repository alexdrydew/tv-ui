import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { AppTile } from "./AppTile";

describe("AppTile", () => {
  const mockOnSelect = vi.fn();
  const mockOnFocus = vi.fn();
  const mockOnKill = vi.fn();
  const mockOnRemove = vi.fn();

  const defaultProps = {
    name: "Test App",
    icon: "test-icon.png",
    isFocused: false,
    isRunning: false,
    onSelect: mockOnSelect,
    onFocus: mockOnFocus,
    onKill: mockOnKill,
    onRemove: mockOnRemove,
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

  it("keeps focus after being clicked", async () => {
    render(<AppTile {...defaultProps} />);
    const button = screen.getByRole("button", { name: /Test App/i });
    await userEvent.click(button);
    expect(button).toHaveFocus();
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
    expect(mockOnFocus).toHaveBeenCalledTimes(1);
  });

  it("shows running indicator when isRunning is true", () => {
    render(<AppTile {...defaultProps} isRunning={true} />);
    const indicator = screen.queryByTestId("running-indicator");
    expect(indicator).toBeInTheDocument();
  });

  it("does not show running indicator when isRunning is false", () => {
    render(<AppTile {...defaultProps} isRunning={false} />);
    const indicator = screen.queryByTestId("running-indicator");
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

  it("context menu 'Delete app' option is disabled when running", async () => {
    render(<AppTile {...defaultProps} isRunning={true} />);
    const button = screen.getByRole("button", { name: /Test App/i });
    fireEvent.contextMenu(button);

    const removeMenuItem = await screen.findByRole("menuitem", {
      name: "Delete app",
    });
    expect(removeMenuItem).toBeInTheDocument();
    expect(removeMenuItem).toHaveAttribute("aria-disabled", "true");
  });

  it("context menu 'Delete app' option is enabled and calls onRemove when not running", async () => {
    render(<AppTile {...defaultProps} isRunning={false} />);
    const button = screen.getByRole("button", { name: /Test App/i });
    fireEvent.contextMenu(button);

    const removeMenuItem = await screen.findByRole("menuitem", {
      name: "Delete app",
    });
    expect(removeMenuItem).toBeInTheDocument();
    expect(removeMenuItem).not.toHaveAttribute("aria-disabled", "true");

    await userEvent.click(removeMenuItem);
    expect(mockOnRemove).toHaveBeenCalledTimes(1);
  });
});
