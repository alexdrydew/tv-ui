import { error, info, debug } from '@/api/logging';
import { AppTile } from '@/components/cards/AppTile';
import { AppConfigDialog } from '@/components/dialogs/AppConfigDialog';
import { AppGrid } from '@/components/layout/AppGrid';
import { TvAppLayout } from '@/components/layout/TvAppLayout';
import { Button } from '@/components/ui/appButton';
import { useApps } from '@/hooks/useApps';
import {
    killApp,
    launchApp,
    removeAppConfig,
    upsertAppConfig,
} from '@app/preload';
import { App, AppConfig, isLaunched, LaunchInstanceId } from '@app/types';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast, Toaster } from 'sonner';

const handleLaunchApp = async (app: App) => {
    info(`Attempting to launch app: ${app.config.name}`);
    try {
        const appState = await launchApp(app.config);
        toast.success(`${app.config.name} launched successfully`, {
            description: `PID: ${appState.pid}`,
        });
        info(
            `App ${app.config.name} (ID: ${app.config.id}) launched with PID: ${appState.pid}, InstanceID: ${appState.launchInstanceId}`,
        );
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        toast.error(`Failed to launch app: ${app.config.name}`, {
            description: errorMessage,
        });
        error(`Failed to launch app ${app.config.name}: ${errorMessage}`);
    }
};

const handleKillApp = async (launchInstanceId: LaunchInstanceId) => {
    info(`Attempting to kill app instance: ${launchInstanceId}`);
    try {
        await killApp(launchInstanceId);
        toast.info(`Kill signal sent to instance ${launchInstanceId}`, {
            description: 'Waiting for application to terminate.',
        });
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        toast.error(
            `Failed to send kill signal to instance ${launchInstanceId}`,
            {
                description: errorMessage,
            },
        );
        error(
            `Failed to send kill signal to instance ${launchInstanceId}: ${errorMessage}`,
        );
    }
};

export const HomePage: React.FC = () => {
    const [isAddAppDialogOpen, setIsAddAppDialogOpen] = useState(false);
    const [isEditAppDialogOpen, setIsEditAppDialogOpen] = useState(false);
    const [editingApp, setEditingApp] = useState<AppConfig | null>(null);

    const { apps, configFilePath } = useApps();

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
        if (isLaunched(app)) {
            toast.error(`Cannot remove ${app.config.name}`, {
                description:
                    'Application is currently running. Please kill it first.',
            });
            error(
                `Attempted to remove config for running app: ${app.config.id}`,
            );
            return;
        }
        try {
            await removeAppConfig(app.config.id, configFilePath);
            toast.success(`${app.config.name} configuration removed`);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            error(`Failed to remove app config: ${errorMessage}`);
            toast.error(`Failed to remove ${app.config.name}`, {
                description: errorMessage,
            });
        }
    };

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
            setIsAddAppDialogOpen(false);
            setIsEditAppDialogOpen(false);
            setEditingApp(null);
        } catch (err) {
            const errorMessage =
                err instanceof Error ? err.message : String(err);
            error(`Failed to save app config ${config.name}: ${errorMessage}`);
            toast.error(`Failed to save ${config.name}`, {
                description: errorMessage,
            });
        }
    };

    if (apps === undefined || configFilePath === undefined) {
        return (
            <TvAppLayout>
                <main className="py-8 px-8">
                    <div>Loading applications...</div>
                </main>
            </TvAppLayout>
        );
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
                    onKillApp={() => {
                        console.warn(
                            "AppGrid's onKillApp called, but logic is handled via AppTile's onKill",
                        );
                    }}
                    onRemoveApp={handleRemoveApp}
                    onEditApp={handleEditApp}
                    renderItem={({ app }) => {
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
                                isRunning={isLaunched(app)}
                                runningInstanceIds={runningInstanceIds}
                                onSelect={() => handleLaunchApp(app)}
                                onKill={handleKillApp}
                                onRemove={() => handleRemoveApp(app)}
                                onEdit={() => handleEditApp(app)}
                            />
                        );
                    }}
                />
            </main>
            <Toaster />
            <AppConfigDialog
                isOpen={isAddAppDialogOpen}
                onOpenChange={setIsAddAppDialogOpen}
                onSave={handleSaveAppConfig}
                mode="add"
            />
            <AppConfigDialog
                isOpen={isEditAppDialogOpen}
                onOpenChange={setIsEditAppDialogOpen}
                appToEdit={editingApp}
                onSave={handleSaveAppConfig}
                mode="edit"
            />
        </TvAppLayout>
    );
};
