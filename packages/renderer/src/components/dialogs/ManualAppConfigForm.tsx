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

interface ManualAppConfigFormProps {
    appToEdit?: AppConfig | null;
    onSave: (config: AppConfig) => Promise<void>;
    onCancel: () => void; // Callback to handle cancellation/going back
    mode: 'add' | 'edit';
}

export function ManualAppConfigForm({
    appToEdit = null,
    onSave,
    onCancel,
    mode,
}: ManualAppConfigFormProps) {
    const isEditing = mode === 'edit' && appToEdit !== null;

    const form = useForm<FormValues>({
        resolver: effectTsResolver(AppConfigFormSchema),
        defaultValues: {
            name: '',
            icon: undefined,
            launchCommand: '',
        },
    });

    // Reset form when appToEdit changes or mode switches
    useEffect(() => {
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
    }, [isEditing, appToEdit, form]);

    async function onSubmit(values: FormValues) {
        const configToUpsert: AppConfig = {
            id: appToEdit?.id ?? nanoid(),
            name: values.name,
            icon: values.icon?.trim() ? values.icon.trim() : undefined,
            launchCommand: values.launchCommand,
        };
        await onSave(configToUpsert);
        // Parent (AppConfigDialog) is responsible for closing
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid gap-4 py-4"
            >
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>App Name</FormLabel>
                            <FormControl>
                                <Input placeholder="My Awesome App" {...field} />
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
                                    value={field.value ?? ''}
                                />
                            </FormControl>
                            <FormDescription>
                                Path to the application icon file. Leave empty
                                for default icon.
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
                                The command used to launch the application.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button type="submit">
                        {isEditing ? 'Save Changes' : 'Save App'}
                    </Button>
                </div>
            </form>
        </Form>
    );
}

