"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch, type SubmitErrorHandler } from "react-hook-form";
import { toast } from "sonner";

import { DatePickerWithLabel } from "@/components/common/DatePickerWithLabel";
import { SelectWithLabel } from "@/components/common/SelectWithLabel";
import { TextAreaWithLabel } from "@/components/common/TextAreaWithLabel";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { sanitizeText } from "@/lib/sanitizer";
import { formatTime12 } from "@/lib/time-slots";
import { getBarbers, type Barber } from "@/services/manager/barber.api";
import { getScheduleBlockedSlotOptions } from "@/services/manager/booking-schedule.api";
import {
  closedDateSchema,
  type ClosedDateSchemaFormValues,
} from "@/validations/closed.date.validation";

type ClosedDateFormProps = {
  open: boolean;
  onClose: () => void;
  onSubmit?: (data: ClosedDateSchemaFormValues) => void | Promise<void>;
  initialData?: ClosedDateSchemaFormValues;
  title?: string;
};

export function ClosedDateForm({
  open,
  onClose,
  onSubmit,
  initialData,
  title,
}: ClosedDateFormProps) {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    resetField,
    setValue,
    control,
  } = useForm<ClosedDateSchemaFormValues>({
    resolver: zodResolver(closedDateSchema),
    defaultValues: {
      date_closed: undefined,
      closure_scope: "shop",
      barber_user_id: null,
      barber_closure_mode: "full_day",
      blocked_slot_times: [],
      reason: "",
    },
  });
  const dateClosed = useWatch({ control, name: "date_closed" });
  const closureScope = useWatch({ control, name: "closure_scope" });
  const barberUserId = useWatch({ control, name: "barber_user_id" });
  const barberClosureMode = useWatch({ control, name: "barber_closure_mode" });
  const blockedSlotTimes = useWatch({ control, name: "blocked_slot_times" });
  const isBarberDayOff = closureScope === "barber";
  const [slotOptions, setSlotOptions] = useState<string[]>([]);
  const [occupiedSlots, setOccupiedSlots] = useState<Array<{ appointment_time: string; duration_minutes: number }>>([]);
  const [existingBlockedSlots, setExistingBlockedSlots] = useState<Array<{ appointment_time: string; duration_minutes: number }>>([]);
  const [openSlotTimes, setOpenSlotTimes] = useState<string[]>([]);
  const [loadingSlotOptions, setLoadingSlotOptions] = useState(false);

  useEffect(() => {
    if (!open) return;

    getBarbers()
      .then((items) => setBarbers(items.filter((barber) => barber.is_active)))
      .catch(() => toast.error("Could not load barbers"));
  }, [open]);

  useEffect(() => {
    if (initialData) {
      reset({
        ...initialData,
        barber_closure_mode: initialData.barber_closure_mode ?? "full_day",
        blocked_slot_times: initialData.blocked_slot_times ?? [],
      });
      return;
    }

    reset({
      date_closed: undefined,
      closure_scope: "shop",
      barber_user_id: null,
      barber_closure_mode: "full_day",
      blocked_slot_times: [],
      reason: "",
    });
  }, [initialData, open, reset]);

  useEffect(() => {
    if (!open || !isBarberDayOff || barberClosureMode !== "time_slots" || !barberUserId || !dateClosed) {
      return;
    }

    const slotDate = `${dateClosed.getFullYear()}-${String(dateClosed.getMonth() + 1).padStart(2, "0")}-${String(dateClosed.getDate()).padStart(2, "0")}`;
    let active = true;
    void getScheduleBlockedSlotOptions(slotDate, barberUserId)
      .then((options) => {
        if (!active) return;
        setSlotOptions(options.time_slots);
        setOccupiedSlots(options.occupied_slots);
        setExistingBlockedSlots(options.blocked_slots);
        setOpenSlotTimes(options.open_slot_times);
      })
      .catch(() => {
        if (!active) return;
        setSlotOptions([]);
        setOccupiedSlots([]);
        setExistingBlockedSlots([]);
        setOpenSlotTimes([]);
        toast.error("Could not load barber time slots");
      })
      .finally(() => {
        if (active) setLoadingSlotOptions(false);
      });

    return () => {
      active = false;
    };
  }, [barberClosureMode, barberUserId, dateClosed, isBarberDayOff, open]);

  const switchClosureScope = () => {
    const nextScope = isBarberDayOff ? "shop" : "barber";
    setValue("closure_scope", nextScope, { shouldValidate: true });
    setValue("barber_user_id", null, { shouldValidate: false });
    setValue("barber_closure_mode", "full_day", { shouldValidate: false });
    setValue("blocked_slot_times", [], { shouldValidate: false });
    resetField("date_closed");
    setSlotOptions([]);
    setOccupiedSlots([]);
    setExistingBlockedSlots([]);
    setOpenSlotTimes([]);
    setLoadingSlotOptions(false);
  };

  const onFormInvalid: SubmitErrorHandler<ClosedDateSchemaFormValues> = () => {
    toast.error("All fields are required");
  };

  const isPastSlot = (time: string): boolean => {
    if (!dateClosed) return false;

    const now = new Date();
    if (dateClosed.toDateString() !== now.toDateString()) return false;

    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute <= now.getHours() * 60 + now.getMinutes();
  };

  const onFormSubmit = async (data: ClosedDateSchemaFormValues) => {
    await onSubmit?.({
      ...data,
      barber_user_id:
        data.closure_scope === "barber" ? data.barber_user_id : null,
      reason: sanitizeText(data.reason),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-900 sm:text-2xl">
            {title ?? (
              isBarberDayOff
                ? barberClosureMode === "time_slots" ? "Block Barber Time Slots" : "Add Barber Day Off"
                : "Add Closed Date"
            )}
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-sm text-gray-500">
            {isBarberDayOff
                ? barberClosureMode === "time_slots"
                ? "Block one or more independent time slots for this barber"
                : "Make one barber unavailable for a specific date"
              : "Close the entire shop for a specific date"}
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={switchClosureScope}
          className="w-fit text-left text-sm font-medium text-blue-600 underline-offset-4 hover:underline"
        >
          {isBarberDayOff
            ? "Close the entire shop instead."
            : "Only one barber is unavailable? Set a barber day off."}
        </button>

        <form
          method="post"
          onSubmit={handleSubmit(onFormSubmit, onFormInvalid)}
          className="space-y-5"
        >
          {isBarberDayOff && (
            <div className="relative">
              <SelectWithLabel
                id="barber_user_id"
                label="Barber"
                placeholder="Select a barber"
                options={barbers.map((barber) => ({
                  value: barber.id.toString(),
                  label: barber.fullname,
                }))}
                value={barberUserId ? String(barberUserId) : ""}
                onValueChange={(value) => {
                  setValue("barber_user_id", Number(value), {
                    shouldValidate: true,
                  });
                  setValue("blocked_slot_times", [], { shouldValidate: false });
                  resetField("date_closed");
                  setSlotOptions([]);
                  setOccupiedSlots([]);
                  setExistingBlockedSlots([]);
                  setOpenSlotTimes([]);
                  setLoadingSlotOptions(false);
                }}
              />
              {errors.barber_user_id && (
                <p className="absolute left-0 top-full mt-1 text-xs text-red-500">
                  {errors.barber_user_id.message}
                </p>
              )}
            </div>
          )}

          <div className="relative">
            <DatePickerWithLabel
              id="date_closed"
              label="Closed Date"
              placeholder="Select closure date"
              date={dateClosed}
              disablePastDates
              barberId={isBarberDayOff ? barberUserId ?? undefined : undefined}
              disabled={isBarberDayOff && !barberUserId}
              onDateChange={(date) => {
                setValue("date_closed", date as Date, {
                  shouldValidate: true,
                });
                setValue("blocked_slot_times", [], { shouldValidate: false });
                setSlotOptions([]);
                setOccupiedSlots([]);
                setExistingBlockedSlots([]);
                setOpenSlotTimes([]);
                setLoadingSlotOptions(true);
              }}
            />
            {errors.date_closed && (
              <p className="absolute left-0 top-full text-xs text-red-500">
                {errors.date_closed.message}
              </p>
            )}
          </div>

          {isBarberDayOff && (
            <SelectWithLabel
              id="barber_closure_mode"
              label="Barber closure type"
              value={barberClosureMode}
              options={[
                { value: "full_day", label: "Whole day" },
                { value: "time_slots", label: "Selected time slots" },
              ]}
              onValueChange={(value) => {
                setValue("barber_closure_mode", value as "full_day" | "time_slots", { shouldValidate: true });
                setValue("blocked_slot_times", [], { shouldValidate: false });
                setSlotOptions([]);
                setLoadingSlotOptions(value === "time_slots" && Boolean(barberUserId && dateClosed));
              }}
            />
          )}

          {isBarberDayOff && barberClosureMode === "time_slots" && (
            <div className="relative space-y-2">
              <label className="text-sm font-medium text-gray-700">Blocked time slots</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-between border-gray-300 py-5 font-normal">
                    <span className={blockedSlotTimes.length ? "text-foreground" : "text-muted-foreground"}>
                      {blockedSlotTimes.length ? `${blockedSlotTimes.length} time slot${blockedSlotTimes.length === 1 ? "" : "s"} selected` : "Select time slots"}
                    </span>
                    <ChevronDown className="size-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="z-[70] w-[var(--radix-popover-trigger-width)] p-2">
                  {loadingSlotOptions ? (
                    <p className="p-2 text-sm text-gray-500">Loading available times...</p>
                  ) : slotOptions.length === 0 ? (
                    <p className="p-2 text-sm text-gray-500">No schedule times available.</p>
                  ) : (
                    <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
                      {slotOptions.map((time) => {
                        const disabled = isPastSlot(time)
                          || existingBlockedSlots.some((slot) => slot.appointment_time === time)
                          || occupiedSlots.some((slot) => slot.appointment_time === time)
                          || openSlotTimes.includes(time);
                        const checked = blockedSlotTimes.includes(time);

                        return (
                          <label key={time} className={`flex items-center gap-2 rounded px-2 py-2 text-sm ${disabled ? "cursor-not-allowed text-gray-400" : "cursor-pointer text-gray-700 hover:bg-gray-50"}`}>
                            <Checkbox
                              checked={checked}
                              disabled={disabled}
                              onCheckedChange={(value) => setValue(
                                "blocked_slot_times",
                                value === true ? [...blockedSlotTimes, time].sort() : blockedSlotTimes.filter((selected) => selected !== time),
                                { shouldValidate: true },
                              )}
                            />
                            <span>{formatTime12(time)}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              {errors.blocked_slot_times && <p className="text-xs text-red-500">{errors.blocked_slot_times.message}</p>}
              <p className="text-xs text-gray-500">Each selected time slot is treated independently.</p>
            </div>
          )}

          <div className="relative">
            <TextAreaWithLabel
              id="reason"
              label="Internal Reason"
              placeholder="Enter the internal reason..."
              maxLength={255}
              className="border-gray-300 focus:border-gray-400"
              {...register("reason")}
            />
            {errors.reason && (
              <p className="absolute left-0 top-full mt-1 text-xs text-red-500">
                {errors.reason.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              {isSubmitting
                ? "Saving..."
                : isBarberDayOff
                  ? barberClosureMode === "time_slots" ? "Block Time Slots" : "Add Barber Day Off"
                  : "Add Closed Date"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
