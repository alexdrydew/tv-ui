import { AppConfig } from '@app/types';
import { Button } from '../ui/button';
import { useEffect, useState } from 'react';
import { assertNever } from '@/lib/utils';
import { Loader2Icon } from 'lucide-react';
import { getSuggestedAppConfigs } from '@app/preload';
import { AppSuggestion } from '../cards/AppSuggestion';
import {
    useFocusable,
    FocusContext,
} from '@noriginmedia/norigin-spatial-navigation';

interface SelectAppFromOSProps {
    onSelect: (config: AppConfig) => Promise<void>;
    onCancel: () => void;
    onSwitchToManual: () => void;
}

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
      }
    | {
          state: 'not-supported';
      };

export function SelectAppFromOS({
    onSelect,
    onCancel,
    onSwitchToManual,
}: SelectAppFromOSProps) {
    const [suggestions, setSuggestions] = useState<SuggestionsStore>({
        state: 'loading',
    });

    // for more intuitive navigation to the bottom buttons
    const { ref: bottomRef, focusKey: bottomFocusKey } = useFocusable();

    useEffect(() => {
        const fetchSuggestions = async () => {
            try {
                const result = await getSuggestedAppConfigs();
                if (result.status === 'error') {
                    console.error(
                        'Error fetching app suggestions:',
                        result.error,
                    );
                    setSuggestions({ state: 'error' });
                } else if (result.status === 'not-supported') {
                    console.warn(
                        'App suggestion feature not supported on this OS.',
                    );
                    setSuggestions({
                        state: 'not-supported',
                    });
                } else if (result.status === 'success') {
                    const sortedResult =
                        result.suggestions.sort(sortAppsByName);
                    setSuggestions({
                        state: 'ready',
                        suggestions: sortedResult,
                    });
                } else {
                    assertNever(result);
                }
            } catch (err) {
                console.error('Failed to fetch app suggestions:', err);
                setSuggestions({
                    state: 'error',
                });
            }
        };

        fetchSuggestions();
    }, []);

    const isEmptyOrNotSupported =
        (suggestions.state === 'ready' &&
            suggestions.suggestions.length === 0) ||
        suggestions.state === 'not-supported';

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

            {isEmptyOrNotSupported && (
                <div className="h-80 flex flex-col items-center justify-center text-muted-foreground text-center px-4">
                    <span>
                        {suggestions.state === 'not-supported'
                            ? 'App suggestion feature not supported on this OS.'
                            : 'No applications found.'}
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
                        <div
                            className="grid grid-cols-4 gap-4 min-h-72 max-h-72 overflow-y-auto p-1 border rounded-md mb-4"
                            data-testid="suggestions-grid"
                        >
                            {suggestions.suggestions.map((app) => (
                                <AppSuggestion
                                    key={app.id}
                                    app={app}
                                    onSelect={onSelect}
                                />
                            ))}
                        </div>
                    </>
                )}

            <FocusContext.Provider value={bottomFocusKey}>
                <div
                    ref={bottomRef}
                    className="flex justify-between items-center mt-6"
                >
                    <Button type="button" variant="outline" onClick={onCancel}>
                        Back
                    </Button>
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
            </FocusContext.Provider>
        </div>
    );
}
