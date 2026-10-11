import { z } from "zod";

const memberSchema = z.object({
  customer_name: z
    .string()
    .trim()
    .max(255)
    .regex(/^[\p{L}\s.'-]+$/u, "Enter a valid group member name")
    .nullable(),
  service_id: z.number().int().positive(),
  appointment_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  add_on_ids: z.array(z.number().int().positive()).max(50)
    .refine((ids) => new Set(ids).size === ids.length, "Select each add-on once")
    .optional(),
});

export const publicBookingSchema = z
  .object({
    mode: z.enum(["single", "group"]),
    fullname: z
      .string()
      .trim()
      .min(2, "Full name is required")
      .max(255)
      .regex(/^[\p{L}\s.'-]+$/u, "Enter a valid full name"),
    email: z.string().trim().email("Enter a valid email address").toLowerCase(),
    email_confirmation: z.string().trim().email().toLowerCase(),
    contact_number: z.string().trim().regex(/^09\d{9}$/, "Enter a valid PH mobile number"),
    terms_accepted: z.literal(true, { message: "You must accept the Terms of Use" }),
    privacy_acknowledged: z.literal(true, { message: "You must acknowledge the Privacy Policy" }),
    barber_user_id: z.number().int().positive(),
    appointment_date: z.string().min(1),
    notes: z.string().trim().max(500).nullable().optional(),
    appointments: z.array(memberSchema).min(1).max(11),
  })
  .superRefine((data, ctx) => {
    if (data.email !== data.email_confirmation) {
      ctx.addIssue({
        code: "custom",
        path: ["email_confirmation"],
        message: "Email addresses do not match",
      });
    }
    if (data.mode === "single" && data.appointments.length !== 1) {
      ctx.addIssue({ code: "custom", path: ["appointments"], message: "Select one booking" });
    }
    if (data.mode === "group" && data.appointments.length < 2) {
      ctx.addIssue({ code: "custom", path: ["appointments"], message: "Select at least two bookings" });
    }
    if (data.mode === "group") {
      data.appointments.slice(1).forEach((appointment, index) => {
        if (!appointment.customer_name) {
          ctx.addIssue({
            code: "custom",
            path: ["appointments", index + 1, "customer_name"],
            message: "Each additional group member requires a name",
          });
        }
      });
    }
  });

export type PublicBookingValues = z.infer<typeof publicBookingSchema>;
