import { z } from "zod";
import { discountAmountSchema } from "@/validations/discount.validation";

const walkinDateSchema = z
  .string()
  .min(1, "Date is required.")
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00`).getTime()), {
    message: "Date must be a valid date.",
  })
  .refine(
    (value) => {
      const date = new Date(`${value}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return date <= today;
    },
    { message: "Walk-in date cannot be in the future." },
  );

export const walkinSchema = z.object({
  discount_amount: discountAmountSchema.optional(),
  customer_name: z
    .string()
    .trim()
    .min(2, "Customer name is required.")
    .max(255, "Customer name must not exceed 255 characters.")
    .regex(/^[A-Za-z\s]+$/, "Customer name must only contain letters and spaces"),
  service_id: z.number().int().positive("Please select a service."),
  barber_user_id: z.number().int().positive("Please select a barber."),
  appointment_date: walkinDateSchema,
  appointment_time: z
    .string()
    .min(1, "Time is required.")
    .regex(
      /^(?:[01]\d|2[0-3]):[0-5]\d$/,
      "Booking time must use the HH:mm format.",
    ),
  price: z
    .number()
    .int("Price must be a whole number")
    .min(0, "Price must be valid.")
    .max(999999, "Price must not exceed 999999."),
  duration_minutes: z.number().int().min(1).nullable().optional(),
  notes: z
    .string()
    .trim()
    .max(500, "Notes must not exceed 500 characters.")
    .nullable()
    .optional(),
}).superRefine((data, ctx) => {
  if ((data.discount_amount ?? 0) > data.price) {
    ctx.addIssue({ code: "custom", path: ["discount_amount"], message: "Discount cannot exceed the booking total." });
  }
});

export type WalkinSchemaValues = z.infer<typeof walkinSchema>;
