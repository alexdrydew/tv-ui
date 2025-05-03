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

interface AppConfigFormProps {
    initial?: Readonly<AppConfig | undefined>;
    onSave: (config: AppConfig) => Promise<void>;
    onCancel: () => void; // Callback to handle cancellation/going back
}

export function AppConfigForm({
    initial = undefined,
    onSave,
    onCancel,
}: AppConfigFormProps) {
    const isEditing = initial !== undefined;

    const form = useForm<FormValues>({
        resolver: effectTsResolver(AppConfigFormSchema),
        defaultValues: {
            name: '',
            launchCommand: '',
        },
    });

    useEffect(() => {
        if (isEditing) {
            form.reset({
                name: initial.name,
                icon: initial.icon,
                launchCommand: initial.launchCommand,
            });
        } else {
            form.reset({
                name: '',
                launchCommand: '',
            });
        }
    }, [isEditing, initial, form]);

    async function onSubmit(values: FormValues) {
        const configToUpsert: AppConfig = {
            id: initial?.id ?? nanoid(),
            name: values.name,
            icon: initial?.icon,
            launchCommand: values.launchCommand,
        };
        await onSave(configToUpsert);
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="py-4 grid gap-4"
            >
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>App Name</FormLabel>
                            <FormControl>
                                <Input placeholder="My App" {...field} />
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
