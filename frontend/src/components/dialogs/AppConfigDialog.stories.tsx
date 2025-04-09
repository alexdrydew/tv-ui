import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { AppConfigDialog } from "./AppConfigDialog";
import { AppConfig } from "@/api/application";
import { Toaster } from "@/components/ui/sonner";
import "@/index.css";

const mockAppToEdit: AppConfig = {
  id: "edit-app-123",
  name: "My Existing App",
  icon: "/path/to/existing/icon.png",
  launchCommand: "existing-command --flag",
};

const meta = {
  title: "Dialogs/AppConfigDialog",
  component: AppConfigDialog,
  parameters: {
    // Optional: Add layout parameter if needed, e.g., centered
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    // Default args for all stories
    isOpen: true, // Keep the dialog open by default in Storybook
    onOpenChange: fn(), // Mock function for open state changes
    configFilePath: "/fake/path/to/config.json",
  },
  decorators: [
    // Add Toaster decorator
    (Story) => (
      <div>
        <Story />
        <Toaster />
      </div>
    ),
  ],
} satisfies Meta<typeof AppConfigDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// Story for adding a new app (default state)
export const AddNewApp: Story = {
  args: {
    appToEdit: null, // Explicitly null for add mode
  },
};

// Story for editing an existing app
export const EditApp: Story = {
  args: {
    appToEdit: mockAppToEdit, // Pass mock data for editing
  },
};
