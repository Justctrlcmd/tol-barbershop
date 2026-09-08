"use client";

import { useState, useEffect } from "react";
import { CalendarDays, Clock, User, Scissors } from "lucide-react";
import { useForm, type SubmitErrorHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatBookingId } from "@/lib/booking";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SelectWithLabel } from "@/components/common/SelectWithLabel";
import { DatePickerWithLabel } from "@/components/common/DatePickerWithLabel";
import { TextAreaWithLabel } from "@/components/common/TextAreaWithLabel";
import {
  getActiveBarbers,
  getUnavailableSlots,
  getBookingSettings,
  type Appointment,
  type BookingSettings,
  type OccupiedAppointmentSlot,
} from "@/services/shared/appointment.api";
import { sanitizeText } from "@/lib/sanitizer";
import { isTimeSlotUnavailable, formatTime12 } from "@/lib/time-slots";
import { toast } from "sonner";

const rescheduleSchema = z.object({
  barber_user_id: z.string().min(1, "Please select a barber"),
  appointment_date: z.string().min(1, "Please select a date"),
  appointment_time: z.string().min(1, "Please select a time"),
  reason: z
    .string()
    .trim()
    .min(1, "Please provide a reason for rescheduling")
    .max(500, "Reason must not exceed 500 characters"),
});

type RescheduleFormValues = z.infer<typeof rescheduleSchema>;

export interface RescheduleSubmitData {
  barber_user_id: number;
  appointment_date: string;
  appointment_time: string;
  reason: string;
}

type RescheduleFormProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: RescheduleSubmitData) => Promise<void>;
  appointment: Appointment;
}

function convert12HourTo24Hour(value: string): string {
  const match = value.match(/^(\d{1,2}):([0-5]\d)\s(AM|PM)$/i);
  if (!match) return value;
  const rawHours = Number(match[1]);
  const minutes = match[2];
  const period = match[3].toUpperCase();
  let hours = rawHours % 12;
  if (period === "PM") hours += 12;
  return `${hours.toString().padStart(2, "0")}:${minutes}`;
}

function convert24HourTo12Hour(value: string): string {
  const match = value.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return value;
  const hours24 = Number(match[1]);
  const minutes = match[2];
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${period}`;
}

function formatDateForApi(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isPastTime(time12hr: string, selectedDate: Date | undefined): boolean {
  if (!selectedDate) return false;
  const today = new Date();
  if (selectedDate.toDateString() !== today.toDateString()) return false;
  const match = time12hr.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/i);
  if (!match) return false;
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hours += 12;
  const minutes = Number(match[2]);
  const slotTotalMinutes = hours * 60 + minutes;
  const nowTotalMinutes = today.getHours() * 60 + today.getMinutes();
  return slotTotalMinutes + 15 <= nowTotalMinutes;
}

function formatShortDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RescheduleForm({
  open,
  onClose,
  onSubmit,
  appointment,
}: RescheduleFormProps) {
  const [barbers, setBarbers] = useState<{ value: string; label: string }[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [occupiedSlots, setOccupiedSlots] = useState<OccupiedAppointmentSlot[]>([]);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [timeSlots, setTimeSlots] = useState<{ value: string; label: string }[]>([]);
  const [settings, setSettings] = useState<BookingSettings | null>(null);

  const initialTime12 = convert24HourTo12Hour(appointment.appointment_time);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RescheduleFormValues>({
    resolver: zodResolver(rescheduleSchema),
    defaultValues: {
      barber_user_id: appointment.barber.id?.toString() ?? "",
      appointment_date: appointment.appointment_date,
      appointment_time: initialTime12,
      reason: "",
    },
  });

  const selectedBarber = watch("barber_user_id");
  const selectedDate = watch("appointment_date");
  const selectedTime = watch("appointment_time");

  useEffect(() => {
    if (!open) return;
    const fetchData = async () => {
      try {
        setLoadingData(true);
        const [barbersData, settings] = await Promise.all([
          getActiveBarbers(),
          getBookingSettings(),
        ]);
        const normalized = barbersData
          .filter((b) => b.is_active)
          .map((b) => ({
            value: b.id.toString(),
            label: b.fullname,
          }));
        setBarbers(normalized);
        setSettings(settings);
      } catch {
        toast.error("Failed to load booking data");
      } finally {
        setLoadingData(false);
      }
    };
    fetchData();
  }, [open]);

  useEffect(() => {
    if (!open) {
      reset({
        barber_user_id: appointment.barber.id?.toString() ?? "",
        appointment_date: appointment.appointment_date,
        appointment_time: initialTime12,
        reason: "",
      });
    }
  }, [open, reset, appointment, initialTime12]);

  useEffect(() => {
    const fetchUnavailableTimes = async () => {
      if (!selectedBarber || !selectedDate) {
        setOccupiedSlots([]);
        return;
      }
      try {
        setIsCheckingAvailability(true);
        const targetDate = selectedDate.includes("T")
          ? selectedDate.split("T")[0]
          : selectedDate;
        const targetBarberId = Number(selectedBarber);
        const availability = await getUnavailableSlots(
          targetBarberId,
          targetDate,
          appointment.id,
        );
        setOccupiedSlots(availability.occupied_slots);
        setTimeSlots(availability.time_slots.map((time) => ({
          value: formatTime12(time),
          label: formatTime12(time),
        })));
      } catch {
        toast.error("Failed to check availability");
        setOccupiedSlots([]);
      } finally {
        setIsCheckingAvailability(false);
      }
    };

    fetchUnavailableTimes();
  }, [selectedBarber, selectedDate, appointment.id, appointment.appointment_time]);

  useEffect(() => {
    if (
      selectedTime &&
      (isTimeSlotUnavailable(
        selectedTime,
        Number(appointment.duration_minutes ?? 60),
        occupiedSlots,
      ) ||
        (selectedDate && isPastTime(selectedTime, new Date(selectedDate))))
    ) {
      setValue("appointment_time", "");
    }
  }, [selectedTime, occupiedSlots, selectedDate, setValue, appointment.duration_minutes]);

  const onFormInvalid: SubmitErrorHandler<RescheduleFormValues> = () => {
    toast.error("All fields are required");
  };

  const onFormSubmit = async (data: RescheduleFormValues) => {
    if (isSubmitting) return;

    const parsedDate = new Date(data.appointment_date);
    if (Number.isNaN(parsedDate.getTime())) {
      toast.error("Invalid date selected");
      return;
    }

    await onSubmit({
      barber_user_id: Number(data.barber_user_id),
      appointment_date: formatDateForApi(parsedDate),
      appointment_time: convert12HourTo24Hour(data.appointment_time),
      reason: sanitizeText(data.reason),
    });
  };

  const parsedSelectedDate = selectedDate
    ? new Date(selectedDate)
    : undefined;
  const isDateDisabled = (day: Date): boolean => {
    if (!settings || !selectedBarber) return false;
    const isoWeekday = day.getDay() === 0 ? 7 : day.getDay();
    const date = formatDateForApi(day);
    const hasCustomSlot = settings.open_slots.some(
      (slot) => slot.date === date && slot.barber_user_id === Number(selectedBarber),
    );

    return !hasCustomSlot && (
      isoWeekday < settings.open_day_from
      || isoWeekday > settings.open_day_to
      || settings.closed_weekdays.includes(isoWeekday)
    );
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl sm:text-2xl font-bold text-gray-900">
            Reschedule Booking
          </DialogTitle>
          <DialogDescription className="text-gray-500 text-sm mt-0.5">
            Update the schedule details for this booking
          </DialogDescription>
        </DialogHeader>

        <div className="bg-gray-50 rounded-lg p-4 space-y-3 mb-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-gray-500">Booking ID:</span>
            <span className="text-xs font-bold text-gray-900">
              {formatBookingId(appointment.id)}
            </span>
          </div>
          <div className="border-t border-gray-200" />
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-sm font-semibold text-gray-900">
              {appointment.customer.fullname}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-600">
                <span className="font-medium text-gray-800">Current Barber:</span>{" "}
                {appointment.barber.fullname}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Scissors className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-600">
                <span className="font-medium text-gray-800">Service:</span>{" "}
                {appointment.service.name}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-600">
                <span className="font-medium text-gray-800">Current Date:</span>{" "}
                {formatShortDate(appointment.appointment_date)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-600">
                <span className="font-medium text-gray-800">Current Time:</span>{" "}
                {formatTime12(appointment.appointment_time)}
              </span>
            </div>
          </div>
        </div>

        <form
          method="post"
          onSubmit={handleSubmit(onFormSubmit, onFormInvalid)}
          className="space-y-5"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <SelectWithLabel
                id="barber"
                label="Barber"
                placeholder="Select a barber"
                options={barbers}
                value={selectedBarber}
                onValueChange={(value) => {
                  setValue("barber_user_id", value, {
                    shouldValidate: true,
                  });
                  setValue("appointment_date", "");
                  setValue("appointment_time", "");
                  setOccupiedSlots([]);
                }}
                disabled={loadingData || isSubmitting}
              />
              {errors.barber_user_id && (
                <p className="absolute left-0 top-full mt-1 text-red-500 text-xs">
                  {errors.barber_user_id.message}
                </p>
              )}
            </div>

            <div className="relative">
              <input type="hidden" {...register("appointment_date")} />
              <DatePickerWithLabel
                id="date"
                label="New Date"
                placeholder="Pick a date"
                disablePastDates={true}
                maxDaysAhead={settings?.booking_days_ahead}
                disableSundays={false}
                isDateDisabled={isDateDisabled}
                date={parsedSelectedDate}
                onDateChange={(date) => {
                  if (date) {
                    setValue("appointment_date", formatDateForApi(date));
                  }
                }}
                disabled={!selectedBarber || isSubmitting}
                barberId={
                  selectedBarber ? Number(selectedBarber) : undefined
                }
              />
              {errors.appointment_date && (
                <p className="absolute left-0 top-full mt-1 text-red-500 text-xs">
                  {errors.appointment_date.message}
                </p>
              )}
            </div>
          </div>

          <div className="relative">
            <SelectWithLabel
              id="time"
              label="New Time"
              placeholder="Select time"
              options={timeSlots.map((time) => ({
                ...time,
                disabled:
                  isTimeSlotUnavailable(
                    time.value,
                    Number(appointment.duration_minutes ?? 60),
                    occupiedSlots,
                  ) ||
                  isPastTime(time.value, parsedSelectedDate),
              }))}
              value={selectedTime}
              onValueChange={(value) => setValue("appointment_time", value)}
              disabled={
                !selectedBarber || !selectedDate || isCheckingAvailability || isSubmitting
              }
            />
            {errors.appointment_time && (
              <p className="absolute left-0 top-full mt-1 text-red-500 text-xs">
                {errors.appointment_time.message}
              </p>
            )}
          </div>

          <div className="relative">
            <TextAreaWithLabel
              id="reason"
              label="Reason for Rescheduling"
              placeholder="Explain why this booking is being rescheduled..."
              rows={3}
              maxLength={500}
              className="border-gray-300 focus:border-gray-400"
              {...register("reason")}
            />
            {errors.reason && (
              <p className="absolute left-0 top-full mt-1 text-red-500 text-xs">
                {errors.reason.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmitting ? "Rescheduling..." : "Reschedule Booking"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
