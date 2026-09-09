import { authFetch } from "@/lib/api";
import type { AppointmentStatus } from "@/services/shared/appointment.api";

export type OverviewStats = {
  completed_appointments: number;
  pending_appointments: number;
  confirmed_appointments: number;
  total_customers: number;
  total_revenue: number;
};

export type DailyRevenue = {
  date: string;
  revenue: number;
};

export type ServiceStats = {
  service_name: string;
  completed_count: number;
};

export type SlotAppointment = {
  id: number;
  customer: string | null;
  customer_email: string | null;
  customer_contact: string | null;
  service: string | null;
  barber: string | null;
  price: number;
  notes: string | null;
  appointment_date: string;
  appointment_time: string;
  status: AppointmentStatus;
};

export type TimeSlot = {
  time: string;
  appointments: SlotAppointment[];
  status: "available" | "booked";
  available_barbers: number;
  total_barbers: number;
  is_past: boolean;
  is_closed: boolean;
  is_fully_booked: boolean;
};

export type WeeklyAvailabilityDay = {
  date: string;
  day: string;
  day_number: number;
  available_slots: number;
  total_slots: number;
  is_today: boolean;
  is_past: boolean;
  is_closed: boolean;
  is_recurring_closed: boolean;
  is_fully_booked: boolean;
};

export type WeeklyDashboardStats = {
  completed_appointments: number;
  pending_appointments: number;
  confirmed_appointments: number;
  average_rating: number;
};

export type WeeklySchedule = {
  selected_date: string;
  week_start: string;
  week_end: string;
  opening_time: string;
  closing_time: string;
  active_barbers: number;
  weekly_stats: WeeklyDashboardStats;
  days: WeeklyAvailabilityDay[];
  time_slots: TimeSlot[];
};

export const getOverviewStats = async (): Promise<OverviewStats> => {
  return authFetch(`${process.env.NEXT_PUBLIC_API_URL}/appointments/overview/stats`);
};

export const getMonthlyRevenue = async (): Promise<DailyRevenue[]> => {
  return authFetch(
    `${process.env.NEXT_PUBLIC_API_URL}/appointments/overview/monthly-revenue`,
  );
};

export const getServiceStats = async (): Promise<ServiceStats[]> => {
  return authFetch(
    `${process.env.NEXT_PUBLIC_API_URL}/appointments/overview/service-stats`,
  );
};

export const getWeeklySchedule = async (
  date: Date,
  signal?: AbortSignal,
): Promise<WeeklySchedule> => {
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const encodedDate = encodeURIComponent(dateKey);

  return authFetch(
    `${process.env.NEXT_PUBLIC_API_URL}/appointments/overview/weekly-schedule?date=${encodedDate}`,
    { signal },
  );
};
