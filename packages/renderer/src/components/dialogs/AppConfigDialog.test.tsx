// import { render, screen, cleanup } from '@testing-library/react';
// import userEvent from '@testing-library/user-event';
// import '@testing-library/jest-dom/vitest';
// import { describe, it, expect, beforeEach, vi, afterEach, test } from 'vitest';
// import { AppConfigDialog } from './AppConfigDialog';
// import * as applicationApi from '@/api/application';
// import * as upsertAppConfig from '@/api/upsertAppConfig';
// import { toast } from 'sonner';
// import { AppConfig } from '@/api/application';
//
// vi.mock('@/api/application', async (importOriginal) => {
//     const actual = await importOriginal<typeof applicationApi>();
//     return {
//         ...actual,
//         upsertAppConfig: vi.fn(),
//     };
// });
// vi.mock('sonner', () => ({
//     toast: {
//         success: vi.fn(),
//         error: vi.fn(),
//     },
// }));
// vi.mock('nanoid', () => ({
//     nanoid: vi.fn(() => 'mock-nanoid'),
// }));
// vi.mock('@tauri-apps/plugin-log', () => ({
//     error: vi.fn(),
//     debug: vi.fn(),
//     info: vi.fn(),
// }));
//
// describe('AppConfigDialog', () => {
//     const mockOnOpenChange = vi.fn();
//     const configFilePath = '/fake/path/to/config.json';
//
//     const addModeProps = {
//         isOpen: true,
//         onOpenChange: mockOnOpenChange,
//         configFilePath: configFilePath,
//         appToEdit: null,
//     };
//
//     const appToEditData: AppConfig = {
//         id: 'existing-app-id',
//         name: 'App To Edit',
//         icon: 'edit-icon.png',
//         launchCommand: 'edit-command',
//     };
//     const editModeProps = {
//         isOpen: true,
//         onOpenChange: mockOnOpenChange,
//         configFilePath: configFilePath,
//         appToEdit: appToEditData,
//     };
//
//     beforeEach(() => {
//         vi.clearAllMocks();
//         vi.mocked(upsertAppConfig.upsertAppConfig).mockResolvedValue(undefined);
//     });
//
//     afterEach(() => {
//         cleanup();
//     });
//
//     it('[Add Mode] renders the dialog with correct title and empty fields', () => {
//         render(<AppConfigDialog {...addModeProps} />);
//
//         expect(screen.getByRole('dialog')).toBeInTheDocument();
//         expect(
//             screen.getByRole('heading', { name: 'Add New App' }),
//         ).toBeInTheDocument();
//         expect(
//             screen.getByText(
//                 'Enter the details for the new application configuration.',
//             ),
//         ).toBeInTheDocument();
//         expect(screen.getByLabelText('App Name')).toBeInTheDocument();
//         expect(screen.getByLabelText('App Name')).toHaveValue('');
//         expect(screen.getByLabelText(/Icon Path \(Optional\)/i)).toHaveValue(
//             '',
//         );
//         expect(screen.getByLabelText('Launch Command')).toHaveValue('');
//         expect(
//             screen.getByRole('button', { name: 'Save App' }),
//         ).toBeInTheDocument();
//     });
//
//     it('[Add Mode] does not render the dialog when isOpen is false', () => {
//         render(<AppConfigDialog {...addModeProps} isOpen={false} />);
//         expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
//     });
//
//     it('[Add Mode] shows validation errors for empty required fields', async () => {
//         render(<AppConfigDialog {...addModeProps} />);
//         const saveButton = screen.getByRole('button', { name: 'Save App' });
//
//         await userEvent.click(saveButton);
//
//         expect(
//             await screen.findByText('App name cannot be empty'),
//         ).toBeInTheDocument();
//         expect(
//             await screen.findByText('App name cannot be empty'),
//         ).toBeInTheDocument();
//         expect(
//             screen.queryByText('Icon path cannot be empty'),
//         ).not.toBeInTheDocument();
//         expect(
//             await screen.findByText('Launch command cannot be empty'),
//         ).toBeInTheDocument();
//
//         expect(upsertAppConfig.upsertAppConfig).not.toHaveBeenCalled(); // Check the correct mock
//         expect(mockOnOpenChange).not.toHaveBeenCalled();
//     });
//
//     it('[Add Mode] calls upsertAppConfig with new ID and correct data on successful submission', async () => {
//         render(<AppConfigDialog {...addModeProps} />);
//         const nameInput = screen.getByLabelText('App Name');
//         const iconInput = screen.getByLabelText(/Icon Path \(Optional\)/i);
//         const commandInput = screen.getByLabelText('Launch Command');
//         const saveButton = screen.getByRole('button', { name: 'Save App' });
//
//         await userEvent.type(nameInput, 'My Test App');
//         await userEvent.type(iconInput, '/path/icon.png');
//         await userEvent.type(commandInput, 'test-command --run');
//         await userEvent.click(saveButton);
//
//         // Wait for async operations
//         await vi.waitFor(() => {
//             expect(toast.success).toHaveBeenCalledWith('App Added', {
//                 description: 'App "My Test App" added successfully.',
//             });
//         });
//
//         expect(upsertAppConfig.upsertAppConfig).toHaveBeenCalledTimes(1);
//         expect(upsertAppConfig.upsertAppConfig).toHaveBeenCalledWith(
//             {
//                 id: 'mock-nanoid',
//                 name: 'My Test App',
//                 icon: '/path/icon.png',
//                 launchCommand: 'test-command --run',
//             },
//             configFilePath,
//         );
//
//         // Dialog closes on success
//         await vi.waitFor(() => {
//             expect(mockOnOpenChange).toHaveBeenCalledWith(false);
//         });
//     });
//
//     it('[Add Mode] calls upsertAppConfig with null icon when icon field is empty', async () => {
//         render(<AppConfigDialog {...addModeProps} />);
//         const nameInput = screen.getByLabelText('App Name');
//         const iconInput = screen.getByLabelText(/Icon Path/);
//         const commandInput = screen.getByLabelText('Launch Command');
//         const saveButton = screen.getByRole('button', { name: 'Save App' });
//
//         await userEvent.type(nameInput, 'App No Icon');
//         // Leave iconInput empty
//         await userEvent.clear(iconInput); // Ensure it's empty
//         await userEvent.type(commandInput, 'no-icon-cmd');
//         await userEvent.click(saveButton);
//
//         // Wait for async operations
//         await vi.waitFor(() => {
//             expect(toast.success).toHaveBeenCalledWith('App Added', {
//                 description: 'App "App No Icon" added successfully.',
//             });
//         });
//
//         expect(upsertAppConfig.upsertAppConfig).toHaveBeenCalledTimes(1);
//         expect(upsertAppConfig.upsertAppConfig).toHaveBeenCalledWith(
//             {
//                 id: 'mock-nanoid',
//                 name: 'App No Icon',
//                 icon: null,
//                 launchCommand: 'no-icon-cmd',
//             },
//             configFilePath,
//         );
//
//         // Dialog closes on success
//         await vi.waitFor(() => {
//             expect(mockOnOpenChange).toHaveBeenCalledWith(false);
//         });
//     });
//
//     it('[Add Mode] shows error toast and does not close dialog on failed submission', async () => {
//         const errorMessage = 'Backend add error';
//         vi.mocked(upsertAppConfig.upsertAppConfig).mockRejectedValue(
//             errorMessage,
//         );
//
//         render(<AppConfigDialog {...addModeProps} />);
//         const nameInput = screen.getByLabelText('App Name');
//         const iconInput = screen.getByLabelText(/Icon Path \(Optional\)/i);
//         const commandInput = screen.getByLabelText('Launch Command');
//         const saveButton = screen.getByRole('button', { name: 'Save App' });
//
//         await userEvent.type(nameInput, 'Fail App');
//         await userEvent.type(iconInput, '/fail/icon.png');
//         await userEvent.type(commandInput, 'fail-cmd');
//         await userEvent.click(saveButton);
//
//         // Wait for async operations
//         await vi.waitFor(() => {
//             expect(toast.error).toHaveBeenCalledWith('Failed to add app', {
//                 description: errorMessage,
//             });
//         });
//
//         expect(upsertAppConfig.upsertAppConfig).toHaveBeenCalledTimes(1);
//
//         expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
//
//         expect(nameInput).toHaveValue('Fail App');
//         expect(iconInput).toHaveValue('/fail/icon.png');
//         expect(commandInput).toHaveValue('fail-cmd');
//     });
//
//     it('[Edit Mode] renders the dialog with correct title and pre-filled fields', () => {
//         render(<AppConfigDialog {...editModeProps} />);
//
//         expect(screen.getByRole('dialog')).toBeInTheDocument();
//         expect(
//             screen.getByRole('heading', { name: 'Edit App' }),
//         ).toBeInTheDocument();
//         expect(
//             screen.getByText(`Update the details for ${appToEditData.name}.`),
//         ).toBeInTheDocument();
//         expect(screen.getByLabelText('App Name')).toHaveValue(
//             appToEditData.name,
//         );
//         expect(screen.getByLabelText(/Icon Path \(Optional\)/i)).toHaveValue(
//             appToEditData.icon,
//         );
//         expect(screen.getByLabelText('Launch Command')).toHaveValue(
//             appToEditData.launchCommand,
//         );
//         expect(
//             screen.getByRole('button', { name: 'Save Changes' }),
//         ).toBeInTheDocument();
//     });
//
//     it('[Edit Mode] calls upsertAppConfig with existing ID and updated data on successful submission', async () => {
//         render(<AppConfigDialog {...editModeProps} />);
//         const nameInput = screen.getByLabelText('App Name');
//         const iconInput = screen.getByLabelText(/Icon Path \(Optional\)/i);
//         const commandInput = screen.getByLabelText('Launch Command');
//         const saveButton = screen.getByRole('button', { name: 'Save Changes' });
//
//         const updatedName = 'Updated App Name';
//         const updatedIcon = '/updated/icon.ico';
//         const updatedCommand = 'updated-cmd --now';
//
//         await userEvent.clear(nameInput);
//         await userEvent.type(nameInput, updatedName);
//         await userEvent.clear(iconInput);
//         await userEvent.type(iconInput, updatedIcon);
//         await userEvent.clear(commandInput);
//         await userEvent.type(commandInput, updatedCommand);
//
//         await userEvent.click(saveButton);
//
//         // Wait for async operations
//         await vi.waitFor(() => {
//             expect(toast.success).toHaveBeenCalledWith('App Updated', {
//                 description: `App "${updatedName}" updated successfully.`,
//             });
//         });
//
//         expect(upsertAppConfig.upsertAppConfig).toHaveBeenCalledTimes(1);
//         expect(upsertAppConfig.upsertAppConfig).toHaveBeenCalledWith(
//             {
//                 id: appToEditData.id,
//                 name: updatedName,
//                 icon: updatedIcon,
//                 launchCommand: updatedCommand,
//             },
//             configFilePath,
//         );
//
//         // Dialog closes on success
//         await vi.waitFor(() => {
//             expect(mockOnOpenChange).toHaveBeenCalledWith(false);
//         });
//     });
//
//     it('[Edit Mode] shows error toast and does not close dialog on failed submission', async () => {
//         const errorMessage = 'Backend update error';
//         vi.mocked(upsertAppConfig.upsertAppConfig).mockRejectedValue(
//             errorMessage,
//         );
//
//         render(<AppConfigDialog {...editModeProps} />);
//         const nameInput = screen.getByLabelText('App Name');
//         const saveButton = screen.getByRole('button', { name: 'Save Changes' });
//
//         await userEvent.type(nameInput, ' Change');
//         await userEvent.click(saveButton);
//
//         // Wait for async operations
//         await vi.waitFor(() => {
//             expect(toast.error).toHaveBeenCalledWith('Failed to update app', {
//                 description: errorMessage,
//             });
//         });
//
//         expect(upsertAppConfig.upsertAppConfig).toHaveBeenCalledTimes(1);
//
//         expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
//
//         expect(nameInput).toHaveValue(appToEditData.name + ' Change');
//     });
//
//     test('[Edit Mode] form resets to original values if closed and reopened', () => {
//         const { rerender } = render(<AppConfigDialog {...editModeProps} />);
//         const nameInput = screen.getByLabelText('App Name');
//         expect(nameInput).toHaveValue(appToEditData.name);
//
//         rerender(<AppConfigDialog {...editModeProps} isOpen={false} />);
//         expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
//
//         rerender(<AppConfigDialog {...editModeProps} isOpen={true} />);
//         expect(screen.getByRole('dialog')).toBeInTheDocument();
//         expect(screen.getByLabelText('App Name')).toHaveValue(
//             appToEditData.name,
//         );
//     });
//
//     test('[Edit Mode] form resets to empty if closed and reopened in Add mode', () => {
//         const { rerender } = render(<AppConfigDialog {...editModeProps} />);
//         expect(screen.getByLabelText('App Name')).toHaveValue(
//             appToEditData.name,
//         );
//
//         rerender(<AppConfigDialog {...editModeProps} isOpen={false} />);
//
//         rerender(<AppConfigDialog {...addModeProps} isOpen={true} />);
//         expect(
//             screen.getByRole('heading', { name: 'Add New App' }),
//         ).toBeInTheDocument();
//         expect(screen.getByLabelText('App Name')).toHaveValue('');
//     });
// });
