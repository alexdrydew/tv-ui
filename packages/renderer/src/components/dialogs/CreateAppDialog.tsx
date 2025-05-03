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
import { SelectAppFromOS } from './SelectAppFromOS';

type DialogView = 'initial' | 'manual' | 'selectOS';

interface CreateAppDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (config: AppConfig) => Promise<void>;
}

export function CreateAppDialog({
    isOpen,
    onOpenChange,
    onSave,
}: CreateAppDialogProps) {
    const [view, setView] = useState<DialogView>('initial');

    // Reset view when dialog opens or closes
    useEffect(() => {
        if (isOpen) {
            setView('initial'); // Start with choice when adding
        } else {
            // Reset view when dialog closes
            setView('initial');
        }
    }, [isOpen]);

    const handleSave = async (config: AppConfig) => {
        await onSave(config);
        // Assuming onSave handles closing the dialog on success
        // If not, uncomment the next line:
        // onOpenChange(false);
    };

    const handleCancelForm = () => {
        // Go back to initial choice from manual or selectOS view
        setView('initial');
    };

    const renderContent = () => {
        switch (view) {
            case 'manual':
                return (
                    <ManualAppConfigForm
                        // No appToEdit passed, so it's in "add" mode
                        onSave={handleSave}
                        onCancel={handleCancelForm} // Go back to initial view
                    />
                );
            case 'selectOS':
                return (
                    <SelectAppFromOS
                        onSelect={handleSave}
                        onCancel={handleCancelForm} // Go back to initial view
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
                {/* Footer only needed for the initial view's cancel button */}
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
