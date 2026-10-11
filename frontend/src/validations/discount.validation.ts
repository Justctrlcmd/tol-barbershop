import { z } from "zod";

export const discountAmountSchema = z.number()
  .min(0, "Discount cannot be negative.")
  .max(999999, "Discount must not exceed 999999.")
  .refine((amount) => Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001, "Use at most two decimal places.");

export function getDiscountError(amount: number, subtotal: number): string | undefined {
  const validation = discountAmountSchema.safeParse(amount);
  if (!validation.success) return validation.error.issues[0]?.message;
  if (amount > subtotal) return "Discount cannot exceed the booking total.";
}
