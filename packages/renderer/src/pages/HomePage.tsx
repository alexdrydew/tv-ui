import { error, info, debug } from '@/api/logging'; // Added debug
import { AppTile } from '@/components/cards/AppTile';
import { AppConfigDialog } from '@/components/dialogs/AppConfigDialog';
import { AppGrid } from '@/components/layout/AppGrid';
import { TvAppLayout } from '@/components/layout/TvAppLayout';
import { Button } from '@/components/ui/appButton';
import { useApps } from '@/hooks/useApps';
import { killApp, launchApp, removeAppConfig, upsertAppConfig } from '@app/preload'; // Added upsertAppConfig
import { App, AppConfig, isLaunched, LaunchInstanceId } from '@app/types'; // Added LaunchInstanceId
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast, Toaster } from 'sonner';

export function HomePage() {
    const [isAddAppDialogOpen, setIsAddAppDialogOpen] = useState(false);
    const [isEditAppDialogOpen, setIsEditAppDialogOpen] = useState(false);
    const [editingApp, setEditingApp] = useState<AppConfig | null>(null);
    const { apps, configFilePath } = useApps(); // Moved useApps call higher

    const handleLaunchApp = async (app: App) => {
        info(`Attempting to launch app: ${app.config.name}`);
        try {
            const appState = await launchApp(app.config);
            toast.success(`${app.config.name} launched successfully`, {
                description: `PID: ${appState.pid}`,
            });
            info(
                `App ${app.config.name} (ID: ${app.config.id}) launched with PID: ${appState.pid}, InstanceID: ${appState.launchInstanceId}`, // Log InstanceID
            );
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            toast.error(`Failed to launch app: ${app.config.name}`, {
                description: errorMessage,
            });
            error(`Failed to launch app ${app.config.name}: ${errorMessage}`);
        }
    };

    // Updated handleKillApp to accept LaunchInstanceId
    const handleKillApp = async (launchInstanceId: LaunchInstanceId) => {
        info(`Attempting to kill app instance: ${launchInstanceId}`);
        try {
            await killApp(launchInstanceId);
            toast.info(`Kill signal sent to instance ${launchInstanceId}`, { // Updated toast message
                description: 'Waiting for application to terminate.',
            });
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            toast.error(`Failed to send kill signal to instance ${launchInstanceId}`, { // Updated toast message
                description: errorMessage,
            });
            error(
                `Failed to send kill signal to instance ${launchInstanceId}: ${errorMessage}`, // Updated error log
            );
        }
    };

    const handleEditApp = (app: App) => {
        setEditingApp(app.config);
        setIsEditAppDialogOpen(true);
    };

    const handleRemoveApp = async (app: App) => {
        if (!configFilePath) {
            error('Config file path is not available for removal.');
            toast.error('Cannot remove app', {
                description: 'Configuration file path is missing.',
            });
            return;
        }
        // Check if any instances are running before removing config
        if (isLaunched(app)) {
             toast.error(`Cannot remove ${app.config.name}`, {
                description: 'Application is currently running. Please kill it first.',
            });
            error(`Attempted to remove config for running app: ${app.config.id}`);
            return;
        }
        try {
            await removeAppConfig(app.config.id, configFilePath);
            toast.success(`${app.config.name} configuration removed`);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e); // More robust error message
            error(`Failed to remove app config: ${errorMessage}`);
            toast.error(`Failed to remove ${app.config.name}`, {
                description: errorMessage,
            });
        }
    };

    // Handler for saving from the dialog (used for both add and edit)
     const handleSaveAppConfig = async (config: AppConfig) => {
        if (!configFilePath) {
            error('Cannot save app config: Config file path is not defined.');
            toast.error('Cannot save app config: Config path unknown');
            return;
        }
        info(`Attempting to save app config: ${config.name}`);
        try {
            await upsertAppConfig(config, configFilePath);
            toast.success(`${config.name} saved successfully`);
            debug(`App config saved: ${config.id}`);
            setIsAddAppDialogOpen(false); // Close dialogs on success
            setIsEditAppDialogOpen(false);
            setEditingApp(null); // Clear editing state
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            error(`Failed to save app config ${config.name}: ${errorMessage}`);
            toast.error(`Failed to save ${config.name}`, {
                description: errorMessage,
            });
        }
    };


    if (apps === undefined || configFilePath === undefined) {
        return (
            <TvAppLayout> {/* Ensure layout consistency */}
                 <main className="py-8 px-8"> {/* Add padding */}
                    <div>Loading applications...</div>
                 </main>
            </TvAppLayout>
        );
    }

    // Determine focused index for AppGrid (if needed, or handle focus within AppGrid/AppTile)
    // const totalItems = apps.length; // Adjust if Add button is part of grid focus
    // const { focusedIndex, setFocusedIndex } = useFocusNavigation(totalItems);

    return (
        <TvAppLayout>
            <main className="py-8">
                <div className="flex justify-between items-center mb-6 px-8">
                    {/* Consider if Add App button should be outside the grid */}
                    <Button onClick={() => setIsAddAppDialogOpen(true)}>
                        <PlusIcon className="mr-2 h-4 w-4" /> Add App
                    </Button>
                </div>
                <AppGrid<App>
                    apps={apps}
                    // Pass handlers - Note: onKillApp type mismatch with AppGrid, but we handle kill via AppTile's onKill
                    onLaunchApp={handleLaunchApp}
                    onKillApp={() => { /* No-op or log warning due to type mismatch */ console.warn("AppGrid's onKillApp called, but logic is handled via AppTile's onKill"); }}
                    onRemoveApp={handleRemoveApp}
                    onEditApp={handleEditApp}
                    renderItem={({
                        app,
                        index,
                        isFocused,
                        setFocusedIndex, // Prop from AppGrid to manage focus
                        // We use handlers from HomePage scope directly below where needed
                        // onLaunchApp,
                        // onKillApp,
                        // onRemoveApp,
                        // onEditApp,
                    }) => {
                        // Calculate running instances and IDs here
                        const runningInstances = app.instances.filter(
                            (instance) => !instance.exitResult,
                        );
                        const runningInstanceIds = runningInstances.map(
                            (instance) => instance.launchInstanceId,
                        );

                        return (
                            <AppTile
                                key={app.config.id}
                                id={app.config.id}
                                name={app.config.name}
                                icon={app.config.icon}
                                isFocused={isFocused}
                                isRunning={isLaunched(app)}
                                runningInstanceIds={runningInstanceIds} // Pass the calculated IDs
                                onFocus={() => setFocusedIndex(index)} // Use setFocusedIndex from props
                                onSelect={() => handleLaunchApp(app)} // Use handler from HomePage scope
                                onKill={handleKillApp} // Pass handleKillApp (expects LaunchInstanceId)
                                onRemove={() => handleRemoveApp(app)} // Use handler from HomePage scope
                                onEdit={() => handleEditApp(app)} // Use handler from HomePage scope
                            />
                        );
                    }}
                    // Add other AppGrid props if needed (e.g., renderAddButton, focusedIndex)
                />
            </main>
            <Toaster />
            <AppConfigDialog
                isOpen={isAddAppDialogOpen}
                onOpenChange={setIsAddAppDialogOpen}
                configFilePath={configFilePath}
                onSave={handleSaveAppConfig} // Pass save handler
                mode="add" // Specify mode
            />
            <AppConfigDialog
                isOpen={isEditAppDialogOpen}
                onOpenChange={setIsEditAppDialogOpen}
                configFilePath={configFilePath}
                appToEdit={editingApp}
                onSave={handleSaveAppConfig} // Pass save handler
                mode="edit" // Specify mode
            />
        </TvAppLayout>
    );
}
