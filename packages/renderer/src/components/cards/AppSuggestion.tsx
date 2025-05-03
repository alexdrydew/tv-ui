import { AppConfig } from '@app/types';
import { cn } from '@/lib/utils';
import { PackageIcon } from 'lucide-react';

interface AppSuggestionProps {
    app: AppConfig;
    onSelect: (app: AppConfig) => void;
}

export function AppSuggestion({ app, onSelect }: AppSuggestionProps) {
    return (
        <button
            key={app.id}
            onClick={() => onSelect(app)}
            className={cn(
                'flex flex-col items-center justify-center p-2 rounded-md border border-transparent hover:border-primary hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors text-center h-24', // Fixed height for grid items
            )}
            title={app.name}
            data-testid={`suggested-app-${app.id}`}
        >
            {app.icon ? (
                <img
                    src={app.icon}
                    alt={`${app.name} icon`}
                    className="h-8 w-8 mb-1 object-contain"
                    onError={(e) => {
                        console.error(`Failed to load icon for ${app.name}`, e);
                        (e.target as HTMLImageElement).style.display = 'none';
                        // Optionally, replace with a placeholder icon or style adjustments
                        const parent = (e.target as HTMLImageElement)
                            .parentElement;
                        if (parent) {
                            const placeholder =
                                parent.querySelector('.icon-placeholder');
                            if (placeholder) {
                                (
                                    placeholder as HTMLElement
                                ).style.display = 'block';
                            }
                        }
                    }}
                />
            ) : (
                <PackageIcon className="h-8 w-8 mb-1 text-muted-foreground icon-placeholder" />
            )}
            {/* Placeholder for icon load error */}
            <PackageIcon
                className="h-8 w-8 mb-1 text-muted-foreground icon-placeholder"
                style={{ display: 'none' }}
            />
            <span className="text-xs truncate w-full">{app.name}</span>
        </button>
    );
}
