"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarPlus } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { DatePickerWithLabel } from "@/components/common/DatePickerWithLabel";
import { InputWithLabel } from "@/components/common/InputWithLabel";
import { SelectWithLabel } from "@/components/common/SelectWithLabel";
import { TextAreaWithLabel } from "@/components/common/TextAreaWithLabel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRateLimit } from "@/hooks/useRateLimit";
import {
  normalizeEmail,
  normalizePhone,
  sanitizeString,
  sanitizeText,
} from "@/lib/sanitizer";
import { formatTime12, isTimeSlotUnavailable } from "@/lib/time-slots";
import {
  createAssistedBooking,
  getActiveBarbers,
  getActiveServices,
  getBookingSettings,
  getUnavailableSlots,
  type Barber,
  type BookingSettings,
  type OccupiedAppointmentSlot,
  type Service,
} from "@/services/shared/appointment.api";
import {
  assistedBookingSchema,
  type AssistedBookingValues,
} from "@/validations/assisted-booking.validation";

type AssistedBookingFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void> | void;
};

function toApiDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isPastTime(value: string, selectedDate?: Date): boolean {
  if (
    !selectedDate ||
    selectedDate.toDateString() !== new Date().toDateString()
  ) {
    return false;
  }

  const [hour, minute] = value.split(":").map(Number);
  return (
    hour * 60 + minute + 15 <=
    new Date().getHours() * 60 + new Date().getMinutes()
  );
}

export function AssistedBookingForm({
  open,
  onOpenChange,
  onSuccess,
}: AssistedBookingFormProps) {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [occupiedSlots, setOccupiedSlots] = useState<OccupiedAppointmentSlot[]>(
    [],
  );
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const rateLimit = useRateLimit({
    maxAttempts: 5,
    cooldownMinutes: 1,
    storageKey: "assisted_booking_rate_limit",
  });
  const {
    control,
    handleSubmit,
    register,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AssistedBookingValues>({
    resolver: zodResolver(assistedBookingSchema),
    defaultValues: {
      customer_name: "",
      customer_email: "",
      customer_contact_number: "",
      service_id: 0,
      barber_user_id: 0,
      appointment_date: "",
      appointment_time: "",
      notes: "",
    },
  });
  const selectedBarberId = useWatch({ control, name: "barber_user_id" });
  const selectedServiceId = useWatch({ control, name: "service_id" });
  const selectedTime = useWatch({ control, name: "appointment_time" });

  useEffect(() => {
    if (!open) return;

    let active = true;
    void Promise.all([
      getActiveBarbers(),
      getActiveServices(),
      getBookingSettings(),
    ])
      .then(([barberData, serviceData, bookingSettings]) => {
        if (!active) return;
        setBarbers(barberData.filter((barber) => barber.is_active));
        setServices(serviceData.filter((service) => service.is_active));
        setSettings(bookingSettings);
      })
      .catch(() => toast.error("Failed to load assisted booking information."));

    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open || selectedBarberId <= 0 || !selectedDate) {
      return;
    }

    let active = true;
    void getUnavailableSlots(selectedBarberId, toApiDate(selectedDate))
      .then((availability) => {
        if (!active) return;
        setOccupiedSlots(availability.occupied_slots);
        setAvailableTimes(availability.time_slots);
      })
      .catch(() => {
        if (!active) return;
        setOccupiedSlots([]);
        setAvailableTimes([]);
        toast.error("Failed to check available times.");
      })
      .finally(() => {
        if (active) setCheckingAvailability(false);
      });

    return () => {
      active = false;
    };
  }, [open, selectedBarberId, selectedDate]);

  const selectedService = services.find(
    (service) => service.id === selectedServiceId,
  );
  const timeOptions = useMemo(
    () =>
      availableTimes.map((time) => ({
        value: time,
        label: formatTime12(time),
        disabled:
          !selectedService ||
          isTimeSlotUnavailable(
            time,
            Number(selectedService.duration ?? 60),
            occupiedSlots,
          ) ||
          isPastTime(time, selectedDate),
      })),
    [availableTimes, occupiedSlots, selectedDate, selectedService],
  );

  const isDateDisabled = (day: Date): boolean => {
    if (!settings || selectedBarberId <= 0) return false;
    const isoWeekday = day.getDay() === 0 ? 7 : day.getDay();
    const date = toApiDate(day);
    const hasCustomSlot = settings.open_slots.some(
      (slot) => slot.date === date && slot.barber_user_id === selectedBarberId,
    );

    return (
      !hasCustomSlot &&
      (isoWeekday < settings.open_day_from ||
        isoWeekday > settings.open_day_to ||
        settings.closed_weekdays.includes(isoWeekday))
    );
  };

  const closeForm = () => {
    if (isSubmitting) return;
    reset();
    setSelectedDate(undefined);
    setOccupiedSlots([]);
    setAvailableTimes([]);
    setCheckingAvailability(false);
    onOpenChange(false);
  };

  const submit = async (data: AssistedBookingValues) => {
    if (!rateLimit.attempt()) return;

    try {
      await createAssistedBooking({
        customer_name: sanitizeString(data.customer_name),
        customer_email: data.customer_email
          ? normalizeEmail(data.customer_email)
          : null,
        customer_contact_number: data.customer_contact_number
          ? normalizePhone(data.customer_contact_number)
          : null,
        service_id: data.service_id,
        barber_user_id: data.barber_user_id,
        appointment_date: data.appointment_date,
        appointment_time: data.appointment_time,
        notes: data.notes ? sanitizeText(data.notes) : null,
      });
      rateLimit.reset();
      toast.success("Assisted booking confirmed.");
      reset();
      setSelectedDate(undefined);
      setOccupiedSlots([]);
      setAvailableTimes([]);
      setCheckingAvailability(false);
      onOpenChange(false);
      await onSuccess();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create assisted booking.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && closeForm()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="size-5 text-blue-600" />
            Assisted Booking
          </DialogTitle>
          <DialogDescription>
            Reserve one available barber slot for a customer. Email and contact
            number are optional.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pb-5 pr-1 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <InputWithLabel
                id="assisted-customer-name"
                label="Customer Name *"
                maxLength={255}
                autoComplete="name"
                {...register("customer_name")}
              />
              {errors.customer_name ? (
                <p className="mt-1 text-xs text-red-500">
                  {errors.customer_name.message}
                </p>
              ) : null}
            </div>
            <div>
              <InputWithLabel
                id="assisted-customer-email"
                label="Email"
                type="email"
                maxLength={255}
                autoComplete="email"
                {...register("customer_email")}
              />
              {errors.customer_email ? (
                <p className="mt-1 text-xs text-red-500">
                  {errors.customer_email.message}
                </p>
              ) : null}
            </div>
            <div>
              <InputWithLabel
                id="assisted-customer-contact"
                label="Contact Number"
                inputMode="numeric"
                maxLength={11}
                autoComplete="tel"
                {...register("customer_contact_number")}
              />
              {errors.customer_contact_number ? (
                <p className="mt-1 text-xs text-red-500">
                  {errors.customer_contact_number.message}
                </p>
              ) : null}
            </div>
            <div>
              <SelectWithLabel
                id="assisted-barber"
                label="Barber *"
                placeholder="Select a barber"
                options={barbers.map((barber) => ({
                  value: String(barber.id),
                  label: barber.fullname,
                }))}
                value={selectedBarberId > 0 ? String(selectedBarberId) : ""}
                onValueChange={(value) => {
                  setValue("barber_user_id", Number(value), {
                    shouldValidate: true,
                  });
                  setValue("appointment_date", "");
                  setValue("appointment_time", "");
                  setSelectedDate(undefined);
                  setOccupiedSlots([]);
                  setAvailableTimes([]);
                }}
              />
              {errors.barber_user_id ? (
                <p className="mt-1 text-xs text-red-500">
                  {errors.barber_user_id.message}
                </p>
              ) : null}
            </div>
            <div>
              <SelectWithLabel
                id="assisted-service"
                label="Service *"
                placeholder="Select a service"
                options={services.map((service) => ({
                  value: String(service.id),
                  label: service.name,
                }))}
                value={selectedServiceId > 0 ? String(selectedServiceId) : ""}
                onValueChange={(value) => {
                  setValue("service_id", Number(value), {
                    shouldValidate: true,
                  });
                  setValue("appointment_time", "");
                }}
              />
              {errors.service_id ? (
                <p className="mt-1 text-xs text-red-500">
                  {errors.service_id.message}
                </p>
              ) : null}
            </div>
            <div>
              <DatePickerWithLabel
                id="assisted-date"
                label="Date *"
                date={selectedDate}
                disablePastDates
                disableSundays={false}
                maxDaysAhead={settings?.booking_days_ahead}
                barberId={selectedBarberId > 0 ? selectedBarberId : undefined}
                disabled={selectedBarberId <= 0}
                isDateDisabled={isDateDisabled}
                onDateChange={(date) => {
                  if (!date) return;
                  setSelectedDate(date);
                  setCheckingAvailability(true);
                  setValue("appointment_date", toApiDate(date), {
                    shouldValidate: true,
                  });
                  setValue("appointment_time", "");
                  setOccupiedSlots([]);
                  setAvailableTimes([]);
                }}
              />
              {errors.appointment_date ? (
                <p className="mt-1 text-xs text-red-500">
                  {errors.appointment_date.message}
                </p>
              ) : null}
            </div>
            <div>
              <SelectWithLabel
                id="assisted-time"
                label="Available Time *"
                placeholder={
                  checkingAvailability ? "Checking times..." : "Select a time"
                }
                options={timeOptions}
                value={selectedTime ?? ""}
                disabled={
                  !selectedDate || !selectedService || checkingAvailability
                }
                onValueChange={(value) =>
                  setValue("appointment_time", value, { shouldValidate: true })
                }
              />
              {errors.appointment_time ? (
                <p className="mt-1 text-xs text-red-500">
                  {errors.appointment_time.message}
                </p>
              ) : null}
            </div>
            <div className="sm:col-span-2">
              <TextAreaWithLabel
                id="assisted-notes"
                label="Notes"
                maxLength={500}
                placeholder="Add booking notes (optional)"
                {...register("notes")}
              />
              {errors.notes ? (
                <p className="mt-1 text-xs text-red-500">
                  {errors.notes.message}
                </p>
              ) : null}
            </div>
            <p className="font-semibold text-gray-900">
              Total: ₱{Number(selectedService?.price ?? 0).toFixed(2)}
            </p>
          </div>

          <DialogFooter className="shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={closeForm}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {isSubmitting ? "Reserving..." : "Confirm Booking"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
