import { AppConfig } from '@app/types';
import { Button } from '../ui/button';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Loader2Icon, PackageIcon } from 'lucide-react';
import { getSuggestedAppConfigs } from '@app/preload';

interface SelectAppFromOSProps {
    onSelect: (config: AppConfig) => Promise<void>; // Callback when an app is selected
    onCancel: () => void; // Callback to handle cancellation/going back
}

const MAX_SUGGESTIONS_TO_SHOW = 16;

export function SelectAppFromOS({ onSelect, onCancel }: SelectAppFromOSProps) {
    const [suggestions, setSuggestions] = useState<AppConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchSuggestions = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const result = await getSuggestedAppConfigs();
                setSuggestions(result);
            } catch (err) {
                console.error('Failed to fetch app suggestions:', err);
                setError(
                    'Failed to load suggestions. Please check the console for details.',
                );
                setSuggestions([]); // Clear suggestions on error
            } finally {
                setIsLoading(false);
            }
        };

        fetchSuggestions();
    }, []);

    const handleSelectApp = (app: AppConfig) => {
        onSelect(app);
    };

    return (
        <div className="py-4">
            <p className="text-muted-foreground mb-4">
                Select an application detected on your system.
            </p>

            {isLoading && (
                <div className="h-60 flex items-center justify-center text-muted-foreground">
                    <Loader2Icon className="mr-2 h-6 w-6 animate-spin" />
                    Loading suggestions...
                </div>
            )}

            {error && (
                <div className="h-60 flex items-center justify-center text-destructive">
                    {error}
                </div>
            )}

            {!isLoading && !error && suggestions.length === 0 && (
                <div className="h-60 flex items-center justify-center text-muted-foreground">
                    No applications found or suggestion feature not available on
                    this OS.
                </div>
            )}

            {!isLoading && !error && suggestions.length > 0 && (
                <div className="grid grid-cols-4 gap-4 max-h-60 overflow-y-auto p-1 border rounded-md mb-4">
                    {suggestions
                        .slice(0, MAX_SUGGESTIONS_TO_SHOW)
                        .map((app) => (
                            <button
                                key={app.id}
                                onClick={() => handleSelectApp(app)}
                                className={cn(
                                    'flex flex-col items-center justify-center p-2 rounded-md border border-transparent hover:border-primary hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors text-center h-24', // Fixed height for grid items
                                )}
                                title={app.name} // Tooltip for long names
                                data-testid={`suggested-app-${app.id}`} // Add test ID
                            >
                                {app.icon ? (
                                    <img
                                        src={`file://${app.icon}`} // Use file protocol for absolute paths
                                        alt={`${app.name} icon`}
                                        className="h-8 w-8 mb-1 object-contain" // Ensure icon fits
                                        onError={(e) => {
                                            // Fallback or hide if image fails to load
                                            console.warn(
                                                `Failed to load icon: ${app.icon}`,
                                                e,
                                            );
                                            (
                                                e.target as HTMLImageElement
                                            ).style.display = 'none';
                                            // Optionally show a fallback icon here
                                        }}
                                    />
                                ) : (
                                    <PackageIcon className="h-8 w-8 mb-1 text-muted-foreground" />
                                )}
                                <span className="text-xs truncate w-full">
                                    {app.name}
                                </span>
                            </button>
                        ))}
                </div>
            )}
            {suggestions.length > MAX_SUGGESTIONS_TO_SHOW && (
                <p className="text-sm text-muted-foreground mb-4 text-center">
                    Showing first {MAX_SUGGESTIONS_TO_SHOW} of{' '}
                    {suggestions.length} apps found. Pagination coming soon.
                </p>
            )}

            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onCancel}>
                    Back
                </Button>
                {/* Selection happens by clicking the grid item now */}
            </div>
        </div>
    );
}
