import { AppConfig } from '@app/types';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { ManualAppConfigForm } from './ManualAppConfigForm';

interface EditAppDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    appToEdit: AppConfig; // App to edit is required
    onSave: (config: AppConfig) => Promise<void>;
}

export function EditAppDialog({
    isOpen,
    onOpenChange,
    appToEdit,
    onSave,
}: EditAppDialogProps) {
    const handleSave = async (config: AppConfig) => {
        await onSave(config);
        // Assuming onSave handles closing the dialog on success
        // If not, uncomment the next line:
        // onOpenChange(false);
    };

    const handleCancel = () => {
        onOpenChange(false); // Close the dialog on cancel
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit App</DialogTitle>
                    <DialogDescription>
                        Update the details for {appToEdit.name}.
                    </DialogDescription>
                </DialogHeader>
                <ManualAppConfigForm
                    appToEdit={appToEdit} // Pass the app to edit
                    onSave={handleSave}
                    onCancel={handleCancel} // Close dialog on cancel
                />
                {/* Footer is now part of ManualAppConfigForm */}
            </DialogContent>
        </Dialog>
    );
}
