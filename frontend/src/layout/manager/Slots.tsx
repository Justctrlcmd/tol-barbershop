"use client";

import { useCallback, useState, useEffect } from "react";
import {
  Plus,
  Clock,
  CalendarDays,
  Timer,
  Ban,
  Calendar,
  X,
  AlertTriangle,
  Settings,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { ActivityLog } from "@/components/common/ActivityLog";
import { DatePickerWithLabel } from "@/components/common/DatePickerWithLabel";
import { useManagementModuleHeaderActions } from "@/layout/manager/ManagementModulePage";
import { ClosedDateForm } from "@/forms/ClosedDateForm";
import { ClosedDateSchemaFormValues } from "@/validations/closed.date.validation";
import { SelectWithLabel } from "@/components/common/SelectWithLabel";
import {
  getClosedDates,
  createClosedDate,
  updateClosedDate,
  getClosedDateActivities,
  type ClosedDate,
  type ClosedDateActivity,
} from "@/services/manager/close.date.api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getBarbers, type Barber } from "@/services/manager/barber.api";
import {
  createScheduleOpenSlots,
  deleteScheduleOpenSlot,
  getBookingSchedule,
  getScheduleOpenSlots,
  updateBookingSchedule,
  type BookingSchedule,
  type ScheduleOpenSlot,
  type UpdateBookingScheduleData,
} from "@/services/manager/booking-schedule.api";
import {
  bookingScheduleSchema,
  scheduleOpenSlotSchema,
} from "@/validations/booking-schedule.validation";

const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
];

const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  value: `${String(hour).padStart(2, "0")}:00`,
  label: new Date(`1970-01-01T${String(hour).padStart(2, "0")}:00:00`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }),
}));

const TWELVE_HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: String(index + 1),
}));

const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index * 5),
  label: String(index * 5).padStart(2, "0"),
}));

const BOOKING_WINDOW_OPTIONS = Array.from({ length: 30 }, (_, index) => {
  const days = index + 1;

  return {
    value: String(days),
    label: `${days} ${days === 1 ? "day" : "days"}`,
  };
});

const defaultSchedule: UpdateBookingScheduleData = {
  open_day_from: 1,
  open_day_to: 7,
  closed_weekdays: [7],
  opening_time: "09:00",
  closing_time: "19:00",
  custom_open_times: ["12:30"],
  booking_days_ahead: 7,
};

const formatDateToLocal = (date: Date): string => {
  return (
    date.getFullYear() +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0")
  );
};

type TimeSelection = {
  hour: number;
  minute: number;
  period: "AM" | "PM";
};

type ScheduleException =
  | { kind: "open_slot"; sortKey: string; slot: ScheduleOpenSlot }
  | { kind: "closed_date"; sortKey: string; date: ClosedDate };

function toTimeSelection(value: string): TimeSelection {
  const [hour = "12", minute = "30"] = value.slice(0, 5).split(":");
  const hour24 = Number(hour);

  return {
    hour: hour24 % 12 || 12,
    minute: Number(minute),
    period: hour24 >= 12 ? "PM" : "AM",
  };
}

function toTwentyFourHourTime({ hour, minute, period }: TimeSelection): string {
  const hour24 = hour % 12 + (period === "PM" ? 12 : 0);

  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function clampTime(value: string, openingTime: string, closingTime: string): string {
  return value < openingTime ? openingTime : value > closingTime ? closingTime : value;
}

function withCustomOpenTime(
  schedule: UpdateBookingScheduleData,
  index: number,
  changes: Partial<TimeSelection>,
): UpdateBookingScheduleData {
  const customOpenTime = toTwentyFourHourTime({
    ...toTimeSelection(schedule.custom_open_times[index]),
    ...changes,
  });

  return {
    ...schedule,
    custom_open_times: schedule.custom_open_times.map((time, timeIndex) => (
      timeIndex === index
        ? clampTime(customOpenTime, schedule.opening_time, schedule.closing_time)
        : time
    )),
  };
}

function addCustomOpenTime(schedule: UpdateBookingScheduleData): UpdateBookingScheduleData {
  const selectedTimes = new Set(schedule.custom_open_times);
  const lastTime = schedule.custom_open_times.at(-1) ?? schedule.opening_time;
  const [hour, minute] = lastTime.split(":").map(Number);
  const start = (hour * 60) + minute;

  for (let offset = 5; offset < 1440; offset += 5) {
    const candidateMinutes = (start + offset) % 1440;
    const candidate = `${String(Math.floor(candidateMinutes / 60)).padStart(2, "0")}:${String(candidateMinutes % 60).padStart(2, "0")}`;

    if (
      candidate >= schedule.opening_time
      && candidate <= schedule.closing_time
      && !selectedTimes.has(candidate)
    ) {
      return {
        ...schedule,
        custom_open_times: [...schedule.custom_open_times, candidate],
      };
    }
  }

  return schedule;
}

function addClosedWeekday(schedule: UpdateBookingScheduleData): UpdateBookingScheduleData {
  const nextWeekday = DAYS.find((day) => (
    day.value >= schedule.open_day_from
    && day.value <= schedule.open_day_to
    && !schedule.closed_weekdays.includes(day.value)
  ));

  if (!nextWeekday) return schedule;

  return {
    ...schedule,
    closed_weekdays: [...schedule.closed_weekdays, nextWeekday.value]
      .sort((left, right) => left - right),
  };
}

export function Slots() {
  const { setHeaderActions } = useManagementModuleHeaderActions();
  const { user } = useAuth();
  const canConfigureOperation = user?.role === "manager";
  const [showClosedDateModal, setShowClosedDateModal] = useState(false);
  const [closedDates, setClosedDates] = useState<ClosedDate[]>([]);
  const [exceptionsPage, setExceptionsPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [activityLogs, setActivityLogs] = useState<
    Array<{
      title: string;
      reason: string;
      actor: string;
      actorLabel: string;
      time: string;
    }>
  >([]);
  const [activityCurrentPage, setActivityCurrentPage] = useState(1);
  const [activityTotalPages, setActivityTotalPages] = useState(1);
  const [activityLoading, setActivityLoading] = useState(true);
  const [closedDateToReopen, setClosedDateToReopen] =
    useState<ClosedDate | null>(null);
  const [isReopening, setIsReopening] = useState(false);
  const [schedule, setSchedule] = useState<BookingSchedule | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<UpdateBookingScheduleData>(defaultSchedule);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [openSlots, setOpenSlots] = useState<ScheduleOpenSlot[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [showOpenSlotModal, setShowOpenSlotModal] = useState(false);
  const [openSlotDate, setOpenSlotDate] = useState<Date | undefined>();
  const [openSlotBarbers, setOpenSlotBarbers] = useState<number[]>([]);
  const [openSlotHour, setOpenSlotHour] = useState(12);
  const [openSlotMinute, setOpenSlotMinute] = useState(0);
  const [openSlotPeriod, setOpenSlotPeriod] = useState<"AM" | "PM">("PM");
  const [isSavingOpenSlot, setIsSavingOpenSlot] = useState(false);
  const customTimes = scheduleDraft.custom_open_times.map(toTimeSelection);
  const recurringClosedDays: Array<number | null> = scheduleDraft.closed_weekdays.length
    ? scheduleDraft.closed_weekdays
    : [null];
  const scheduleExceptions = [
    ...openSlots.map((slot): ScheduleException => ({
      kind: "open_slot",
      sortKey: `${slot.slot_date}T${slot.slot_time}`,
      slot,
    })),
    ...closedDates.map((date): ScheduleException => ({
      kind: "closed_date",
      sortKey: `${date.date_closed}T00:00`,
      date,
    })),
  ].sort((left, right) => left.sortKey.localeCompare(right.sortKey));
  const exceptionsPerPage = 5;
  const exceptionsTotalPages = Math.max(
    1,
    Math.ceil(scheduleExceptions.length / exceptionsPerPage),
  );
  const paginatedExceptions = scheduleExceptions.slice(
    (exceptionsPage - 1) * exceptionsPerPage,
    exceptionsPage * exceptionsPerPage,
  );

  useEffect(() => {
    setExceptionsPage((page) => Math.min(page, exceptionsTotalPages));
  }, [exceptionsTotalPages]);

  useEffect(() => {
    setHeaderActions(
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setShowScheduleModal(true)}
        disabled={!canConfigureOperation}
        title={canConfigureOperation ? undefined : "Only managers can configure the operation schedule."}
        className="shrink-0 whitespace-nowrap bg-white md:hidden"
      >
        <Settings className="size-4" />
        {canConfigureOperation ? "Configure" : "Manager only"}
      </Button>,
    );

    return () => setHeaderActions(null);
  }, [canConfigureOperation, setHeaderActions]);

  const scheduleInfo = [
    {
      icon: CalendarDays,
      label: "Working Days",
      value: schedule
        ? `${DAYS[schedule.open_day_from - 1]?.label} – ${DAYS[schedule.open_day_to - 1]?.label}`
        : "Loading...",
      accent: "bg-blue-50 text-blue-600",
      iconBg: "bg-blue-100",
    },
    {
      icon: Clock,
      label: "Working Hours",
      value: schedule
        ? `${formatScheduleTime(schedule.opening_time)} – ${formatScheduleTime(schedule.closing_time)}`
        : "Loading...",
      accent: "bg-emerald-50 text-emerald-600",
      iconBg: "bg-emerald-100",
    },
    {
      icon: Timer,
      label: "Booking Duration",
      value: "1 Hour",
      accent: "bg-violet-50 text-violet-600",
      iconBg: "bg-violet-100",
    },
    {
      icon: Ban,
      label: "Recurring Closed Days",
      value: schedule?.closed_weekdays.length
        ? schedule.closed_weekdays
          .map((weekday) => DAYS[weekday - 1]?.label)
          .filter(Boolean)
          .join(", ")
        : "None",
      accent: "bg-red-50 text-red-500",
      iconBg: "bg-red-100",
    },
    ...(schedule
      ? schedule.custom_open_times.map((customTime) => ({
        icon: Clock,
        label: "Custom Time",
        value: formatScheduleTime(customTime),
        accent: "bg-amber-50 text-amber-600",
        iconBg: "bg-amber-100",
      }))
      : [{
        icon: Clock,
        label: "Custom Time",
        value: "Loading...",
        accent: "bg-amber-50 text-amber-600",
        iconBg: "bg-amber-100",
      }]),
  ];

  const fetchScheduleData = useCallback(async () => {
    try {
      const [scheduleData, openSlotData, barberData] = await Promise.all([
        getBookingSchedule(),
        getScheduleOpenSlots(),
        getBarbers(),
      ]);
      setSchedule(scheduleData);
      setScheduleDraft(toScheduleDraft(scheduleData));
      setOpenSlots(openSlotData);
      setBarbers(barberData.filter((barber) => barber.is_active !== false));
    } catch (error) {
      console.error("Error fetching schedule configuration:", error);
      toast.error("Could not load schedule configuration.");
    }
  }, []);

  const fetchClosedDates = useCallback(async () => {
    try {
      setLoading(true);

      const response = await getClosedDates(1, 100, "all");

      if (!response || !response.data) {
        console.error("Invalid response structure:", response);
        setClosedDates([]);
        return;
      }

      setClosedDates(response.data);
    } catch (error) {
      console.error("Error fetching closed dates:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchActivityLogs = useCallback(async (page: number = 1) => {
    try {
      setActivityLoading(true);

      const activityResponse = await getClosedDateActivities(page, 5);

      if (activityResponse && activityResponse.data) {
        const logs = activityResponse.data.map((activity: ClosedDateActivity) => {
          if (activity.activity_type === "open_slot") {
            const barberSubject = `${activity.barber_name ?? "Barber"}'s open slot`;
            const slotDate = activity.slot_date
              ? formatDisplayDate(activity.slot_date)
              : "an unknown date";
            const slotTime = activity.slot_time
              ? formatScheduleTime(activity.slot_time)
              : "an unknown time";

            return {
              title:
                activity.action === "removed"
                  ? `${barberSubject} was removed`
                  : `${barberSubject} was added`,
              reason: `${activity.reason ?? "Open slot updated"} for ${slotDate} at ${slotTime}`,
              actor: activity.actor_name ?? "",
              actorLabel: activity.action === "removed" ? "Closed by" : "Opened by",
              time: new Date(activity.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              }),
            };
          }

          const formattedDate = activity.date_closed
            ? new Date(activity.date_closed).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })
            : "Unknown date";
          const subject =
            activity.closure_scope === "barber"
              ? `${activity.barber_name ?? "Barber"}'s schedule`
              : "The shop";

          const title =
            activity.action === "reopened"
              ? `${subject} was reopened`
              : `${subject} was closed`;

          return {
            title,
            reason: activity.reason ?? "",
            actor: activity.actor_name ?? "",
            actorLabel: activity.action === "reopened" ? "Opened by" : "Closed by",
            time: formattedDate,
          };
        });

        setActivityLogs(logs);
        setActivityCurrentPage(activityResponse.current_page || 1);
        setActivityTotalPages(activityResponse.last_page || 1);
      }
    } catch (error) {
      console.error("Error fetching activity logs:", error);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    await Promise.all([
      fetchClosedDates(),
      fetchActivityLogs(activityCurrentPage),
      fetchScheduleData(),
    ]);
  }, [activityCurrentPage, fetchActivityLogs, fetchClosedDates, fetchScheduleData]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const openClosedDateModal = () => {
    setShowClosedDateModal(true);
  };

  const closeClosedDateModal = () => {
    setShowClosedDateModal(false);
  };

  const handleClosedDateSubmit = async (data: ClosedDateSchemaFormValues) => {
    try {
      await createClosedDate({
        date_closed: formatDateToLocal(data.date_closed!),
        closure_scope: data.closure_scope,
        barber_user_id: data.barber_user_id ?? undefined,
        reason: data.reason,
      });
      await fetchAllData();
      closeClosedDateModal();

      const formattedDate = data.date_closed!.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      toast.success(
        data.closure_scope === "barber"
          ? `Barber day off added for ${formattedDate}`
          : `Closed date added for ${formattedDate}`,
      );
    } catch (error) {
      console.error("Error creating closed date:", error);
      toast.error(error instanceof Error ? error.message : "Could not add closed date. Please try again.");
    }
  };

  const handleRemoveClosedDate = async () => {
    if (!closedDateToReopen || isReopening) return;

    const { id, date_closed: dateClosed } = closedDateToReopen;
    setIsReopening(true);
    try {
      await updateClosedDate(id, { is_removed: true });
      await fetchAllData();

      const date = new Date(dateClosed);
      const formattedDate = date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      toast.success(`${formattedDate} has been reopened successfully`);
      setClosedDateToReopen(null);
    } catch (error) {
      console.error("Error removing closed date:", error);
      toast.error(error instanceof Error ? error.message : "Could not reopen date. Please try again.");
    } finally {
      setIsReopening(false);
    }
  };

  const handleScheduleSave = async () => {
    if (!canConfigureOperation) {
      toast.error("Only managers can configure the operation schedule.");
      return;
    }

    const validation = bookingScheduleSchema.safeParse(scheduleDraft);
    if (!validation.success) {
      toast.error(validation.error.issues[0]?.message ?? "Check the schedule configuration.");
      return;
    }

    setIsSavingSchedule(true);
    try {
      const updated = await updateBookingSchedule(validation.data);
      setSchedule(updated);
      setScheduleDraft(toScheduleDraft(updated));
      setShowScheduleModal(false);
      toast.success("Schedule configuration updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update schedule configuration.");
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleOpenSlotSave = async () => {
    const slotDate = openSlotDate ? formatDateToLocal(openSlotDate) : "";
    const candidate = {
      slot_date: slotDate,
      barber_user_ids: openSlotBarbers,
      hour: openSlotHour,
      minute: openSlotMinute,
      period: openSlotPeriod,
    };
    const validation = scheduleOpenSlotSchema.safeParse(candidate);
    if (!validation.success) {
      toast.error("Select a date and at least one barber.");
      return;
    }

    const hour24 = openSlotHour % 12 + (openSlotPeriod === "PM" ? 12 : 0);
    const scheduledAt = new Date(
      `${slotDate}T${String(hour24).padStart(2, "0")}:${String(openSlotMinute).padStart(2, "0")}:00+08:00`,
    );
    if (scheduledAt.getTime() <= Date.now()) {
      toast.error("This time has already passed.");
      return;
    }

    setIsSavingOpenSlot(true);
    try {
      await createScheduleOpenSlots(validation.data);
      setOpenSlots(await getScheduleOpenSlots());
      await fetchActivityLogs(1);
      setShowOpenSlotModal(false);
      setOpenSlotDate(undefined);
      setOpenSlotBarbers([]);
      toast.success("Open slot added.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add open slot.");
    } finally {
      setIsSavingOpenSlot(false);
    }
  };

  const handleDeleteOpenSlot = async (id: number) => {
    try {
      await deleteScheduleOpenSlot(id);
      setOpenSlots((current) => current.filter((slot) => slot.id !== id));
      await fetchActivityLogs(1);
      toast.success("Open slot removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove open slot.");
    }
  };

  return (
    <div className="w-full h-full p-4 sm:p-6 pb-12 sm:pb-10 font-sans">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="order-2 bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col lg:order-1">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Schedule Exceptions</p>
              <p className="text-gray-700 text-sm">Close a date or add a custom open slot</p>
            </div>
            <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-2">
              <button
                onClick={() => setShowOpenSlotModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                Open Slot
              </button>
              <button
                onClick={openClosedDateModal}
                className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                Close Date
              </button>
            </div>
          </div>
          <div className="mb-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Custom Slots and Closed Dates
            </p>
            <div className="space-y-2">
              {loading ? (
                <p className="text-gray-500 text-sm">Loading...</p>
              ) : scheduleExceptions.length === 0 ? (
                <p className="text-sm text-gray-500">No custom slots or closed dates found</p>
              ) : (
                paginatedExceptions.map((exception) => {
                  if (exception.kind === "open_slot") {
                    const { slot } = exception;

                    return (
                      <div
                        key={`open-slot-${slot.id}`}
                        className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800">
                            {formatDisplayDate(slot.slot_date)} at {formatScheduleTime(slot.slot_time)}
                          </p>
                          <p className="truncate text-xs text-gray-500">{slot.barber_name}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteOpenSlot(slot.id)}
                          className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
                          aria-label={`Remove open slot for ${slot.barber_name}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    );
                  }

                  const { date } = exception;
                  const formattedDate = new Date(date.date_closed).toLocaleDateString(
                    "en-US",
                    {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    },
                  );

                  return (
                    <div
                      key={`closed-date-${date.id}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 p-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Calendar size={16} className="text-red-500" />
                        <div className="min-w-0">
                          <p className="text-sm text-gray-700">{formattedDate}</p>
                          <p className="truncate text-xs text-gray-500">
                            {date.closure_scope === "barber"
                              ? date.barber_name
                              : "Whole shop"}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setClosedDateToReopen(date)}
                        disabled={isReopening}
                        className="rounded p-1 text-red-600 hover:bg-red-100 hover:text-red-700"
                        aria-label={`Reopen ${formattedDate}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {exceptionsTotalPages > 1 && (
            <div className="flex justify-between items-center mt-4">
              <button
                onClick={() => setExceptionsPage((page) => Math.max(1, page - 1))}
                disabled={exceptionsPage === 1}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {exceptionsPage} of {exceptionsTotalPages}
              </span>
              <button
                onClick={() => setExceptionsPage((page) => Math.min(exceptionsTotalPages, page + 1))}
                disabled={exceptionsPage === exceptionsTotalPages}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded"
              >
                Next
              </button>
            </div>
          )}

        </div>

        <div className="order-1 flex flex-col rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5 lg:order-2">
          <div className="mb-3 flex items-start justify-between gap-3 sm:mb-5">
            <div>
              <p className="text-sm font-semibold text-gray-900 sm:text-base">Operation Configuration</p>
              <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">
                Current operating schedule for bookings
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowScheduleModal(true)}
              disabled={!canConfigureOperation}
              title={canConfigureOperation ? undefined : "Only managers can configure the operation schedule."}
              className="hidden md:inline-flex"
            >
              <Settings className="size-4" />
              {canConfigureOperation ? "Configure" : "Manager only"}
            </Button>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-2 sm:gap-3">
            {scheduleInfo.map(
              ({ icon: Icon, label, value, accent, iconBg }) => (
                <div
                  key={`${label}-${value}`}
                  className="flex items-center gap-2 rounded-lg border border-gray-100 bg-slate-50 px-2.5 py-2.5 transition-colors hover:bg-slate-100 sm:gap-3 sm:rounded-xl sm:px-4 sm:py-3.5"
                >
                  <div className={cn(iconBg, "shrink-0 rounded-md p-1.5 sm:rounded-lg sm:p-2")}>
                    <Icon
                      className={cn("size-3.5 sm:size-4", accent.split(" ")[1])}
                      strokeWidth={2}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="mb-0.5 text-[9px] font-medium uppercase leading-tight tracking-wide text-gray-400 sm:mb-1 sm:text-xs sm:leading-none">
                      {label}
                    </p>
                    <p className="break-words text-xs font-semibold text-gray-800 sm:text-sm">
                      {value}
                    </p>
                  </div>
                </div>
              ),
            )}
          </div>

          <div className="mt-3 flex items-center justify-end border-t border-gray-100 pt-3 sm:mt-4 sm:justify-between sm:pt-4">
            <p className="hidden text-xs text-gray-400 sm:block">Last updated today</p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600 sm:px-2.5 sm:py-1 sm:text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active Schedule
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
        <p className="font-semibold">Activity Log</p>
        <p className="text-gray-700 mb-6">
          Recent changes to booking slots
        </p>
        <div className="space-y-3 overflow-y-auto">
          {activityLoading ? (
            <p className="text-gray-500 text-sm">Loading activity logs...</p>
          ) : activityLogs.length === 0 ? (
            <p className="text-gray-500 text-sm">No activity logs found</p>
          ) : (
            activityLogs.map((log, index) => (
              <ActivityLog
                key={`${log.title}-${index}`}
                title={log.title}
                reason={log.reason}
                actor={log.actor}
                actorLabel={log.actorLabel}
                time={log.time}
              />
            ))
          )}
        </div>

        {activityTotalPages > 1 && (
          <div className="flex justify-between items-center mt-4">
            <button
              onClick={() => fetchActivityLogs(activityCurrentPage - 1)}
              disabled={activityCurrentPage === 1}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {activityCurrentPage} of {activityTotalPages}
            </span>
            <button
              onClick={() => fetchActivityLogs(activityCurrentPage + 1)}
              disabled={activityCurrentPage === activityTotalPages}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <ClosedDateForm
        open={showClosedDateModal}
        onClose={closeClosedDateModal}
        onSubmit={handleClosedDateSubmit}
      />

      <Dialog
        open={canConfigureOperation && showScheduleModal}
        onOpenChange={(open) => !isSavingSchedule && canConfigureOperation && setShowScheduleModal(open)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Schedule Configuration</DialogTitle>
            <DialogDescription>
              These settings apply to the whole operation from today forward.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectWithLabel
              id="open-day-from"
              label="First Open Day"
              value={String(scheduleDraft.open_day_from)}
              options={DAYS.map((day) => ({ value: String(day.value), label: day.label }))}
              onValueChange={(value) => {
                const from = Number(value);
                setScheduleDraft((current) => ({
                  ...current,
                  open_day_from: from,
                  open_day_to: Math.max(current.open_day_to, from),
                  closed_weekdays: current.closed_weekdays.filter((weekday) => weekday >= from),
                }));
              }}
            />
            <SelectWithLabel
              id="open-day-to"
              label="Last Open Day"
              value={String(scheduleDraft.open_day_to)}
              options={DAYS.map((day) => ({
                value: String(day.value),
                label: day.label,
                disabled: day.value < scheduleDraft.open_day_from,
              }))}
              onValueChange={(value) => {
                const to = Number(value);
                setScheduleDraft((current) => ({
                  ...current,
                  open_day_to: to,
                  closed_weekdays: current.closed_weekdays.filter((weekday) => weekday <= to),
                }));
              }}
            />
            <SelectWithLabel
              id="opening-time"
              label="Opening Time"
              value={scheduleDraft.opening_time}
              options={HOURS}
              onValueChange={(value) => setScheduleDraft((current) => ({
                ...current,
                opening_time: value,
                closing_time: current.closing_time < value ? value : current.closing_time,
                custom_open_times: current.custom_open_times.map((time) => clampTime(
                  time,
                  value,
                  current.closing_time < value ? value : current.closing_time,
                )),
              }))}
            />
            <SelectWithLabel
              id="closing-time"
              label="Closing Time"
              value={scheduleDraft.closing_time}
              options={HOURS.map((hour) => ({
                ...hour,
                disabled: hour.value < scheduleDraft.opening_time,
              }))}
              onValueChange={(value) => setScheduleDraft((current) => ({
                ...current,
                closing_time: value,
                custom_open_times: current.custom_open_times.map((time) => clampTime(
                  time,
                  current.opening_time,
                  value,
                )),
              }))}
            />
            <div className="sm:col-span-2">
              <SelectWithLabel
                id="booking-days-ahead"
                label="Customer Booking Window"
                value={String(scheduleDraft.booking_days_ahead)}
                options={BOOKING_WINDOW_OPTIONS}
                onValueChange={(value) => setScheduleDraft((current) => ({
                  ...current,
                  booking_days_ahead: Number(value),
                }))}
              />
            </div>
            <fieldset className="space-y-3 sm:col-span-2">
              <div>
                <Label>Recurring Closed Days</Label>
                <p className="mt-1 text-xs text-gray-500">
                  Select one or more days to close every week.
                </p>
              </div>
              <div className="space-y-3">
                {recurringClosedDays.map((closedWeekday, index) => (
                  <div key={`${closedWeekday ?? "none"}-${index}`} className="space-y-2">
                    {index > 0 && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setScheduleDraft((current) => ({
                            ...current,
                            closed_weekdays: current.closed_weekdays.filter((_, weekdayIndex) => weekdayIndex !== index),
                          }))}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    <SelectWithLabel
                      id={`closed-weekday-${index}`}
                      label={recurringClosedDays.length > 1 ? `Day ${index + 1}` : "Day"}
                      value={closedWeekday === null ? "none" : String(closedWeekday)}
                      options={[
                        ...(index === 0 ? [{ value: "none", label: "None" }] : []),
                        ...DAYS.map((day) => ({
                          value: String(day.value),
                          label: day.label,
                          disabled: day.value < scheduleDraft.open_day_from
                            || day.value > scheduleDraft.open_day_to
                            || (day.value !== closedWeekday && scheduleDraft.closed_weekdays.includes(day.value)),
                        })),
                      ]}
                      onValueChange={(value) => setScheduleDraft((current) => ({
                        ...current,
                        closed_weekdays: value === "none"
                          ? []
                          : (current.closed_weekdays.length === 0
                              ? [Number(value)]
                              : current.closed_weekdays.map((weekday, weekdayIndex) => (
                                weekdayIndex === index ? Number(value) : weekday
                              )))
                            .sort((left, right) => left - right),
                      }))}
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setScheduleDraft(addClosedWeekday)}
                disabled={scheduleDraft.closed_weekdays.length >= (
                  scheduleDraft.open_day_to - scheduleDraft.open_day_from + 1
                )}
                className="text-sm font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                + Add another closed day
              </button>
            </fieldset>
            <div className="space-y-3 sm:col-span-2">
              <div>
                <Label>Recurring Custom Times</Label>
                <p className="mt-1 text-xs text-gray-500">
                  Added to every open day for all barbers.
                </p>
              </div>
              <div className="space-y-3">
                {customTimes.map((customTime, index) => (
                  <div key={`${scheduleDraft.custom_open_times[index]}-${index}`} className="space-y-2">
                    {index > 0 && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setScheduleDraft((current) => ({
                            ...current,
                            custom_open_times: current.custom_open_times.filter((_, timeIndex) => timeIndex !== index),
                          }))}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-3">
                      <SelectWithLabel
                        id={`custom-open-hour-${index}`}
                        label="Hour"
                        value={String(customTime.hour)}
                        options={TWELVE_HOUR_OPTIONS}
                        onValueChange={(value) => setScheduleDraft((current) => withCustomOpenTime(current, index, {
                          hour: Number(value),
                        }))}
                      />
                      <SelectWithLabel
                        id={`custom-open-minute-${index}`}
                        label="Minute"
                        value={String(customTime.minute)}
                        options={MINUTE_OPTIONS}
                        onValueChange={(value) => setScheduleDraft((current) => withCustomOpenTime(current, index, {
                          minute: Number(value),
                        }))}
                      />
                      <SelectWithLabel
                        id={`custom-open-period-${index}`}
                        label="AM / PM"
                        value={customTime.period}
                        options={[{ value: "AM", label: "AM" }, { value: "PM", label: "PM" }]}
                        onValueChange={(value) => setScheduleDraft((current) => withCustomOpenTime(current, index, {
                          period: value as "AM" | "PM",
                        }))}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setScheduleDraft(addCustomOpenTime)}
                disabled={scheduleDraft.custom_open_times.length >= 24}
                className="text-sm font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                + Add another custom time
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowScheduleModal(false)} disabled={isSavingSchedule}>Cancel</Button>
            <Button type="button" onClick={() => void handleScheduleSave()} disabled={isSavingSchedule}>
              {isSavingSchedule ? "Saving..." : "Save Configuration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showOpenSlotModal} onOpenChange={(open) => !isSavingOpenSlot && setShowOpenSlotModal(open)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Open Slot</DialogTitle>
            <DialogDescription>
              Add one custom time for every selected barber on this date.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <DatePickerWithLabel
                id="open-slot-date"
                label="Date"
                placeholder="Select date"
                date={openSlotDate}
                disablePastDates
                disableSundays={false}
                onDateChange={setOpenSlotDate}
              />
            </div>
            <div className="grid gap-2">
              <Label>Barbers</Label>
              <div className="grid max-h-44 gap-2 overflow-y-auto rounded-md border border-gray-200 p-3 sm:grid-cols-2">
                {barbers.map((barber) => (
                  <label key={barber.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <Checkbox
                      checked={openSlotBarbers.includes(barber.id)}
                      onCheckedChange={(checked) => setOpenSlotBarbers((current) => checked
                        ? [...current, barber.id]
                        : current.filter((id) => id !== barber.id))}
                    />
                    <span>{barber.fullname}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <SelectWithLabel
                id="open-slot-hour"
                label="Hour"
                value={String(openSlotHour)}
                options={Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }))}
                onValueChange={(value) => setOpenSlotHour(Number(value))}
              />
              <SelectWithLabel
                id="open-slot-minute"
                label="Minute"
                value={String(openSlotMinute)}
                options={MINUTE_OPTIONS}
                onValueChange={(value) => setOpenSlotMinute(Number(value))}
              />
              <SelectWithLabel
                id="open-slot-period"
                label="AM / PM"
                value={openSlotPeriod}
                options={[{ value: "AM", label: "AM" }, { value: "PM", label: "PM" }]}
                onValueChange={(value) => setOpenSlotPeriod(value as "AM" | "PM")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowOpenSlotModal(false)} disabled={isSavingOpenSlot}>Cancel</Button>
            <Button type="button" onClick={() => void handleOpenSlotSave()} disabled={isSavingOpenSlot}>
              {isSavingOpenSlot ? "Adding..." : "Add Open Slot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={closedDateToReopen !== null}
        onOpenChange={(open) => {
          if (!open && !isReopening) setClosedDateToReopen(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              Reopen Closed Date
            </DialogTitle>
            <DialogDescription>
              Reopening this schedule makes it available for new bookings.
              Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setClosedDateToReopen(null)}
              disabled={isReopening}
            >
              Keep Closed
            </Button>
            <Button
              type="button"
              onClick={handleRemoveClosedDate}
              disabled={isReopening}
            >
              {isReopening ? "Reopening..." : "Reopen Date"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatScheduleTime(value: string): string {
  return new Date(`1970-01-01T${value.slice(0, 5)}:00`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDisplayDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toScheduleDraft(schedule: BookingSchedule): UpdateBookingScheduleData {
  return {
    open_day_from: schedule.open_day_from,
    open_day_to: schedule.open_day_to,
    closed_weekdays: schedule.closed_weekdays,
    opening_time: schedule.opening_time,
    closing_time: schedule.closing_time,
    custom_open_times: schedule.custom_open_times,
    booking_days_ahead: schedule.booking_days_ahead,
  };
}
