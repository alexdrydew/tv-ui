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
import { AppConfig, upsertAppConfig } from "@/api/application"; // Use upsertAppConfig import
import { toast } from "sonner";
import { error } from "@tauri-apps/plugin-log";
import { nanoid } from "nanoid";

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
}

export function AddAppDialog({
  isOpen,
  onOpenChange,
  configFilePath,
}: AddAppDialogProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      icon: "",
      launchCommand: "",
    },
  });

  async function onSubmit(values: FormValues) {
    const configToUpsert: AppConfig = {
      name: values.name,
      icon: values.icon?.trim() ? values.icon.trim() : null,
      launchCommand: values.launchCommand,
      id: nanoid(), // Keep generating ID for new apps
    };

    try {
      await upsertAppConfig(configToUpsert, configFilePath);
      toast.success(`App "${configToUpsert.name}" saved successfully.`);
      form.reset();
      onOpenChange(false);
    } catch (e) {
      error(`Failed to add app: ${e}`);
      toast.error("Failed to add app", {
        description: `${e}`,
      });
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New App</DialogTitle>
          <DialogDescription>
            Enter the details for the new application configuration.
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
              <Button type="submit">Save App</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
