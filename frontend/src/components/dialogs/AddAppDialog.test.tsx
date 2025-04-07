import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { AddAppDialog } from "./AddAppDialog";
import * as applicationApi from "@/api/application";
import { toast } from "sonner";
import * as nanoid from "nanoid";

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
    expect(screen.getByLabelText(/Icon Path \(Optional\)/i)).toBeInTheDocument(); // Use regex to match optional label
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
      await screen.findByText("App name cannot be empty"),
    ).toBeInTheDocument();
    // Icon is optional, so no error expected here
    expect(screen.queryByText("Icon path cannot be empty")).not.toBeInTheDocument();
    expect(
      await screen.findByText("Launch command cannot be empty"),
    ).toBeInTheDocument();

    expect(applicationApi.createAppConfig).not.toHaveBeenCalled();
    expect(mockOnOpenChange).not.toHaveBeenCalled();
  });

  it("calls createAppConfig with correct data on successful submission", async () => {
    render(<AddAppDialog {...defaultProps} />);
    const nameInput = screen.getByLabelText("App Name");
    const iconInput = screen.getByLabelText(/Icon Path \(Optional\)/i); // Use regex to match optional label
    const commandInput = screen.getByLabelText("Launch Command");
    const saveButton = screen.getByRole("button", { name: "Save App" });

    await userEvent.type(nameInput, "My Test App");
    await userEvent.type(iconInput, "/path/icon.png");
    await userEvent.type(commandInput, "test-command --run");
    await userEvent.click(saveButton);

    expect(applicationApi.createAppConfig).toHaveBeenCalledTimes(1);
    expect(applicationApi.createAppConfig).toHaveBeenCalledWith(
      {
        id: "mock-nanoid",
        name: "My Test App",
        icon: "/path/icon.png", // Provided icon
        launchCommand: "test-command --run",
      },
      configFilePath,
    );

    await vi.waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'App "My Test App" added successfully.',
      );
    });
    await vi.waitFor(() => {
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    expect(nameInput).toHaveValue("");
    expect(iconInput).toHaveValue("");
    expect(commandInput).toHaveValue("");
  });
 
  it("calls createAppConfig with null icon when icon field is empty", async () => {
    render(<AddAppDialog {...defaultProps} />);
    const nameInput = screen.getByLabelText("App Name");
    const iconInput = screen.getByLabelText(/Icon Path/); // Match optional label
    const commandInput = screen.getByLabelText("Launch Command");
    const saveButton = screen.getByRole("button", { name: "Save App" });
 
    await userEvent.type(nameInput, "App No Icon");
    // Leave iconInput empty
    await userEvent.clear(iconInput); // Ensure it's empty
    await userEvent.type(commandInput, "no-icon-cmd");
    await userEvent.click(saveButton);
 
    expect(applicationApi.createAppConfig).toHaveBeenCalledTimes(1);
    expect(applicationApi.createAppConfig).toHaveBeenCalledWith(
      {
        id: "mock-nanoid",
        name: "App No Icon",
        icon: null, // Expect null when input is empty
        launchCommand: "no-icon-cmd",
      },
      configFilePath,
    );
 
    await vi.waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'App "App No Icon" added successfully.',
      );
    });
    await vi.waitFor(() => {
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });
 
  it("shows error toast and does not close dialog on failed submission", async () => {
    const errorMessage = "Backend error";
    vi.mocked(applicationApi.createAppConfig).mockRejectedValue(errorMessage);

    render(<AddAppDialog {...defaultProps} />);
    const nameInput = screen.getByLabelText("App Name");
    const iconInput = screen.getByLabelText(/Icon Path \(Optional\)/i); // Use regex to match optional label
    const commandInput = screen.getByLabelText("Launch Command");
    const saveButton = screen.getByRole("button", { name: "Save App" });

    await userEvent.type(nameInput, "Fail App");
    await userEvent.type(iconInput, "/fail/icon.png");
    await userEvent.type(commandInput, "fail-cmd");
    await userEvent.click(saveButton);

    expect(applicationApi.createAppConfig).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to add app", {
        description: errorMessage,
      });
    });

    expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);

    expect(nameInput).toHaveValue("Fail App");
    expect(iconInput).toHaveValue("/fail/icon.png");
    expect(commandInput).toHaveValue("fail-cmd");
  });
});
