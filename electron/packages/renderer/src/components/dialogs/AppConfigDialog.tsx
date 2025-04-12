import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { AppConfig } from "@/api/application";
import { upsertAppConfig } from "@/api/upsertAppConfig";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { useEffect } from "react";
import { error } from "@/api/logging";

const formSchema = z.object({
  name: z.string().min(1, "App name cannot be empty"),
  icon: z.string().optional(),
  launchCommand: z.string().min(1, "Launch command cannot be empty"),
});

type FormValues = z.infer<typeof formSchema>;

interface AddAppDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  configFilePath: string;
  appToEdit?: AppConfig | null;
}

export function AppConfigDialog({
  isOpen,
  onOpenChange,
  configFilePath,
  appToEdit = null,
}: AddAppDialogProps) {
  const isEditing = appToEdit !== null;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      icon: "",
      launchCommand: "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (appToEdit) {
        form.reset({
          name: appToEdit.name,
          icon: appToEdit.icon ?? "",
          launchCommand: appToEdit.launchCommand,
        });
      } else {
        form.reset({
          name: "",
          icon: "",
          launchCommand: "",
        });
      }
    }
  }, [isOpen, appToEdit, form]);

  async function onSubmit(values: FormValues) {
    const configToUpsert: AppConfig = {
      id: appToEdit?.id ?? nanoid(),
      name: values.name,
      icon: values.icon?.trim() ? values.icon.trim() : null,
      launchCommand: values.launchCommand,
    };

    const actionVerb = isEditing ? "updated" : "added";
    const toastTitle = isEditing ? "App Updated" : "App Added";

    try {
      await upsertAppConfig(configToUpsert, configFilePath);
      toast.success(toastTitle, {
        description: `App "${configToUpsert.name}" ${actionVerb} successfully.`,
      });
      onOpenChange(false);
    } catch (e) {
      const errorAction = isEditing ? "update" : "add";
      error(`Failed to ${errorAction} app: ${e}`);
      toast.error(`Failed to ${errorAction} app`, {
        description: `${e}`,
      });
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      form.reset();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit App" : "Add New App"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? `Update the details for ${appToEdit.name}.`
              : "Enter the details for the new application configuration."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
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
                    <Input placeholder="/path/to/icon.png" {...field} />
                  </FormControl>
                  <FormDescription>
                    Path to the application icon file. Leave empty for default
                    icon.
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
                    <Input placeholder="/usr/bin/my-app --arg" {...field} />
                  </FormControl>
                  <FormDescription>
                    The command used to launch the application.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit">
                {isEditing ? "Save Changes" : "Save App"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
