import { AppConfig } from '@app/types';
import { Button } from '../ui/button';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Loader2Icon, PackageIcon } from 'lucide-react';
import { getSuggestedAppConfigs } from '@app/preload';
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';

interface SelectAppFromOSProps {
    onSelect: (config: AppConfig) => Promise<void>;
    onCancel: () => void;
    onSwitchToManual: () => void;
    itemsPerPage?: number;
}

const DEFAULT_ITEMS_PER_PAGE = 16; // Define how many apps per page

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
    itemsPerPage,
}: SelectAppFromOSProps) {
    const pageSize = itemsPerPage || DEFAULT_ITEMS_PER_PAGE;

    const [suggestions, setSuggestions] = useState<SuggestionsStore>({
        state: 'loading',
    });
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        const fetchSuggestions = async () => {
            setCurrentPage(1);

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
    }, []);

    const handleSelectApp = (app: AppConfig) => {
        onSelect(app);
    };

    const totalPages = useMemo(() => {
        if (suggestions.state === 'ready') {
            return Math.ceil(suggestions.suggestions.length / pageSize);
        }
        return undefined;
    }, [suggestions, pageSize]);

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
    };

    const handlePreviousPage = (
        e: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
    ) => {
        e.preventDefault(); // Prevent default anchor behavior
        if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
        }
    };

    const handleNextPage = (
        e: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
    ) => {
        e.preventDefault(); // Prevent default anchor behavior
        if (!totalPages) {
            return;
        }

        if (currentPage < totalPages) {
            setCurrentPage(currentPage + 1);
        }
    };

    const renderPaginationLinks = () => {
        const pageLinks = [];
        const maxVisiblePages = 3;
        const halfVisible = Math.floor(maxVisiblePages / 2);

        // Always show first page
        pageLinks.push(
            <PaginationItem key={1}>
                <PaginationLink
                    href="#"
                    onClick={(e) => {
                        e.preventDefault();
                        handlePageChange(1);
                    }}
                    isActive={currentPage === 1}
                >
                    1
                </PaginationLink>
            </PaginationItem>,
        );

        if (!totalPages) {
            return;
        }

        if (currentPage > halfVisible + 2 && totalPages > maxVisiblePages + 2) {
            pageLinks.push(<PaginationEllipsis key="start-ellipsis" />);
        }

        let startPage = Math.max(2, currentPage - halfVisible);
        let endPage = Math.min(totalPages - 1, currentPage + halfVisible);

        if (currentPage <= halfVisible + 1) {
            endPage = Math.min(totalPages - 1, maxVisiblePages + 1);
        }
        if (currentPage >= totalPages - halfVisible) {
            startPage = Math.max(2, totalPages - maxVisiblePages);
        }

        // Render page numbers in the calculated range
        for (let i = startPage; i <= endPage; i++) {
            pageLinks.push(
                <PaginationItem key={i}>
                    <PaginationLink
                        href="#"
                        onClick={(e) => {
                            e.preventDefault();
                            handlePageChange(i);
                        }}
                        isActive={currentPage === i}
                    >
                        {i}
                    </PaginationLink>
                </PaginationItem>,
            );
        }

        // Ellipsis before last page?
        if (
            currentPage < totalPages - halfVisible - 1 &&
            totalPages > maxVisiblePages + 2
        ) {
            pageLinks.push(<PaginationEllipsis key="end-ellipsis" />);
        }

        // Always show last page if more than 1 page
        if (totalPages > 1) {
            pageLinks.push(
                <PaginationItem key={totalPages}>
                    <PaginationLink
                        href="#"
                        onClick={(e) => {
                            e.preventDefault();
                            handlePageChange(totalPages);
                        }}
                        isActive={currentPage === totalPages}
                    >
                        {totalPages}
                    </PaginationLink>
                </PaginationItem>,
            );
        }

        return pageLinks;
    };

    return (
        <div className="py-4">
            {suggestions.state === 'loading' && (
                <div className="h-80 flex items-center justify-center text-muted-foreground">
                    {' '}
                    {/* Adjusted height */}
                    <Loader2Icon className="mr-2 h-6 w-6 animate-spin" />
                    Loading suggestions...
                </div>
            )}

            {suggestions.state === 'error' && (
                <div className="h-80 flex items-center justify-center text-destructive">
                    {' '}
                    {/* Adjusted height */}
                    Failed to load app suggestions
                </div>
            )}

            {suggestions.state === 'ready' &&
                suggestions.suggestions.length === 0 && (
                    <div className="h-80 flex flex-col items-center justify-center text-muted-foreground text-center px-4">
                        {' '}
                        {/* Adjusted height */}
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
                        {/* Grid for App Suggestions */}
                        <div className="grid grid-cols-4 gap-4 min-h-72 max-h-72 overflow-y-auto p-1 border rounded-md mb-4">
                            {' '}
                            {/* Fixed height */}
                            {suggestions.suggestions.map((app) => (
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
                                                ).style.display = 'none';
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
                            {/* Add placeholders if the last page isn't full, to maintain grid structure */}
                            {suggestions.suggestions.length < pageSize &&
                                Array.from({
                                    length:
                                        pageSize -
                                        suggestions.suggestions.length,
                                }).map((_, index) => (
                                    <div
                                        key={`placeholder-${index}`}
                                        className="h-24" // Match item height
                                        aria-hidden="true"
                                    ></div>
                                ))}
                        </div>

                        {/* Pagination Controls */}
                        {totalPages! > 1 && (
                            <Pagination className="mt-4">
                                <PaginationContent>
                                    <PaginationItem>
                                        <PaginationPrevious
                                            href="#"
                                            onClick={handlePreviousPage}
                                            aria-disabled={currentPage === 1}
                                            className={
                                                currentPage === 1
                                                    ? 'pointer-events-none opacity-50'
                                                    : undefined
                                            }
                                        />
                                    </PaginationItem>
                                    {renderPaginationLinks()}
                                    <PaginationItem>
                                        <PaginationNext
                                            href="#"
                                            onClick={handleNextPage}
                                            aria-disabled={
                                                currentPage === totalPages
                                            }
                                            className={
                                                currentPage === totalPages
                                                    ? 'pointer-events-none opacity-50'
                                                    : undefined
                                            }
                                        />
                                    </PaginationItem>
                                </PaginationContent>
                            </Pagination>
                        )}
                    </>
                )}

            {/* Footer with Back and Create Manually buttons */}
            <div className="flex justify-between items-center mt-6">
                {' '}
                {/* Use justify-between */}
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
