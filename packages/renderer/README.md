# Renderer Package

The renderer package contains the React-based user interface for the TV UI application launcher. It provides a spatial navigation-friendly interface optimized for TV/remote control usage for launching/monitoring/stopping general-purpose desktop apps.

## Architecture Overview

This package follows a component-based architecture with the following structure:

- **Components**: Reusable UI components organized by purpose
- **Pages**: Top-level page components that compose the application views
- **Hooks**: Custom React hooks for state management and side effects
- **Utils**: Shared utility functions and type helpers

## Key Design Principles

### 1. Spatial Navigation First

The entire UI is built around spatial navigation using `@noriginmedia/norigin-spatial-navigation`. Every interactive element must be focusable and navigable via directional keys.

**Key patterns:**

- Use `useFocusable()` hook for all interactive components
- Implement `useFocusKey()` for unique focus identifiers
- Wrap sections in `FocusContext.Provider` to create navigation boundaries

### 2. TV-Optimized UI

The interface is designed for large screens and remote control interaction:

- Large, clearly defined interactive areas
- Clear visual hierarchy
- Minimal text input requirements
- Context menus for secondary actions
- Every interaction should be easily accssible by remote: prioritize using directional keys and control keys over mouse interactions and key combinations.

### 3. Type Safety

Strict TypeScript usage throughout:

- All components have proper type definitions
- Shared types imported from `@app/types`
- No `any` types or type assertions
- Effect-TS integration for schema validation

### 4. Responsive design

Application should support different aspect ratios and handle window resizes

## Directory Structure

```
src/
├── components/            # Reusable UI components
├── hooks/                # Custom React hooks
├── lib/                  # Utility functions
├── pages/                # Top-level page components
├── App.tsx               # Root application component
└── main.tsx              # Application entry point
```

## Component Guidelines

### UI Components (`components/ui/`)

Base components are components directly imported from shadcn or modified versions of shadcn components enhanced for spatial navigation:

- All interactive components integrate `useFocusable()`
- Consistent focus styling via CSS classes
- Support for keyboard navigation
- Accessible by default with proper ARIA attributes

### Custom Components

Application-specific components should:

- Use proper TypeScript interfaces for props
- Handle loading and error states appropriately
- Follow the established naming conventions

### Focus Management

Every focusable component must utilize useFocusable hook:

```tsx
const focusKey = useFocusKey('component-name');
const { ref } = useFocusable({ focusKey });

return (
    <button
        ref={ref}
        onFocus={focusSelf}
        // ... other props
    >
        Content
    </button>
);
```

## State Management

### App State

The application uses a custom hook-based state management approach:

- `useApps()`: Manages application configurations and running instances
- `useLauncherConfig()`: Handles launcher-specific settings
- Local component state for UI-specific concerns

### Data Flow

The application should live load all configuration changes:

- All configuration files should be watched and application state should be updated on changes
- State of managed apps should be reflected in UI

## Error Handling

### Toast Notifications

Use Sonner for user-facing notifications:

```tsx
import { toast } from 'sonner';

// Success
toast.success('App launched successfully');

// Error with description
toast.error('Failed to launch app', {
    description: errorMessage,
});
```

## Styling

### Tailwind CSS

The project uses Tailwind CSS:

- Focus states clearly defined for spatial navigation

### Component Styling

- Use `cn()` utility for conditional classes
- Prefer Tailwind classes over custom CSS
- Use CSS variables for theme colors
- Maintain consistent spacing and sizing

## Testing Considerations

This package relies on e2e tests defined in tests/e2e of the repository root

## Development Workflow

1. **Component Development**: Start with UI components in isolation
2. **Integration**: Connect components to data layer via hooks
3. **Navigation Testing**: Verify spatial navigation works correctly
4. **Error Handling**: Implement proper error boundaries and user feedback

## Common Patterns

### Dialog Management

```tsx
const [isOpen, setIsOpen] = useState(false);

// In JSX
<Dialog open={isOpen} onOpenChange={setIsOpen}>
    <DialogContent>
        {/* Dialog content with proper focus management */}
    </DialogContent>
</Dialog>;
```

### Async Operations

```tsx
const handleAsyncAction = async () => {
    try {
        await someAsyncOperation();
        toast.success('Operation completed');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error('Operation failed', { description: message });
        console.error('Operation failed:', message);
    }
};
```

### Context Menu Integration

```tsx
<ContextMenu>
    <ContextMenuTrigger>{/* Main component */}</ContextMenuTrigger>
    <ContextMenuContent>
        <ContextMenuItem onClick={handleAction}>Action</ContextMenuItem>
    </ContextMenuContent>
</ContextMenu>
```
