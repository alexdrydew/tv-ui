// ai! convert this zod schema to simple type
export const AppStateSchema = z.object({
  id: z.string(),
  pid: z.number(),
  exit_result: z.union([
    z.literal("Success"),
    z.object({ ExitCode: z.number() }),
    z.object({ Signal: z.number() }),
    z.literal("Unknown"),
    z.null(),
  ]),
});

export type AppState = z.infer<typeof AppStateSchema>;
