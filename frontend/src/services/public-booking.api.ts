import { publicFetch } from "@/lib/api";

export type PublicBarber = {
  id: number;
  fullname: string;
  image?: string | null;
};

export type PublicService = {
  id: number;
  name: string;
  description?: string | null;
  duration: number;
  price: number | string;
  is_active: boolean;
};

export type PublicBookingSettings = {
  open_day_from: number;
  open_day_to: number;
  closed_weekday: number | null;
  closed_weekdays: number[];
  opening_time: string;
  closing_time: string;
  custom_open_time: string;
  custom_open_times: string[];
  booking_days_ahead: number;
  slot_interval_minutes: number;
  max_slots_per_booking: number;
  effective_from: string;
  open_slots: PublicOpenSlot[];
};

export type PublicOpeningHours = Pick<
  PublicBookingSettings,
  | "open_day_from"
  | "open_day_to"
  | "closed_weekdays"
  | "opening_time"
  | "closing_time"
>;

export type PublicOpenSlot = {
  date: string;
  time: string;
  barber_user_id: number;
};

export type PublicClosedDate = {
  date_closed: string;
  closure_scope: "shop" | "barber";
  barber_user_id: number | null;
};

export type PublicBookingBootstrap = {
  barbers: PublicBarber[];
  services: PublicService[];
  closed_dates: PublicClosedDate[];
  settings: PublicBookingSettings;
};

export type PublicBookingPayload = {
  mode: "single" | "group";
  fullname: string;
  email: string;
  email_confirmation: string;
  contact_number: string;
  terms_accepted: boolean;
  privacy_acknowledged: boolean;
  barber_user_id: number;
  appointment_date: string;
  notes?: string | null;
  appointments: Array<{
    customer_name: string | null;
    service_id: number;
    appointment_time: string;
  }>;
};

export type OccupiedPublicSlot = {
  appointment_time: string;
  duration_minutes: number;
};

export type PublicAvailability = {
  occupied_slots: OccupiedPublicSlot[];
  time_slots: string[];
};

export type BookingOtpResponse = {
  request_token: string;
  expires_in_seconds: number;
  resend_after_seconds: number;
};

export type PublicBookingResult = {
  reference: string;
  status: "pending";
  appointment_ids: number[];
  batch_id: string | null;
};

const API = process.env.NEXT_PUBLIC_API_URL;

export async function getPublicBookingBootstrap(): Promise<PublicBookingBootstrap> {
  const response = await publicFetch(`${API}/public-booking/bootstrap`);
  return response.data;
}

export async function getPublicOpeningHours(): Promise<PublicOpeningHours> {
  const response = await publicFetch(`${API}/public-booking-settings`, {
    cache: "no-store",
  });
  const settings = response.data as PublicBookingSettings;

  return {
    open_day_from: settings.open_day_from,
    open_day_to: settings.open_day_to,
    closed_weekdays: settings.closed_weekdays,
    opening_time: settings.opening_time,
    closing_time: settings.closing_time,
  };
}

export async function getPublicUnavailableSlots(
  barberId: number,
  date: string,
): Promise<PublicAvailability> {
  const params = new URLSearchParams({
    barber_id: String(barberId),
    date,
  });
  const response = await publicFetch(
    `${API}/public-booking/available-slots?${params.toString()}`,
  );
  return {
    occupied_slots: response.data,
    time_slots: response.time_slots,
  };
}

export async function requestBookingOtp(
  payload: PublicBookingPayload,
): Promise<BookingOtpResponse> {
  const response = await publicFetch(`${API}/public-booking/request-otp`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.data;
}

export async function verifyBookingOtp(
  requestToken: string,
  otp: string,
): Promise<PublicBookingResult> {
  const response = await publicFetch(`${API}/public-booking/verify-otp`, {
    method: "POST",
    body: JSON.stringify({ request_token: requestToken, otp }),
  });
  return response.data;
}
