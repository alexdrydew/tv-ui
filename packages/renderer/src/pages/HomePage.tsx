import { error, info } from '@/api/logging';
import { AppTile } from '@/components/cards/AppTile';
import { AppConfigDialog } from '@/components/dialogs/AppConfigDialog';
import { AppGrid } from '@/components/layout/AppGrid';
import { error, info } from '@/api/logging';
import { AppTile } from '@/components/cards/AppTile';
import { AppConfigDialog } from '@/components/dialogs/AppConfigDialog';
import { AppGrid } from '@/components/layout/AppGrid';
import { TvAppLayout } from '@/components/layout/TvAppLayout';
import { Button } from '@/components/ui/appButton';
import { useApps } from '@/hooks/useApps';
import { killApp, launchApp, removeAppConfig } from '@app/preload';
import { App, AppConfig, isLaunched } from '@app/types';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast, Toaster } from 'sonner';

export function HomePage() {
    const [isAddAppDialogOpen, setIsAddAppDialogOpen] = useState(false);
    const [isEditAppDialogOpen, setIsEditAppDialogOpen] = useState(false);
    const [editingApp, setEditingApp] = useState<AppConfig | null>(null);
    const handleLaunchApp = async (app: App) => {
        info(`Attempting to launch app: ${app.config.name}`);
        try {
            const appState = await launchApp(app.config);
            toast.success(`${app.config.name} launched successfully`, {
                description: `PID: ${appState.pid}`,
            });
            info(
                `App ${app.config.name} (ID: ${app.config.id}) launched with PID: ${appState.pid}`,
            );
            // The useApps hook will update the state based on the event emitted by launchApp
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            toast.error(`Failed to launch app: ${app.config.name}`, {
                description: errorMessage,
            });
            error(`Failed to launch app ${app.config.name}: ${errorMessage}`);
        }
    };

    const handleKillApp = async (app: App) => {
        info(`Attempting to kill app: ${app.config.name} (ID: ${app.config.id})`);
        try {
            await killApp(app.config.id);
            // The success/failure is primarily indicated by the app state update event.
            // We might show a "Kill signal sent" toast, but success depends on the process actually exiting.
            toast.info(`Kill signal sent to ${app.config.name}`, {
                description: 'Waiting for application to terminate.',
            });
            // The useApps hook will update the state based on the event emitted by killApp/handleExit
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            toast.error(`Failed to send kill signal to ${app.config.name}`, {
                description: errorMessage,
            });
            error(
                `Failed to send kill signal to ${app.config.name}: ${errorMessage}`,
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
        try {
            await removeAppConfig(app.config.id, configFilePath);
            toast.success(`${app.config.name} configuration removed`);
        } catch (e) {
            error(`Failed to remove app config: ${e}`);
            toast.error(`Failed to remove ${app.config.name}`, {
                description: `${e}`,
            });
        }
    };

    const { apps, configFilePath } = useApps();

    if (apps === undefined || configFilePath === undefined) {
        return <div>Loading apps...</div>;
    }

    return (
        <TvAppLayout>
            <main className="py-8">
                <div className="flex justify-between items-center mb-6 px-8">
                    <Button onClick={() => setIsAddAppDialogOpen(true)}>
                        <PlusIcon className="mr-2 h-4 w-4" /> Add App
                    </Button>
                </div>
                <AppGrid<App>
                    apps={apps}
                    onLaunchApp={handleLaunchApp}
                    onKillApp={handleKillApp}
                    onRemoveApp={handleRemoveApp}
                    onEditApp={handleEditApp}
                    renderItem={({
                        app,
                        index,
                        isFocused,
                        setFocusedIndex,
                        onLaunchApp,
                        onKillApp,
                        onRemoveApp,
                        onEditApp,
                    }) => (
                        <AppTile
                            key={app.config.id}
                            id={app.config.id}
                            name={app.config.name}
                            icon={app.config.icon}
                            isFocused={isFocused}
                            isRunning={isLaunched(app)}
                            onFocus={() => setFocusedIndex(index)}
                            onSelect={() => onLaunchApp(app)}
                            onKill={() => onKillApp(app)}
                            onRemove={() => onRemoveApp(app)}
                            onEdit={() => onEditApp(app)}
                        />
                    )}
                />
            </main>
            <Toaster />
            <AppConfigDialog
                isOpen={isAddAppDialogOpen}
                onOpenChange={setIsAddAppDialogOpen}
                configFilePath={configFilePath}
            />
            <AppConfigDialog
                isOpen={isEditAppDialogOpen}
                onOpenChange={setIsEditAppDialogOpen}
                configFilePath={configFilePath}
                appToEdit={editingApp}
            />
        </TvAppLayout>
    );
}
