"use client";

import { useEffect, useState } from "react";
import { CircleCheckBig, UserPlus } from "lucide-react";
import { SubmitErrorHandler, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { InputWithLabel } from "@/components/common/InputWithLabel";
import { SelectWithLabel } from "@/components/common/SelectWithLabel";
import { TextAreaWithLabel } from "@/components/common/TextAreaWithLabel";
import { DatePickerWithLabel } from "@/components/common/DatePickerWithLabel";
import {
  getActiveBarbers,
  getActiveServices,
  createAppointment,
  type Barber,
  type Service,
} from "@/services/shared/appointment.api";
import { getScheduleDay } from "@/services/manager/booking-schedule.api";
import { formatTime12, isTimeSlotUnavailable } from "@/lib/time-slots";
import {
  walkinSchema,
  type WalkinSchemaValues,
} from "@/validations/walkin.validation";
import { toast } from "sonner";
import {
  sanitizeString,
  sanitizeText,
} from "@/lib/sanitizer";

type WalkinFormProps = {
  onSuccess?: () => Promise<void> | void;
};

export function WalkinForm({ onSuccess }: WalkinFormProps) {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const [timeOptions, setTimeOptions] = useState<Array<{ value: string; label: string }>>([]);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WalkinSchemaValues>({
    resolver: zodResolver(walkinSchema),
    defaultValues: {
      customer_name: "",
      service_id: 0,
      barber_user_id: 0,
      appointment_date: "",
      appointment_time: "",
      price: 0,
      duration_minutes: null,
      notes: "",
    },
  });

  const selectedTime = useWatch({ control, name: "appointment_time" });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [barbersData, servicesData] = await Promise.all([
          getActiveBarbers(),
          getActiveServices(),
        ]);

        setBarbers(barbersData.filter((barber) => barber.is_active));
        setServices(servicesData.filter((service) => service.is_active));
      } catch (error) {
        console.error("Failed to fetch walk-in form data:", error);
        toast.error("Failed to load form data");
      }
    };

    fetchData();
  }, []);

  const selectedServiceId = useWatch({ control, name: "service_id" });
  const selectedBarberId = useWatch({ control, name: "barber_user_id" });
  const selectedDateValue = useWatch({ control, name: "appointment_date" });
  const selectedService = services.find((s) => s.id === selectedServiceId);
  const selectedPrice = Number(selectedService?.price ?? 0);

  useEffect(() => {
    setValue("price", selectedPrice, { shouldValidate: true });
    setValue("duration_minutes", selectedService?.duration ?? null, {
      shouldValidate: true,
    });
  }, [selectedPrice, selectedService, setValue]);

  useEffect(() => {
    if (selectedBarberId <= 0 || !selectedDateValue) {
      return;
    }

    void getScheduleDay(selectedDateValue, selectedBarberId)
      .then((day) => {
        setTimeOptions(day.time_slots.map((time) => ({
          value: time,
          label: formatTime12(time),
          disabled: isTimeSlotUnavailable(time, Number(selectedService?.duration ?? 60), [], [], day.blocked_slots),
        })));
      })
      .catch(() => {
        setTimeOptions([]);
        toast.error("Failed to load available schedule times");
      });
  }, [selectedBarberId, selectedDateValue, selectedService?.duration]);

  const onFormInvalid: SubmitErrorHandler<WalkinSchemaValues> = () => {
    toast.error("All fields are required");
  };

  const onFormSubmit = async (data: WalkinSchemaValues) => {
    try {
      await createAppointment({
        service_id: data.service_id,
        barber_user_id: data.barber_user_id,
        price: data.price,
        duration_minutes: data.duration_minutes ?? undefined,
        notes: data.notes ? sanitizeText(data.notes) : null,
        status: "completed",
        is_walkin: true,
        appointment_date: data.appointment_date,
        appointment_time: data.appointment_time,
        walkin_customer_name: sanitizeString(data.customer_name),
      });

      toast.success("Completed walk-in successfully");
      setSelectedDate(undefined);
      reset({
        customer_name: "",
        service_id: 0,
        barber_user_id: 0,
        appointment_date: "",
        appointment_time: "",
        price: 0,
        duration_minutes: null,
        notes: "",
      });
      await onSuccess?.();
    } catch (error) {
      console.error("Failed to complete walk-in booking:", error);
      const message =
        error instanceof Error ? error.message : "Failed to complete walk-in";
      toast.error(message);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <UserPlus className="w-5 h-5 text-gray-700" />
        <h2 className="text-base font-bold text-gray-900">
          New Walk-in Booking
        </h2>
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Create a walk-in booking with auto-completed status
      </p>

      <form
        method="post"
        onSubmit={handleSubmit(onFormSubmit, onFormInvalid)}
        className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6"
      >
        <div className="relative md:col-span-2">
          <InputWithLabel
            id="customer-name"
            label="Customer Name *"
            placeholder="Enter customer name"
            maxLength={255}
            className="h-10 border-gray-200 text-gray-500"
            {...register("customer_name")}
          />
          {errors.customer_name && (
            <p className="absolute left-0 top-full  text-red-500 text-xs">
              {errors.customer_name.message}
            </p>
          )}
        </div>

        <div className="relative">
          <SelectWithLabel
            id="barber"
            label="Barber *"
            placeholder="Select a barber"
            options={barbers.map((barber) => ({
              value: barber.id.toString(),
              label: barber.fullname,
            }))}
            value={selectedBarberId > 0 ? String(selectedBarberId) : ""}
            onValueChange={(value) => {
              setValue("barber_user_id", Number(value), {
                shouldValidate: true,
              });
              setValue("appointment_date", "");
              setSelectedDate(undefined);
              setTimeOptions([]);
            }}
          />
          {errors.barber_user_id && (
            <p className="absolute left-0 top-full text-red-500 text-xs">
              {errors.barber_user_id.message}
            </p>
          )}
        </div>

        <div className="relative">
          <SelectWithLabel
            id="service"
            label="Service *"
            placeholder="Select a service"
            options={services.map((service) => ({
              value: service.id.toString(),
              label: service.name,
            }))}
            value={selectedServiceId > 0 ? String(selectedServiceId) : ""}
            onValueChange={(value) =>
              setValue("service_id", Number(value), { shouldValidate: true })
            }
          />
          {errors.service_id && (
            <p className="absolute left-0 top-full text-red-500 text-xs">
              {errors.service_id.message}
            </p>
          )}
        </div>

        <div className="relative">
          <DatePickerWithLabel
            id="walkin-date"
            label="Date *"
            placeholder="Select date"
            date={selectedDate}
            maxDaysAhead={0}
            disablePastDates={false}
            disableSundays={false}
            disabled={selectedBarberId <= 0}
            barberId={selectedBarberId > 0 ? selectedBarberId : undefined}
            onDateChange={(date) => {
              if (!date) return;
              const y = date.getFullYear();
              const m = String(date.getMonth() + 1).padStart(2, "0");
              const d = String(date.getDate()).padStart(2, "0");
              const dateStr = `${y}-${m}-${d}`;
              setValue("appointment_date", dateStr, { shouldValidate: true });
              setValue("appointment_time", "", { shouldValidate: true });
              setTimeOptions([]);
              setSelectedDate(date);
            }}
          />
          {errors.appointment_date && (
            <p className="absolute left-0 top-full text-red-500 text-xs">
              {errors.appointment_date.message}
            </p>
          )}
        </div>

        <div className="relative">
          <SelectWithLabel
            id="walkin-time"
            label="Time *"
            placeholder="Select time"
            options={timeOptions}
            value={selectedTime ?? ""}
            onValueChange={(value) =>
              setValue("appointment_time", value, { shouldValidate: true })
            }
          />
          {errors.appointment_time && (
            <p className="absolute left-0 top-full text-red-500 text-xs">
              {errors.appointment_time.message}
            </p>
          )}
        </div>

        <div className="relative md:col-span-2">
          <TextAreaWithLabel
            id="notes"
            label="Notes"
            placeholder="Add notes (optional)"
            maxLength={500}
            {...register("notes")}
          />
          {errors.notes && (
            <p className="absolute left-0 top-full  text-red-500 text-xs">
              {errors.notes.message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 pt-4 md:col-span-2">
          <p className="text-lg font-semibold text-gray-900">
            Total: ₱
            {selectedPrice.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-5 gap-2"
          >
            <CircleCheckBig className="w-4 h-4" />
            {isSubmitting ? "Processing..." : "Complete Walk-in"}
          </Button>
        </div>
      </form>
    </div>
  );
}
