import { AppConfig } from '@app/types';
import { Button } from '../ui/button';
import { useEffect, useState } from 'react';
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
} from '@/components/ui/pagination'; // Import pagination components

interface SelectAppFromOSProps {
    onSelect: (config: AppConfig) => Promise<void>; // Callback when an app is selected
    onCancel: () => void; // Callback to handle cancellation/going back
}

const ITEMS_PER_PAGE = 16; // Define how many apps per page

// Helper function for sorting AppConfig by name (case-insensitive)
const sortAppsByName = (a: AppConfig, b: AppConfig) => {
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
};

export function SelectAppFromOS({ onSelect, onCancel }: SelectAppFromOSProps) {
    const [suggestions, setSuggestions] = useState<AppConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1); // Add state for current page

    useEffect(() => {
        const fetchSuggestions = async () => {
            setIsLoading(true);
            setError(null);
            setCurrentPage(1); // Reset to first page on new fetch
            try {
                const result = await getSuggestedAppConfigs();
                // Sort the results alphabetically by name before setting state
                const sortedResult = result.sort(sortAppsByName);
                setSuggestions(sortedResult);
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

    // --- Pagination Logic ---
    // Suggestions are now guaranteed to be sorted before this logic runs
    const totalPages = Math.ceil(suggestions.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const currentSuggestions = suggestions.slice(startIndex, endIndex);

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
        if (currentPage < totalPages) {
            setCurrentPage(currentPage + 1);
        }
    };

    // Helper to generate pagination links with ellipsis
    const renderPaginationLinks = () => {
        const pageLinks = [];
        const maxVisiblePages = 3; // Max page numbers to show directly (excluding first/last)
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

        // Ellipsis after first page?
        if (currentPage > halfVisible + 2 && totalPages > maxVisiblePages + 2) {
            pageLinks.push(<PaginationEllipsis key="start-ellipsis" />);
        }

        // Calculate range of pages to show around current page
        let startPage = Math.max(2, currentPage - halfVisible);
        let endPage = Math.min(
            totalPages - 1,
            currentPage + halfVisible,
        );

        // Adjust range if near the beginning or end
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
    // --- End Pagination Logic ---

    return (
        <div className="py-4">
            <p className="text-muted-foreground mb-4">
                Select an application detected on your system.
            </p>

            {isLoading && (
                <div className="h-72 flex items-center justify-center text-muted-foreground">
                    {' '}
                    {/* Increased height slightly */}
                    <Loader2Icon className="mr-2 h-6 w-6 animate-spin" />
                    Loading suggestions...
                </div>
            )}

            {error && (
                <div className="h-72 flex items-center justify-center text-destructive">
                    {' '}
                    {/* Increased height slightly */}
                    {error}
                </div>
            )}

            {!isLoading && !error && suggestions.length === 0 && (
                <div className="h-72 flex items-center justify-center text-muted-foreground">
                    {' '}
                    {/* Increased height slightly */}
                    No applications found or suggestion feature not available on
                    this OS.
                </div>
            )}

            {!isLoading && !error && suggestions.length > 0 && (
                <>
                    {/* Grid for App Suggestions */}
                    <div className="grid grid-cols-4 gap-4 min-h-72 max-h-72 overflow-y-auto p-1 border rounded-md mb-4">
                        {' '}
                        {/* Fixed height */}
                        {currentSuggestions.map((app) => (
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
                                    <>
                                        {/* Removed console log for cleaner output */}
                                        <img
                                            src={app.icon} // Use data URL directly
                                            alt={`${app.name} icon`}
                                            className="h-8 w-8 mb-1 object-contain" // Ensure icon fits
                                            onError={(e) => {
                                                // Fallback or hide if image fails to load
                                                console.warn(
                                                    `[renderer][SelectAppFromOS] Failed to load icon from data URL for ${app.name}`,
                                                    e,
                                                );
                                                (
                                                    e.target as HTMLImageElement
                                                ).style.display = 'none';
                                                // Optionally show a fallback icon here
                                            }}
                                        />
                                    </>
                                ) : (
                                    <PackageIcon className="h-8 w-8 mb-1 text-muted-foreground" />
                                )}
                                <span className="text-xs truncate w-full">
                                    {app.name}
                                </span>
                            </button>
                        ))}
                        {/* Add placeholders if the last page isn't full, to maintain grid structure */}
                        {currentSuggestions.length < ITEMS_PER_PAGE &&
                            Array.from({
                                length:
                                    ITEMS_PER_PAGE -
                                    currentSuggestions.length,
                            }).map((_, index) => (
                                <div
                                    key={`placeholder-${index}`}
                                    className="h-24" // Match item height
                                    aria-hidden="true"
                                ></div>
                            ))}
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
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
                                        aria-disabled={currentPage === totalPages}
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

            {/* Removed old pagination message */}

            <div className="flex justify-end gap-2 mt-6">
                {' '}
                {/* Added margin-top */}
                <Button type="button" variant="outline" onClick={onCancel}>
                    Back
                </Button>
                {/* Selection happens by clicking the grid item */}
            </div>
        </div>
    );
}
