import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { AddAppDialog } from "./AddAppDialog";
import * as applicationApi from "@/api/application";
import { toast } from "sonner";
import * as nanoid from "nanoid";

// Mock dependencies
vi.mock("@/api/application", async (importOriginal) => {
  const actual = await importOriginal<typeof applicationApi>();
  return {
    ...actual,
    createAppConfig: vi.fn(),
  };
});
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "mock-nanoid"),
}));
// Mock tauri log plugin if needed, but toast mocking might be sufficient
vi.mock("@tauri-apps/plugin-log", () => ({
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
}));

describe("AddAppDialog", () => {
  const mockOnOpenChange = vi.fn();
  const configFilePath = "/fake/path/to/config.json";

  const defaultProps = {
    isOpen: true,
    onOpenChange: mockOnOpenChange,
    configFilePath: configFilePath,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks that might have been resolved/rejected
    vi.mocked(applicationApi.createAppConfig).mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the dialog with form fields when open", () => {
    render(<AddAppDialog {...defaultProps} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Add New App")).toBeInTheDocument();
    expect(
      screen.getByText("Enter the details for the new application configuration."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("App Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Icon Path")).toBeInTheDocument();
    expect(screen.getByLabelText("Launch Command")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save App" })).toBeInTheDocument();
  });

  it("does not render the dialog when isOpen is false", () => {
    render(<AddAppDialog {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows validation errors for empty required fields", async () => {
    render(<AddAppDialog {...defaultProps} />);
    const saveButton = screen.getByRole("button", { name: "Save App" });

    await userEvent.click(saveButton);

    expect(
      await screen.findByText("App name cannot be empty"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Icon path cannot be empty"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Launch command cannot be empty"),
    ).toBeInTheDocument();

    expect(applicationApi.createAppConfig).not.toHaveBeenCalled();
    expect(mockOnOpenChange).not.toHaveBeenCalled();
  });

  it("calls createAppConfig with correct data on successful submission", async () => {
    render(<AddAppDialog {...defaultProps} />);
    const nameInput = screen.getByLabelText("App Name");
    const iconInput = screen.getByLabelText("Icon Path");
    const commandInput = screen.getByLabelText("Launch Command");
    const saveButton = screen.getByRole("button", { name: "Save App" });

    await userEvent.type(nameInput, "My Test App");
    await userEvent.type(iconInput, "/path/icon.png");
    await userEvent.type(commandInput, "test-command --run");
    await userEvent.click(saveButton);

    expect(applicationApi.createAppConfig).toHaveBeenCalledTimes(1);
    expect(applicationApi.createAppConfig).toHaveBeenCalledWith(
      {
        id: "mock-nanoid", // From mocked nanoid
        name: "My Test App",
        icon: "/path/icon.png",
        launchCommand: "test-command --run",
      },
      configFilePath,
    );

    // Wait for async operations in onSubmit
    await vi.waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'App "My Test App" added successfully.',
      );
    });
    await vi.waitFor(() => {
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    // Check if form was reset (inputs should be empty)
    expect(nameInput).toHaveValue("");
    expect(iconInput).toHaveValue("");
    expect(commandInput).toHaveValue("");
  });

  it("shows error toast and does not close dialog on failed submission", async () => {
    const errorMessage = "Backend error";
    vi.mocked(applicationApi.createAppConfig).mockRejectedValue(errorMessage);

    render(<AddAppDialog {...defaultProps} />);
    const nameInput = screen.getByLabelText("App Name");
    const iconInput = screen.getByLabelText("Icon Path");
    const commandInput = screen.getByLabelText("Launch Command");
    const saveButton = screen.getByRole("button", { name: "Save App" });

    await userEvent.type(nameInput, "Fail App");
    await userEvent.type(iconInput, "/fail/icon.png");
    await userEvent.type(commandInput, "fail-cmd");
    await userEvent.click(saveButton);

    expect(applicationApi.createAppConfig).toHaveBeenCalledTimes(1);

    // Wait for async operations in onSubmit
    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to add app", {
        description: errorMessage,
      });
    });

    expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);

    // Form should not be reset
    expect(nameInput).toHaveValue("Fail App");
    expect(iconInput).toHaveValue("/fail/icon.png");
    expect(commandInput).toHaveValue("fail-cmd");
  });

  // Test dialog closing behavior (e.g., clicking outside - depends on Dialog implementation)
  // This might require more complex setup depending on how shadcn/ui Dialog handles it.
  // For now, we trust the underlying Dialog component handles its onOpenChange correctly.
});
