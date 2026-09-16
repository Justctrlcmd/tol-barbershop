import { z } from "zod";

export const closedDateSchema = z
  .object({
    date_closed: z.date({ message: "Closed date is required" }),
    closure_scope: z.enum(["shop", "barber"]),
    barber_user_id: z.number().int().positive().nullable().optional(),
    barber_closure_mode: z.enum(["full_day", "time_slots"]),
    blocked_slot_times: z.array(z.string()),
    reason: z
      .string()
      .trim()
      .min(1, "Reason is required")
      .max(255, "Reason must not exceed 255 characters"),
  })
  .superRefine((data, context) => {
    if (data.closure_scope === "barber" && !data.barber_user_id) {
      context.addIssue({
        code: "custom",
        path: ["barber_user_id"],
        message: "Barber is required",
      });
    }
    if (data.closure_scope === "barber" && data.barber_closure_mode === "time_slots" && data.blocked_slot_times.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["blocked_slot_times"],
        message: "Select at least one time slot",
      });
    }
  });

export type ClosedDateSchemaFormValues = z.infer<typeof closedDateSchema>;
