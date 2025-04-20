import { error, info } from '@/api/logging';
import { AppTile } from '@/components/cards/AppTile';
import { AppConfigDialog } from '@/components/dialogs/AppConfigDialog';
import { AppGrid } from '@/components/layout/AppGrid';
import { TvAppLayout } from '@/components/layout/TvAppLayout';
import { Button } from '@/components/ui/appButton';
import { useApps } from '@/hooks/useApps';
import { removeAppConfig } from '@app/preload'; // Import removeAppConfig
import { App, AppConfig, isLaunched } from '@app/types';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast, Toaster } from 'sonner';

export function HomePage() {
    const [isAddAppDialogOpen, setIsAddAppDialogOpen] = useState(false);
    const [isEditAppDialogOpen, setIsEditAppDialogOpen] = useState(false);
    const [editingApp] = useState<AppConfig | null>(null);
    const handleLaunchApp = (app: App) => {
        info(`Launching app: ${app.config.name}`);
        // instantiateApp(app)
        //     .then((appState) => {
        //         toast(`${app.config.name} launched successfully`, {
        //             description: `PID: ${appState.pid}`,
        //         });
        //         info(`App launched with PID: ${appState.pid}`);
        //     })
        //     .catch((e) => {
        //         toast(`Failed to launch app: ${app.config.name}`, {
        //             description: `${e}`,
        //         });
        //         error(`Failed to launch app: ${e}`);
        //     });
    };

    const handleKillApp = async (app: App) => {
        try {
            // await killApp(app.config.id);
            toast.success(`${app.config.name} terminated`, {
                description: 'Application was successfully stopped',
            });
        } catch (error) {
            toast.error(`Failed to kill ${app.config.name}`, {
                description: `${error}`,
            });
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleEditApp = (_app: App) => {
        // setEditingApp(app.config);
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
            await removeAppConfig(app.config.id, configFilePath); // Uncomment this line
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
