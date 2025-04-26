import { AppConfig } from '@app/types';
import { Button } from '../ui/button';

interface SelectAppFromOSProps {
    onSelect: (config: AppConfig) => Promise<void>; // Callback when an app is selected
    onCancel: () => void; // Callback to handle cancellation/going back
}

export function SelectAppFromOS({ onSelect, onCancel }: SelectAppFromOSProps) {
    // TODO: Implement fetching suggestions using window.appApi.suggestAppConfigs()
    // TODO: Display suggestions in a list or grid
    // TODO: Call onSelect with the chosen AppConfig

    const handleDummySelect = () => {
        // Example of selecting a dummy app
        const dummyApp: AppConfig = {
            id: 'dummy-os-app',
            name: 'OS Suggested App (Dummy)',
            launchCommand: '/usr/bin/dummy-os-app',
            icon: 'system-run', // Example icon name
        };
        onSelect(dummyApp);
    };

    return (
        <div className="py-4">
            <p className="text-muted-foreground mb-4">
                Select an application detected on your system. (Implementation
                Pending)
            </p>
            {/* Placeholder for the list of suggested apps */}
            <div className="h-40 border border-dashed rounded-md flex items-center justify-center text-muted-foreground mb-4">
                [List of suggested apps will appear here]
            </div>
            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onCancel}>
                    Back
                </Button>
                {/* Dummy button to simulate selection */}
                <Button type="button" onClick={handleDummySelect}>
                    Select Dummy App
                </Button>
            </div>
        </div>
    );
}
