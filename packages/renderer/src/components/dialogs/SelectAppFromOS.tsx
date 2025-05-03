import { AppConfig } from '@app/types';
import { Button } from '../ui/button';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Loader2Icon, PackageIcon } from 'lucide-react';
import { getSuggestedAppConfigs } from '@app/preload';

interface SelectAppFromOSProps {
    onSelect: (config: AppConfig) => Promise<void>;
    onCancel: () => void;
    onSwitchToManual: () => void;
    initialVisibleCount?: number; // How many items to show initially and load per scroll
    scrollThreshold?: number; // How close to the bottom (in px) to trigger loading more
}

const DEFAULT_INITIAL_VISIBLE_COUNT = 32; // Load more items than the old page size
const DEFAULT_SCROLL_THRESHOLD = 100; // Pixels from bottom

const sortAppsByName = (a: AppConfig, b: AppConfig) => {
    return a.name.localeCompare(b.name, undefined, {
        sensitivity: 'base',
        numeric: true,
    });
};

type SuggestionsStore =
    | {
          state: 'loading' | 'error';
          suggestions?: undefined;
      }
    | {
          state: 'ready';
          suggestions: AppConfig[];
      };

export function SelectAppFromOS({
    onSelect,
    onCancel,
    onSwitchToManual,
    initialVisibleCount = DEFAULT_INITIAL_VISIBLE_COUNT,
    scrollThreshold = DEFAULT_SCROLL_THRESHOLD,
}: SelectAppFromOSProps) {
    const [suggestions, setSuggestions] = useState<SuggestionsStore>({
        state: 'loading',
    });
    const [visibleCount, setVisibleCount] = useState(initialVisibleCount);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchSuggestions = async () => {
            setVisibleCount(initialVisibleCount); // Reset visible count on new fetch
            try {
                const result = await getSuggestedAppConfigs();
                const sortedResult = result.sort(sortAppsByName);
                setSuggestions({
                    state: 'ready',
                    suggestions: sortedResult,
                });
            } catch (err) {
                console.error('Failed to fetch app suggestions:', err);
                setSuggestions({
                    state: 'error',
                });
            }
        };

        fetchSuggestions();
    }, [initialVisibleCount]);

    const handleSelectApp = (app: AppConfig) => {
        onSelect(app);
    };

    // Effect for handling infinite scroll
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container || suggestions.state !== 'ready') {
            return;
        }

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container;
            const isNearBottom =
                scrollHeight - scrollTop - clientHeight < scrollThreshold;

            if (
                isNearBottom &&
                visibleCount < suggestions.suggestions.length
            ) {
                setVisibleCount((prevCount) =>
                    Math.min(
                        prevCount + initialVisibleCount, // Load another batch
                        suggestions.suggestions.length,
                    ),
                );
            }
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, [
        suggestions,
        visibleCount,
        initialVisibleCount,
        scrollThreshold,
        scrollContainerRef,
    ]);

    const visibleSuggestions = useMemo(() => {
        if (suggestions.state === 'ready') {
            return suggestions.suggestions.slice(0, visibleCount);
        }
        return [];
    }, [suggestions, visibleCount]);

    return (
        <div className="py-4">
            {suggestions.state === 'loading' && (
                <div className="h-80 flex items-center justify-center text-muted-foreground">
                    <Loader2Icon className="mr-2 h-6 w-6 animate-spin" />
                    Loading suggestions...
                </div>
            )}

            {suggestions.state === 'error' && (
                <div className="h-80 flex items-center justify-center text-destructive">
                    Failed to load app suggestions
                </div>
            )}

            {suggestions.state === 'ready' &&
                suggestions.suggestions.length === 0 && (
                    <div className="h-80 flex flex-col items-center justify-center text-muted-foreground text-center px-4">
                        <span>
                            No applications found or suggestion feature not
                            available on this OS.
                        </span>
                        <Button
                            variant="link"
                            onClick={onSwitchToManual}
                            className="mt-2"
                        >
                            Create Manually Instead?
                        </Button>
                    </div>
                )}

            {suggestions.state === 'ready' &&
                suggestions.suggestions.length > 0 && (
                    <>
                        {/* Grid for App Suggestions - Now Scrollable */}
                        <div
                            ref={scrollContainerRef}
                            className="grid grid-cols-4 gap-4 min-h-72 max-h-72 overflow-y-auto p-1 border rounded-md mb-4"
                            data-testid="suggestions-grid"
                        >
                            {visibleSuggestions.map((app) => (
                                <button
                                    key={app.id}
                                    onClick={() => handleSelectApp(app)}
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
                                                console.error(
                                                    `Failed to load icon for ${app.name}`,
                                                    e,
                                                );
                                                (
                                                    e.target as HTMLImageElement
                                                ).style.display = 'none'; // Hide broken image
                                                // Optionally replace with placeholder icon
                                                const placeholder =
                                                    document.createElement(
                                                        'div',
                                                    );
                                                placeholder.innerHTML =
                                                    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-package h-8 w-8 mb-1 text-muted-foreground"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>';
                                                (
                                                    e.target as HTMLImageElement
                                                ).parentNode?.insertBefore(
                                                    placeholder.firstChild!,
                                                    e.target as Node,
                                                );
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
                            {/* Optional: Add a loading indicator when more items are being loaded */}
                            {visibleCount < suggestions.suggestions.length && (
                                <div className="col-span-4 flex justify-center items-center h-10 text-muted-foreground">
                                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                                    Loading more...
                                </div>
                            )}
                        </div>
                    </>
                )}

            {/* Footer with Back and Create Manually buttons */}
            <div className="flex justify-between items-center mt-6">
                <Button type="button" variant="outline" onClick={onCancel}>
                    Back
                </Button>
                {/* Show Create Manually button only if not loading/error */}
                {suggestions.state === 'ready' && (
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={onSwitchToManual}
                    >
                        Create Manually
                    </Button>
                )}
            </div>
        </div>
    );
}
