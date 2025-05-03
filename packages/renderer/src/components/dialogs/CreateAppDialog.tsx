import { AppConfig } from '@app/types';
import { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { SelectAppFromOS } from './SelectAppFromOS';
import { AppConfigForm } from '../forms/AppConfigForm';

// Define the possible views within the dialog
type DialogView = 'select-suggestion' | 'manual';

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
    // Default view is now 'select-suggestion'
    const [view, setView] = useState<DialogView>('select-suggestion');

    // Reset view to 'select-suggestion' when dialog is opened or closed
    useEffect(() => {
        if (isOpen) {
            setView('select-suggestion');
        }
    }, [isOpen]);

    const handleSave = async (config: AppConfig) => {
        await onSave(config);
        // Optionally close the dialog on successful save, handled by onSave implementation in parent
    };

    // This function is called when cancelling from the manual form
    const handleBackToSelect = () => {
        setView('select-suggestion');
    };

    // This function is called when cancelling from the select form, or closing the dialog
    const handleCloseDialog = () => {
        onOpenChange(false);
    };

    // This function is passed to SelectAppFromOS to switch to manual mode
    const handleSwitchToManual = () => {
        setView('manual');
    };

    const renderContent = () => {
        switch (view) {
            case 'manual':
                return (
                    <AppConfigForm
                        onSave={handleSave}
                        onCancel={handleBackToSelect} // Go back to select view
                    />
                );
            case 'select-suggestion':
            default:
                return (
                    <SelectAppFromOS
                        onSelect={handleSave} // Selecting an app saves it
                        onCancel={handleCloseDialog} // 'Back' button closes dialog
                        onSwitchToManual={handleSwitchToManual} // Add button to switch
                    />
                );
        }
    };

    const getTitle = () => {
        switch (view) {
            case 'manual':
                return 'Add App Manually';
            case 'select-suggestion':
            default:
                return 'Add New App'; // Keep title generic or specific like 'Select App from System'
        }
    };

    const getDescription = () => {
        switch (view) {
            case 'manual':
                return 'Enter the details for the new application configuration.';
            case 'select-suggestion':
            default:
                return 'Select an application detected on your system, or choose to create one manually.';
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
                {/* Footer is now handled within SelectAppFromOS and AppConfigForm */}
            </DialogContent>
        </Dialog>
    );
}
