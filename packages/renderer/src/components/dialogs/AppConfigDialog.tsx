import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { AppConfig } from '@app/types';
import { effectTsResolver } from '@hookform/resolvers/effect-ts';
import { Schema } from 'effect';
import { nanoid } from 'nanoid';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';

const AppConfigFormSchema = Schema.Struct({
    name: Schema.NonEmptyString.annotations({
        message: () => 'App name cannot be empty',
    }),
    icon: Schema.optional(Schema.String),
    launchCommand: Schema.NonEmptyString.annotations({
        message: () => 'Launch command cannot be empty',
    }),
});
type FormValues = Schema.Schema.Type<typeof AppConfigFormSchema>;

interface AddAppDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    configFilePath: string; // Keep configFilePath if needed for context, though not used directly for saving here
    appToEdit?: AppConfig | null;
    onSave: (config: AppConfig) => Promise<void>; // Add the onSave prop
    mode: 'add' | 'edit'; // Keep mode to adjust dialog text
}

export function AppConfigDialog({
    isOpen,
    onOpenChange,
    // configFilePath, // No longer needed for internal saving
    appToEdit = null,
    onSave, // Destructure onSave
    mode, // Destructure mode
}: AddAppDialogProps) {
    const isEditing = mode === 'edit' && appToEdit !== null;

    const form = useForm<FormValues>({
        resolver: effectTsResolver(AppConfigFormSchema),
        defaultValues: {
            name: '',
            icon: undefined,
            launchCommand: '',
        },
    });

    useEffect(() => {
        if (isOpen) {
            if (isEditing) {
                form.reset({
                    name: appToEdit.name,
                    icon: appToEdit.icon ?? '',
                    launchCommand: appToEdit.launchCommand,
                });
            } else {
                form.reset({
                    name: '',
                    icon: '',
                    launchCommand: '',
                });
            }
        }
    }, [isOpen, isEditing, appToEdit, form]);

    // onSubmit now calls the passed onSave prop
    async function onSubmit(values: FormValues) {
        const configToUpsert: AppConfig = {
            id: appToEdit?.id ?? nanoid(),
            name: values.name,
            icon: values.icon?.trim() ? values.icon.trim() : undefined,
            launchCommand: values.launchCommand,
        };

        // Call the parent's save handler
        await onSave(configToUpsert);
        // Parent handler is responsible for closing the dialog and showing toasts
    }

    const handleOpenChange = (open: boolean) => {
        if (!open) {
            form.reset(); // Reset form when closing
        }
        onOpenChange(open);
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {isEditing ? 'Edit App' : 'Add New App'}
                    </DialogTitle>
                    <DialogDescription>
                        {isEditing
                            ? `Update the details for ${appToEdit?.name ?? 'the app'}.` // Safer access to name
                            : 'Enter the details for the new application configuration.'}
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="grid gap-4"
                    >
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>App Name</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="My Awesome App"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        The display name for the application.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="icon"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Icon Path (Optional)</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="/path/to/icon.png"
                                            {...field}
                                            // Ensure value is handled correctly for optional field
                                            value={field.value ?? ''}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Path to the application icon file. Leave
                                        empty for default icon.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="launchCommand"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Launch Command</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="/usr/bin/my-app --arg"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        The command used to launch the
                                        application.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <Button type="submit">
                                {isEditing ? 'Save Changes' : 'Save App'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
