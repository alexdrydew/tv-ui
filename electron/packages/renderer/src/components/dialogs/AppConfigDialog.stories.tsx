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
        layout: "centered",
    },
    args: {
        isOpen: true,
        onOpenChange: fn(),
        configFilePath: "/fake/path/to/config.json",
    },
    decorators: [
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

export const AddNewApp: Story = {
    args: {
        appToEdit: null,
    },
};

export const EditApp: Story = {
    args: {
        appToEdit: mockAppToEdit,
    },
};
