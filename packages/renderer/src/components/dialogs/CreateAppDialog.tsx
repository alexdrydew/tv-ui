import { AppConfig } from '@app/types';
import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { SelectAppFromOS } from './SelectAppFromOS';
import { AppConfigForm } from '../forms/AppConfigForm';
import { assertNever } from '@/lib/utils';

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
    const [view, setView] = useState<DialogView>('select-suggestion');

    const handleSave = async (config: AppConfig) => {
        await onSave(config);
    };

    const handleCloseDialog = () => {
        onOpenChange(false);
    };

    const switchToSelect = () => {
        setView('select-suggestion');
    };

    const switchToManual = () => {
        setView('manual');
    };

    const renderContent = () => {
        switch (view) {
            case 'manual':
                return (
                    <AppConfigForm
                        onSave={handleSave}
                        onCancel={switchToSelect}
                    />
                );
            case 'select-suggestion':
            default:
                return (
                    <SelectAppFromOS
                        onSelect={handleSave}
                        onCancel={handleCloseDialog}
                        onSwitchToManual={switchToManual}
                    />
                );
        }
    };

    const getTitle = () => {
        switch (view) {
            case 'manual':
                return 'Add App Manually';
            case 'select-suggestion':
                return 'Add New App';
            default:
                assertNever(view);
        }
    };

    const getDescription = () => {
        switch (view) {
            case 'manual':
                return 'Enter the details for the new application configuration.';
            case 'select-suggestion':
                return 'Select an application detected on your system, or choose to create one manually.';
            default:
                assertNever(view);
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
            </DialogContent>
        </Dialog>
    );
}
