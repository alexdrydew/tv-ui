import { AppConfig } from '@app/types';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { AppConfigForm } from '../forms/AppConfigForm';

export type EditAppDialogState =
    | {
          isOpen: false;
      }
    | {
          isOpen: true;
          appToEdit: Readonly<AppConfig>;
      };

interface EditAppDialogProps {
    state: EditAppDialogState;
    onOpenChange: (open: boolean) => void;
    onSave: (config: AppConfig) => Promise<void>;
}

export function EditAppDialog({
    state,
    onOpenChange,
    onSave,
}: EditAppDialogProps) {
    const handleSave = async (config: AppConfig) => {
        await onSave(config);
    };

    const handleCancel = () => {
        onOpenChange(false);
    };

    return (
        <Dialog open={state.isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit App</DialogTitle>
                    <DialogDescription>
                        {state.isOpen && (
                            <div>
                                Update the details for {state.appToEdit.name}.
                            </div>
                        )}
                    </DialogDescription>
                </DialogHeader>
                <AppConfigForm
                    initial={state.isOpen ? state.appToEdit : undefined}
                    onSave={handleSave}
                    onCancel={handleCancel}
                />
            </DialogContent>
        </Dialog>
    );
}
