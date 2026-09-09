"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, Mail } from "lucide-react";
import { toast } from "sonner";

import { DatePickerWithLabel } from "@/components/common/DatePickerWithLabel";
import { InputWithLabel } from "@/components/common/InputWithLabel";
import { SelectWithLabel } from "@/components/common/SelectWithLabel";
import { TextAreaWithLabel } from "@/components/common/TextAreaWithLabel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRateLimit } from "@/hooks/useRateLimit";
import { useDeploymentRefreshGuard } from "@/hooks/useDeploymentRefreshGuard";
import {
  normalizeEmail,
  normalizePhone,
  sanitizeString,
  sanitizeText,
} from "@/lib/sanitizer";
import { cn } from "@/lib/utils";
import { formatTime12, isTimeSlotUnavailable } from "@/lib/time-slots";
import {
  getPublicBookingBootstrap,
  getPublicUnavailableSlots,
  requestBookingOtp,
  verifyBookingOtp,
  type OccupiedPublicSlot,
  type PublicBarber,
  type PublicBookingPayload,
  type PublicBookingResult,
  type PublicBookingSettings,
  type PublicClosedDate,
  type PublicService,
} from "@/services/public-booking.api";
import { publicBookingSchema } from "@/validations/public-booking.validation";

const REMEMBERED_DETAILS_KEY = "tol_public_booking_details";
const REMEMBERED_DETAILS_TTL_MS = 90 * 24 * 60 * 60 * 1_000;
const STORED_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RememberedBookingDetails = {
  fullname: string;
  email: string;
  contactNumber: string;
  savedAt: number;
};

function readRememberedBookingDetails(): RememberedBookingDetails | null {
  try {
    const raw = window.localStorage.getItem(REMEMBERED_DETAILS_KEY);
    if (!raw) return null;

    const value = JSON.parse(raw) as Partial<RememberedBookingDetails>;
    if (
      typeof value.fullname !== "string" ||
      typeof value.email !== "string" ||
      typeof value.contactNumber !== "string" ||
      typeof value.savedAt !== "number" ||
      Date.now() - value.savedAt > REMEMBERED_DETAILS_TTL_MS
    ) {
      window.localStorage.removeItem(REMEMBERED_DETAILS_KEY);
      return null;
    }

    const fullname = sanitizeString(value.fullname);
    const email = normalizeEmail(value.email);
    const contactNumber = normalizePhone(value.contactNumber);
    if (
      fullname.length < 2 ||
      !STORED_EMAIL_PATTERN.test(email) ||
      !/^09\d{9}$/.test(contactNumber)
    ) {
      window.localStorage.removeItem(REMEMBERED_DETAILS_KEY);
      return null;
    }

    return { fullname, email, contactNumber, savedAt: value.savedAt };
  } catch {
    window.localStorage.removeItem(REMEMBERED_DETAILS_KEY);
    return null;
  }
}

function toApiDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function to24Hour(value: string): string {
  const match = value.match(/^(\d{1,2}):([0-5]\d)\s(AM|PM)$/i);
  if (!match) return value;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function isPastTime(value: string, selectedDate?: Date): boolean {
  if (!selectedDate || selectedDate.toDateString() !== new Date().toDateString()) return false;
  const match = value.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/i);
  if (!match) return false;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2]) + 15 <= new Date().getHours() * 60 + new Date().getMinutes();
}

function unavailableForService(
  time: string,
  serviceId: string,
  services: PublicService[],
  occupiedSlots: OccupiedPublicSlot[],
): boolean {
  const service = services.find((item) => String(item.id) === serviceId);
  return isTimeSlotUnavailable(time, Number(service?.duration ?? 60), occupiedSlots);
}

export function NewAppointmentForm() {
  const [barbers, setBarbers] = useState<PublicBarber[]>([]);
  const [services, setServices] = useState<PublicService[]>([]);
  const [settings, setSettings] = useState<PublicBookingSettings | null>(null);
  const [closedDates, setClosedDates] = useState<PublicClosedDate[]>([]);
  const [mode, setMode] = useState<"single" | "group">("single");
  const [slotCount, setSlotCount] = useState(2);
  const [selectedBarber, setSelectedBarber] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState("");
  const [slotServices, setSlotServices] = useState<string[]>([]);
  const [slotTimes, setSlotTimes] = useState<string[]>([]);
  const [slotNames, setSlotNames] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [fullname, setFullname] = useState("");
  const [email, setEmail] = useState("");
  const [emailConfirmation, setEmailConfirmation] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [occupiedSlots, setOccupiedSlots] = useState<OccupiedPublicSlot[]>([]);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [requestToken, setRequestToken] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [pendingPayload, setPendingPayload] = useState<PublicBookingPayload | null>(null);
  const [result, setResult] = useState<PublicBookingResult | null>(null);
  const [hasUnsavedFormInput, setHasUnsavedFormInput] = useState(false);

  useDeploymentRefreshGuard(
    hasUnsavedFormInput ||
      mode === "group" ||
      Boolean(selectedBarber) ||
      Boolean(selectedService) ||
      Boolean(selectedDate) ||
      Boolean(selectedTime) ||
      confirmationOpen ||
      otpOpen ||
      loading ||
      pendingPayload !== null ||
      result !== null,
  );

  const rateLimit = useRateLimit({
    maxAttempts: 15,
    cooldownMinutes: 3,
    storageKey: "public_booking_rate_limit",
  });

  useEffect(() => {
    const saved = readRememberedBookingDetails();
    if (!saved) return;

    setFullname(saved.fullname);
    setEmail(saved.email);
    setEmailConfirmation(saved.email);
    setContactNumber(saved.contactNumber);
  }, []);

  useEffect(() => {
    void getPublicBookingBootstrap()
      .then((data) => {
        setBarbers(data.barbers);
        setServices(data.services);
        setSettings(data.settings);
        setClosedDates(data.closed_dates);
      })
      .catch(() => toast.error("Failed to load booking information."));
  }, []);

  useEffect(() => {
    if (mode !== "group") return;
    setSlotNames((current) => Array.from({ length: slotCount }, (_, index) => index === 0 ? "" : current[index] ?? ""));
    setSlotServices((current) => Array.from({ length: slotCount }, (_, index) => current[index] ?? ""));
    setSlotTimes((current) => Array.from({ length: slotCount }, (_, index) => current[index] ?? ""));
  }, [mode, slotCount]);

  useEffect(() => {
    if (!selectedBarber || !selectedDate) {
      setOccupiedSlots([]);
      setAvailableTimes([]);
      return;
    }

    setCheckingAvailability(true);
    void getPublicUnavailableSlots(Number(selectedBarber), toApiDate(selectedDate))
      .then((availability) => {
        setOccupiedSlots(availability.occupied_slots);
        setAvailableTimes(availability.time_slots);
      })
      .catch(() => {
        setOccupiedSlots([]);
        setAvailableTimes([]);
        toast.error("Failed to check availability.");
      })
      .finally(() => setCheckingAvailability(false));
  }, [selectedBarber, selectedDate]);

  useEffect(() => {
    if (!resendAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  const timeOptions = availableTimes.map((time) => ({
    value: formatTime12(time),
    label: formatTime12(time),
  }));
  const selectedServiceData = services.find((service) => String(service.id) === selectedService);
  const singleTotal = Number(selectedServiceData?.price ?? 0);
  const groupTotal = slotServices.reduce((total, serviceId) => {
    const service = services.find((item) => String(item.id) === serviceId);
    return total + Number(service?.price ?? 0);
  }, 0);
  const total = mode === "single" ? singleTotal : groupTotal;
  const barberName = barbers.find((barber) => String(barber.id) === selectedBarber)?.fullname ?? "—";
  const serviceSummary = mode === "single"
    ? selectedServiceData?.name ?? "—"
    : Array.from(new Set(slotServices.map((serviceId) => services.find((service) => String(service.id) === serviceId)?.name).filter(Boolean))).join(", ") || "—";
  const timeSummary = mode === "single"
    ? selectedTime || "—"
    : slotTimes.filter(Boolean).join(", ") || "—";
  const pendingServiceSummary = pendingPayload
    ? Array.from(new Set(pendingPayload.appointments.map((slot) => services.find((service) => service.id === slot.service_id)?.name).filter(Boolean))).join(", ") || "—"
    : "—";
  const pendingTimeSummary = pendingPayload
    ? pendingPayload.appointments.map((slot) => formatTime12(slot.appointment_time)).join(", ") || "—"
    : "—";
  const unavailableDates = useMemo(
    () => closedDates
      .filter((date) => date.closure_scope === "shop" || date.barber_user_id === Number(selectedBarber))
      .map((date) => date.date_closed),
    [closedDates, selectedBarber],
  );
  const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1_000));
  const isDateDisabled = (day: Date): boolean => {
    if (!settings || !selectedBarber) return false;
    const isoWeekday = day.getDay() === 0 ? 7 : day.getDay();
    const date = toApiDate(day);
    const hasCustomSlot = settings.open_slots.some(
      (slot) => slot.date === date && slot.barber_user_id === Number(selectedBarber),
    );

    return !hasCustomSlot && (
      isoWeekday < settings.open_day_from
      || isoWeekday > settings.open_day_to
      || settings.closed_weekdays.includes(isoWeekday)
    );
  };

  const scheduleValid = mode === "single"
    ? Boolean(selectedBarber && selectedService && selectedDate && selectedTime)
    : Boolean(selectedBarber && selectedDate && slotServices.length === slotCount && slotTimes.length === slotCount)
      && slotServices.every(Boolean)
      && slotTimes.every(Boolean)
      && slotNames.slice(1).every((name) => name.trim().length > 0)
      && new Set(slotTimes).size === slotTimes.length;

  function buildPayload(): PublicBookingPayload | null {
    if (!selectedDate) return null;
    const appointments = mode === "single"
      ? [{ customer_name: null, service_id: Number(selectedService), appointment_time: to24Hour(selectedTime) }]
      : slotServices.map((serviceId, index) => ({
          customer_name: index === 0 ? null : slotNames[index]?.trim() || null,
          service_id: Number(serviceId),
          appointment_time: to24Hour(slotTimes[index]),
        }));
    const candidate = {
      mode,
      fullname,
      email,
      email_confirmation: emailConfirmation,
      contact_number: contactNumber,
      terms_accepted: termsAccepted,
      privacy_acknowledged: privacyAcknowledged,
      barber_user_id: Number(selectedBarber),
      appointment_date: toApiDate(selectedDate),
      notes: notes.trim() ? sanitizeText(notes) : null,
      appointments,
    };
    const validation = publicBookingSchema.safeParse(candidate);
    if (!validation.success) {
      toast.error(validation.error.issues[0]?.message ?? "Check your booking information.");
      return null;
    }
    return validation.data;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = buildPayload();
    if (!payload) return;
    setPendingPayload(payload);
    setConfirmationOpen(true);
  }

  async function sendOtp(payload: PublicBookingPayload) {
    if (!rateLimit.attempt()) return;
    setLoading(true);
    try {
      const response = await requestBookingOtp(payload);
      setRequestToken(response.request_token);
      setResendAt(Date.now() + response.resend_after_seconds * 1_000);
      setNow(Date.now());
      setOtp("");
      setConfirmationOpen(false);
      setOtpOpen(true);
      toast.success("Verification code sent.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function submitOtp() {
    if (otp.length !== 6 || !requestToken) return;
    setLoading(true);
    try {
      const booking = await verifyBookingOtp(requestToken, otp);
      if (pendingPayload) {
        window.localStorage.setItem(
          REMEMBERED_DETAILS_KEY,
          JSON.stringify({
            fullname: sanitizeString(pendingPayload.fullname),
            email: normalizeEmail(pendingPayload.email),
            contactNumber: normalizePhone(pendingPayload.contact_number),
            savedAt: Date.now(),
          } satisfies RememberedBookingDetails),
        );
      }
      setResult(booking);
      setOtpOpen(false);
      rateLimit.reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The verification code could not be accepted.");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setResult(null);
    setMode("single");
    setSelectedBarber("");
    setSelectedService("");
    setSelectedDate(undefined);
    setSelectedTime("");
    setSlotCount(2);
    setSlotServices([]);
    setSlotTimes([]);
    setSlotNames([]);
    setNotes("");
    setTermsAccepted(false);
    setPrivacyAcknowledged(false);
    setPendingPayload(null);
    setRequestToken("");
    setOtp("");
    setHasUnsavedFormInput(false);
  }

  return (
    <div className="w-full bg-transparent font-sans">
      <div className="relative rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
        <div className="absolute top-4 right-4 z-10 flex w-fit items-center gap-0.5 rounded-md bg-gray-100 p-0.5 sm:top-6 sm:right-6 sm:gap-1 sm:rounded-lg sm:p-1">
          {(["single", "group"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => setMode(option)}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium capitalize transition sm:rounded-md sm:px-4 sm:py-1.5 sm:text-sm",
                mode === option ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700",
              )}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="mb-6">
          <h1 className="pr-28 text-3xl font-bold text-gray-900 sm:pr-44 sm:text-4xl">Schedule Your Haircut</h1>
          <p className="mt-2 text-gray-500">Choose your schedule, review the total, and verify your email to submit the request.</p>
        </div>
        <form
          id="appointment-booking-form"
          onSubmit={handleSubmit}
          onInputCapture={() => setHasUnsavedFormInput(true)}
          onChangeCapture={() => setHasUnsavedFormInput(true)}
          className="space-y-8"
        >
          <section>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {mode === "group" && settings && (
                <div className="md:col-span-2">
                  <SelectWithLabel id="slot-count" label="How many total?" placeholder="Select number" options={Array.from({ length: settings.max_slots_per_booking - 1 }, (_, index) => ({ value: String(index + 2), label: String(index + 2) }))} value={String(slotCount)} onValueChange={(value) => setSlotCount(Number(value))} />
                </div>
              )}
              <SelectWithLabel id="barber" label="Barber" placeholder="Select a barber" options={barbers.map((barber) => ({ value: String(barber.id), label: barber.fullname }))} value={selectedBarber} onValueChange={(value) => { setSelectedBarber(value); setSelectedDate(undefined); setSelectedTime(""); setSlotTimes([]); }} />

              {mode === "single" ? (
                <>
                  <SelectWithLabel id="service" label="Service" placeholder="Select a service" options={services.map((service) => ({ value: String(service.id), label: service.name }))} value={selectedService} onValueChange={setSelectedService} />
                  <DatePickerWithLabel id="date" label="Date" placeholder="Pick a date" disablePastDates maxDaysAhead={settings?.booking_days_ahead} disableSundays={false} date={selectedDate} onDateChange={setSelectedDate} disabled={!selectedBarber} closedDates={unavailableDates} isDateDisabled={isDateDisabled} />
                  <SelectWithLabel id="time" label="Time" placeholder="Select time" options={timeOptions.map((time) => ({ ...time, disabled: unavailableForService(time.value, selectedService, services, occupiedSlots) || isPastTime(time.value, selectedDate) }))} value={selectedTime} onValueChange={setSelectedTime} disabled={!selectedBarber || !selectedDate || checkingAvailability} />
                </>
              ) : (
                <>
                  <DatePickerWithLabel id="date" label="Date" placeholder="Pick a date" disablePastDates maxDaysAhead={settings?.booking_days_ahead} disableSundays={false} date={selectedDate} onDateChange={setSelectedDate} disabled={!selectedBarber} closedDates={unavailableDates} isDateDisabled={isDateDisabled} />
                  <div className="space-y-3 md:col-span-2">
                    <p className="text-sm font-medium text-gray-700">Per Person</p>
                    {Array.from({ length: slotCount }, (_, index) => (
                      <div key={index} className="grid grid-cols-1 items-end gap-3 rounded-lg bg-gray-50 p-3 sm:grid-cols-[3fr_1fr_1fr]">
                        <InputWithLabel id={`slot-name-${index}`} label={`Person ${index + 1}`} value={index === 0 ? fullname : slotNames[index] ?? ""} onChange={(event) => {
                          const value = event.target.value;
                          if (index === 0) {
                            setFullname(value);
                          }
                          setSlotNames((current) => {
                            const next = [...current];
                            next[index] = value;
                            return next;
                          });
                        }} placeholder="Full name" maxLength={255} className="h-10 border-gray-200 bg-white text-gray-900" />
                        <SelectWithLabel id={`slot-service-${index}`} label="Service" placeholder="Select" options={services.map((service) => ({ value: String(service.id), label: service.name }))} value={slotServices[index] ?? ""} onValueChange={(value) => setSlotServices((current) => { const next = [...current]; next[index] = value; return next; })} disabled={!selectedBarber || !selectedDate} />
                        <SelectWithLabel id={`slot-time-${index}`} label="Time" placeholder="Select" options={timeOptions.map((time) => ({ ...time, disabled: unavailableForService(time.value, slotServices[index], services, occupiedSlots) || isPastTime(time.value, selectedDate) }))} value={slotTimes[index] ?? ""} onValueChange={(value) => setSlotTimes((current) => { const next = [...current]; next[index] = value; return next; })} disabled={!selectedBarber || !selectedDate || checkingAvailability} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="md:col-span-2">
                <TextAreaWithLabel id="notes" label="Notes" placeholder="Add notes for your barber (optional)" rows={4} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} className="border-gray-200 text-gray-900 focus-visible:border-red-400 focus-visible:ring-red-100" />
              </div>
            </div>
          </section>

          <section className="border-t border-gray-200 pt-6">
            <h2 className="text-lg font-bold text-gray-900">Service Summary</h2>
            <div className="mt-4 space-y-3">
              {mode === "single" && selectedServiceData && <SummaryRow name={selectedServiceData.name} description={selectedServiceData.description} price={singleTotal} />}
              {mode === "group" && Array.from({ length: slotCount }, (_, index) => {
                const service = services.find((item) => String(item.id) === slotServices[index]);
                return <SummaryRow key={index} name={index === 0 ? fullname || "Person 1" : slotNames[index] || `Person ${index + 1}`} description={service?.name ?? "No service selected"} price={Number(service?.price ?? 0)} />;
              })}
              <div className="flex items-center justify-between border-t border-gray-200 pt-3"><p className="font-semibold text-gray-900">Total</p><p className="font-semibold text-gray-900">₱{total.toFixed(2)}</p></div>
            </div>
          </section>

          <section className="border-t border-gray-200 pt-6">
            <h2 className="text-lg font-bold text-gray-900">Contact Details</h2>
            <p className="mt-1 text-sm text-gray-500">Status updates will be sent to this email address.</p>
            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              <InputWithLabel id="fullname" label="Full Name" value={fullname} onChange={(event) => setFullname(event.target.value)} maxLength={255} autoComplete="name" />
              <InputWithLabel id="contact-number" inputMode="numeric" label="Contact Number" value={contactNumber} onChange={(event) => setContactNumber(event.target.value.replace(/\D/g, "").slice(0, 11))} maxLength={11} autoComplete="tel" />
              <InputWithLabel id="email" type="email" label="Email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={255} autoComplete="email" />
              <InputWithLabel id="email-confirmation" type="email" label="Confirm Email" value={emailConfirmation} onChange={(event) => setEmailConfirmation(event.target.value)} maxLength={255} autoComplete="off" />
            </div>
            <div className="mt-5 space-y-3">
              <ConsentRow checked={termsAccepted} onChange={setTermsAccepted}>I accept the <Link href="/terms-of-use" target="_blank" className="text-primary underline">Terms of Use</Link>.</ConsentRow>
              <ConsentRow checked={privacyAcknowledged} onChange={setPrivacyAcknowledged}>I acknowledge the <Link href="/privacy-policy" target="_blank" className="text-primary underline">Privacy Policy</Link>.</ConsentRow>
            </div>
          </section>

          <button type="submit" disabled={!scheduleValid || !termsAccepted || !privacyAcknowledged || loading} className="w-full rounded-xl bg-red-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50">Schedule Haircut</button>
        </form>
      </div>

      <Dialog open={confirmationOpen} onOpenChange={(open) => !loading && setConfirmationOpen(open)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Confirm Your Booking Information</DialogTitle><DialogDescription>Review everything carefully. Booking updates will be sent to the email below.</DialogDescription></DialogHeader>
          <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
            <Detail label="Name" value={fullname} /><Detail label="Email" value={email.toLowerCase()} /><Detail label="Contact" value={contactNumber} /><Detail label="Barber" value={barberName} /><Detail label="Service" value={serviceSummary} /><Detail label="Date" value={selectedDate?.toLocaleDateString() ?? "—"} /><Detail label="Time" value={timeSummary} /><Detail label="Bookings" value={mode === "single" ? "1" : String(slotCount)} /><Detail label="Total" value={`₱${total.toFixed(2)}`} />
          </div>
          <p className="text-sm font-medium text-amber-700">Make sure the email is correct. Confirmation, rejection, and all schedule updates will be sent there.</p>
          <DialogFooter><Button type="button" variant="outline" disabled={loading} onClick={() => setConfirmationOpen(false)}>Edit Details</Button><Button type="button" disabled={loading || !pendingPayload} onClick={() => pendingPayload && void sendOtp(pendingPayload)}>{loading ? "Sending..." : "Send Verification Code"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={otpOpen} onOpenChange={(open) => !loading && setOtpOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Mail className="size-5 text-primary" />Verify Your Email</DialogTitle><DialogDescription>Enter the six-digit code sent to {email.toLowerCase()}. The slot will be checked again after verification.</DialogDescription></DialogHeader>
          <InputWithLabel id="booking-otp" label="Verification Code" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => { setHasUnsavedFormInput(true); setOtp(event.target.value.replace(/\D/g, "").slice(0, 6)); }} maxLength={6} className="text-center text-xl tracking-[0.4em]" />
          <p className="text-center text-sm text-muted-foreground">
            Having trouble with your code?{" "}
            <a
              href="https://www.facebook.com/profile.php?id=61550652631553"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
            >
              Contact TOL Barbershop on Facebook
            </a>
          </p>
          <DialogFooter className="gap-2 sm:justify-between"><Button type="button" variant="ghost" disabled={loading || resendSeconds > 0 || !pendingPayload} onClick={() => pendingPayload && void sendOtp(pendingPayload)}>{resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend Code"}</Button><Button type="button" disabled={loading || otp.length !== 6} onClick={() => void submitOtp()}>{loading ? "Verifying..." : "Verify and Submit"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={result !== null} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-green-600" />Booking Request Submitted</DialogTitle><DialogDescription>Your request is pending staff confirmation. Save this booking reference for your records.</DialogDescription></DialogHeader>
          <div className="rounded-xl bg-slate-100 p-5 text-center"><p className="text-xs font-medium uppercase tracking-wider text-gray-500">Booking Reference</p><p className="mt-2 text-2xl font-bold tracking-wide text-primary">{result?.reference}</p><p className="mt-2 text-sm font-medium capitalize text-amber-700">{result?.status}</p></div>
          <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Detail label="Name" value={fullname} />
              <Detail label="Email" value={email.toLowerCase()} />
              <Detail label="Contact" value={contactNumber} />
              <Detail label="Barber" value={barberName} />
              <Detail label="Service" value={pendingServiceSummary} />
              <Detail label="Date" value={formatBookingDate(pendingPayload?.appointment_date)} />
              <Detail label="Time" value={pendingTimeSummary} />
              <Detail label="Bookings" value={String(pendingPayload?.appointments.length ?? 0)} />
            </div>
            <div className="border-t border-gray-200 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Schedule Details</p>
              <div className="space-y-2">
                {pendingPayload?.appointments.map((slot, index) => {
                  const service = services.find((item) => item.id === slot.service_id);
                  const customerName = slot.customer_name || fullname;
                  return (
                    <div key={index} className="flex items-start justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">{pendingPayload.mode === "group" ? customerName : service?.name ?? "Service"}</p>
                        {pendingPayload.mode === "group" ? <p className="text-gray-600">{service?.name ?? "Service"}</p> : null}
                        <p className="text-xs text-gray-500">{formatTime12(slot.appointment_time)}</p>
                      </div>
                      <p className="shrink-0 font-medium text-gray-900">₱{Number(service?.price ?? 0).toFixed(2)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            {pendingPayload?.notes ? <Detail label="Notes" value={pendingPayload.notes} /> : null}
            <div className="flex items-center justify-between border-t border-gray-200 pt-3">
              <span className="font-semibold text-gray-900">Total</span>
              <span className="font-semibold text-gray-900">₱{total.toFixed(2)}</span>
            </div>
          </div>
          <DialogFooter><Button type="button" className="w-full" onClick={resetForm}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryRow({ name, description, price }: { name: string; description?: string | null; price: number }) {
  return <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="font-medium text-gray-900">{name}</p>{description && <p className="truncate text-sm text-muted-foreground">{description}</p>}</div><p className="shrink-0 font-medium text-gray-900">₱{price.toFixed(2)}</p></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><span className="text-gray-500">{label}</span><span className="text-right font-medium text-gray-900">{value}</span></div>;
}

function formatBookingDate(value: string | undefined): string {
  if (!value) return "—";
  return new Date(value + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function ConsentRow({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) {
  return <label className="flex items-start gap-3 text-sm text-gray-700"><Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} /><span>{children}</span></label>;
}
