import { z } from "zod";

export const bookingScheduleSchema = z
  .object({
    open_day_from: z.number().int().min(1).max(7),
    open_day_to: z.number().int().min(1).max(7),
    closed_weekdays: z.array(z.number().int().min(1).max(7)).max(7),
    opening_time: z.string().regex(/^(?:[01]\d|2[0-3]):00$/),
    closing_time: z.string().regex(/^(?:[01]\d|2[0-3]):00$/),
    custom_open_times: z
      .array(z.string().regex(/^(?:[01]\d|2[0-3]):(?:00|05|10|15|20|25|30|35|40|45|50|55)$/))
      .min(1)
      .max(24),
    booking_days_ahead: z.number().int().min(1).max(30),
  })
  .superRefine((schedule, context) => {
    if (schedule.open_day_to < schedule.open_day_from) {
      context.addIssue({
        code: "custom",
        path: ["open_day_to"],
        message: "The last open day cannot come before the first open day.",
      });
    }
    if (schedule.closing_time < schedule.opening_time) {
      context.addIssue({
        code: "custom",
        path: ["closing_time"],
        message: "The closing time cannot be earlier than the opening time.",
      });
    }
    schedule.custom_open_times.forEach((customTime, index) => {
      if (customTime < schedule.opening_time || customTime > schedule.closing_time) {
        context.addIssue({
          code: "custom",
          path: ["custom_open_times", index],
          message: "Each custom time must be within the working hours.",
        });
      }
    });
    if (new Set(schedule.custom_open_times).size !== schedule.custom_open_times.length) {
      context.addIssue({
        code: "custom",
        path: ["custom_open_times"],
        message: "Each custom time must be unique.",
      });
    }
    if (new Set(schedule.closed_weekdays).size !== schedule.closed_weekdays.length) {
      context.addIssue({
        code: "custom",
        path: ["closed_weekdays"],
        message: "Each closed day must be unique.",
      });
    }
    schedule.closed_weekdays.forEach((weekday, index) => {
      if (weekday < schedule.open_day_from || weekday > schedule.open_day_to) {
        context.addIssue({
          code: "custom",
          path: ["closed_weekdays", index],
          message: "Each closed day must be within the open-day range.",
        });
      }
    });
  });

export const scheduleOpenSlotSchema = z.object({
  slot_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  barber_user_ids: z.array(z.number().int().positive()).min(1),
  hour: z.number().int().min(1).max(12),
  minute: z.number().int().min(0).max(55).multipleOf(5),
  period: z.enum(["AM", "PM"]),
});
