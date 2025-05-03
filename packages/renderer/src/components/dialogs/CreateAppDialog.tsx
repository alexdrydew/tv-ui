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
import { SelectAppFromOS } from './SelectAppFromOS';
import { AppConfigForm } from '../forms/AppConfigForm';

type DialogView = 'initial' | 'manual' | 'select-suggestion';

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

    // reset view on open/close
    useEffect(() => {
        setView('initial');
    }, [isOpen]);

    const handleSave = async (config: AppConfig) => {
        await onSave(config);
    };

    const handleCancelForm = () => {
        setView('initial');
    };

    const renderContent = () => {
        switch (view) {
            case 'manual':
                return (
                    <AppConfigForm
                        onSave={handleSave}
                        onCancel={handleCancelForm}
                    />
                );
            case 'select-suggestion':
                return (
                    <SelectAppFromOS
                        onSelect={handleSave}
                        onCancel={handleCancelForm}
                    />
                );
            case 'initial':
            default:
                return (
                    <div className="py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Button
                            variant="outline"
                            onClick={() => setView('select-suggestion')}
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
            case 'select-suggestion':
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
            case 'select-suggestion':
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
                        <Button
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
