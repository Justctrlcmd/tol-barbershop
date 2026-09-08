import { authFetch } from "@/lib/api";

export type BookingSchedule = {
  open_day_from: number;
  open_day_to: number;
  closed_weekday: number | null;
  opening_time: string;
  closing_time: string;
  custom_open_time: string;
  custom_open_times: string[];
  booking_days_ahead: number;
  slot_interval_minutes: number;
  max_slots_per_booking: number;
  effective_from: string;
};

export type UpdateBookingScheduleData = Pick<
  BookingSchedule,
  | "open_day_from"
  | "open_day_to"
  | "closed_weekday"
  | "opening_time"
  | "closing_time"
  | "custom_open_times"
  | "booking_days_ahead"
>;

export type ScheduleOpenSlot = {
  id: number;
  slot_date: string;
  slot_time: string;
  barber_user_id: number;
  barber_name: string;
  created_at: string;
};

export type CreateScheduleOpenSlotData = {
  slot_date: string;
  barber_user_ids: number[];
  hour: number;
  minute: number;
  period: "AM" | "PM";
};

export type ScheduleDay = BookingSchedule & { time_slots: string[] };

const API = process.env.NEXT_PUBLIC_API_URL;

export async function getBookingSchedule(): Promise<BookingSchedule> {
  const response = await authFetch(`${API}/booking-schedule`);
  return response.data;
}

export async function updateBookingSchedule(
  data: UpdateBookingScheduleData,
): Promise<BookingSchedule> {
  const response = await authFetch(`${API}/booking-schedule`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return response.data;
}

export async function getScheduleOpenSlots(): Promise<ScheduleOpenSlot[]> {
  const response = await authFetch(`${API}/schedule-open-slots`);
  return response.data?.data ?? response.data ?? [];
}

export async function createScheduleOpenSlots(
  data: CreateScheduleOpenSlotData,
): Promise<ScheduleOpenSlot[]> {
  const response = await authFetch(`${API}/schedule-open-slots`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return response.data?.data ?? response.data ?? [];
}

export async function deleteScheduleOpenSlot(id: number): Promise<void> {
  await authFetch(`${API}/schedule-open-slots/${id}`, { method: "DELETE" });
}

export async function getScheduleDay(
  date: string,
  barberId: number,
): Promise<ScheduleDay> {
  const params = new URLSearchParams({ date, barber_id: String(barberId) });
  const response = await authFetch(`${API}/booking-schedule/day?${params.toString()}`);
  return response.data;
}
