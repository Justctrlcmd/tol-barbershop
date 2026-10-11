import { z } from "zod";
import { discountAmountSchema } from "@/validations/discount.validation";

export const appointmentStatusSchema = z.enum([
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
  "rejected",
]);

const bookingTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const bookingDateSchema = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00`).getTime()), {
    message: "Booking date must be a valid date.",
  });

const baseAppointmentSchema = z.object({
  booking_customer_id: z.number().int().positive(),
  service_id: z.number().int().positive(),
  barber_user_id: z.number().int().positive(),
  appointment_date: bookingDateSchema,
  appointment_time: z
    .string()
    .regex(
      bookingTimePattern,
      "Booking time must use the HH:mm format.",
    ),
  duration_minutes: z.number().int().min(1).nullable().optional(),
  price: z.number().int("Price must be a whole number").min(0).max(999999),
  status: appointmentStatusSchema.optional(),
  notes: z.string().max(500).nullable().optional(),
  cancellation_reason: z.string().max(500).nullable().optional(),
});

export const createAppointmentSchema = baseAppointmentSchema;

const updateBaseSchema = z.object({
  discount_amount: discountAmountSchema.optional(),
  booking_customer_id: z.number().int().positive(),
  service_id: z.number().int().positive(),
  barber_user_id: z.number().int().positive(),
  appointment_date: z
    .string()
    .min(1)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), {
      message: "Booking date must be a valid date.",
    }),
  appointment_time: z
    .string()
    .regex(
      bookingTimePattern,
      "Booking time must use the HH:mm format.",
    ),
  duration_minutes: z.number().int().min(1).nullable().optional(),
  price: z.number().int("Price must be a whole number").min(0).max(999999),
  status: appointmentStatusSchema.optional(),
  notes: z.string().max(500).nullable().optional(),
  cancellation_reason: z.string().max(500).nullable().optional(),
});

export const updateAppointmentSchema = updateBaseSchema.superRefine((data, ctx) => {
  if (data.discount_amount !== undefined && data.status !== "completed") {
    ctx.addIssue({ code: "custom", path: ["discount_amount"], message: "Discounts can only be applied when completing a booking." });
  }
  if ((data.discount_amount ?? 0) > data.price) {
    ctx.addIssue({ code: "custom", path: ["discount_amount"], message: "Discount cannot exceed the booking total." });
  }
});

export const cancellationReasonSchema = z.object({
  cancellation_reason: z
    .string()
    .trim()
    .min(1, "Please provide a reason for this action.")
    .max(500, "Cancellation reason must not exceed 500 characters."),
});

const batchSlotSchema = z.object({
  customer_name: z.string().max(255).nullable(),
  service_id: z.number().int().positive(),
  appointment_time: z
    .string()
    .regex(
      bookingTimePattern,
      "Booking time must use the HH:mm format.",
    ),
  duration_minutes: z.number().int().min(1).optional(),
  price: z.number().int("Price must be a whole number").min(0).max(999999),
});

export const batchAppointmentSchema = z.object({
  barber_user_id: z.number().int().positive(),
  appointment_date: bookingDateSchema,
  notes: z.string().max(500).nullable().optional(),
  appointments: z.array(batchSlotSchema).min(2).max(11),
});

export type CreateAppointmentSchemaValues = z.infer<
  typeof createAppointmentSchema
>;
export type UpdateAppointmentSchemaValues = z.infer<
  typeof updateAppointmentSchema
>;
export type CancellationReasonSchemaFormValues = z.infer<
  typeof cancellationReasonSchema
>;
export type BatchAppointmentSchemaValues = z.infer<typeof batchAppointmentSchema>;
