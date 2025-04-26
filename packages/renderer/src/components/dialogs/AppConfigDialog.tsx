import { Button } from '@/components/ui/button';
import { AppConfig } from '@app/types';
import { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { ManualAppConfigForm } from './ManualAppConfigForm';
import { SelectAppFromOS } from './SelectAppFromOS'; // Import the new component

type DialogView = 'initial' | 'manual' | 'selectOS';

interface AppConfigDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    appToEdit?: AppConfig | null;
    onSave: (config: AppConfig) => Promise<void>;
    mode: 'add' | 'edit';
}

export function AppConfigDialog({
    isOpen,
    onOpenChange,
    appToEdit = null,
    onSave,
    mode,
}: AppConfigDialogProps) {
    const [view, setView] = useState<DialogView>('initial');
    const isEditing = mode === 'edit' && appToEdit !== null;

    // Determine view when dialog opens or mode changes
    useEffect(() => {
        if (isOpen) {
            if (isEditing) {
                setView('manual'); // Directly go to manual form for editing
            } else {
                setView('initial'); // Start with choice for adding
            }
        } else {
            // Reset view when dialog closes
            setView('initial');
        }
    }, [isOpen, isEditing]);

    const handleSave = async (config: AppConfig) => {
        await onSave(config);
        // Assuming onSave handles closing the dialog on success
        // If not, uncomment the next line:
        // onOpenChange(false);
    };

    const handleCancel = () => {
        // If adding, go back to initial choice, otherwise close dialog
        if (mode === 'add' && view !== 'initial') {
            setView('initial');
        } else {
            onOpenChange(false);
        }
    };

    const renderContent = () => {
        switch (view) {
            case 'manual':
                return (
                    <ManualAppConfigForm
                        appToEdit={appToEdit}
                        onSave={handleSave}
                        onCancel={handleCancel}
                        mode={mode}
                    />
                );
            case 'selectOS':
                return (
                    <SelectAppFromOS
                        onSelect={handleSave}
                        onCancel={handleCancel}
                    />
                );
            case 'initial':
            default:
                return (
                    <div className="py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Button
                            variant="outline"
                            onClick={() => setView('selectOS')}
                            className="h-20 text-lg"
                        >
                            Select from OS
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => setView('manual')}
                            className="h-20 text-lg"
                        >
                            Create Manually
                        </Button>
                    </div>
                );
        }
    };

    const getTitle = () => {
        if (isEditing) return 'Edit App';
        switch (view) {
            case 'manual':
                return 'Add App Manually';
            case 'selectOS':
                return 'Select App from System';
            case 'initial':
            default:
                return 'Add New App';
        }
    };

    const getDescription = () => {
        if (isEditing)
            return `Update the details for ${appToEdit?.name ?? 'the app'}.`;
        switch (view) {
            case 'manual':
                return 'Enter the details for the new application configuration.';
            case 'selectOS':
                return 'Choose an application detected on your operating system.';
            case 'initial':
            default:
                return 'How would you like to add the new application?';
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{getTitle()}</DialogTitle>
                    <DialogDescription>{getDescription()}</DialogDescription>
                </DialogHeader>
                {renderContent()}
                {/* Footer is now part of the specific view components (ManualAppConfigForm, SelectAppFromOS)
                    or not needed for the initial view */}
                {view === 'initial' && (
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
