"use client";

import {
  addDays,
  addWeeks,
  format,
  isSameMonth,
  isSameYear,
  parseISO,
  startOfWeek,
} from "date-fns";
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Mail,
  MoreVertical,
  Phone,
  Plus,
  Star,
  StickyNote,
  User,
  UserX,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AppointmentStatusBadge } from "@/components/common/AppointmentStatusBadge";
import { AppointmentAddOnDialog } from "@/components/common/AppointmentAddOnDialog";
import { CancellationForm } from "@/forms/CancellationForm";
import { RescheduleForm, type RescheduleSubmitData } from "@/forms/RescheduleForm";
import { StatCard } from "@/components/common/StatCard";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useRealtimeEvent } from "@/contexts/RealtimeContext";
import { formatBookingId } from "@/lib/booking";
import { sanitizeString, sanitizeText } from "@/lib/sanitizer";
import { formatTime12 } from "@/lib/time-slots";
import { cn } from "@/lib/utils";
import { getClosedDates } from "@/services/manager/close.date.api";
import { getWeeklySchedule } from "@/services/manager/overview.api";
import {
  getAppointments,
  updateAppointment,
  updateBatchAppointmentStatus,
  type Appointment,
} from "@/services/shared/appointment.api";
import { updateAppointmentSchema } from "@/validations/appointment.validation";
import type { CancellationReasonSchemaFormValues } from "@/validations/appointment.validation";
import { toast } from "sonner";

import type {
  SlotAppointment,
  TimeSlot,
  WeeklyAvailabilityDay,
  WeeklySchedule,
} from "@/services/manager/overview.api";

function formatDateToLocal(date: Date): string {
  return (
    date.getFullYear() +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0")
  );
}

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDate(date: string | null): string {
  if (!date) return "—";
  return formatDisplayDate(parseISO(date));
}

function formatWeekRange(startDate: string, endDate: string): string {
  const start = parseISO(startDate);
  const end = parseISO(endDate);

  if (!isSameYear(start, end)) {
    return `${format(start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}`;
  }

  if (!isSameMonth(start, end)) {
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  }

  return `${format(start, "MMM d")} – ${format(end, "d, yyyy")}`;
}

function formatCompactWeekRange(startDate: string, endDate: string): string {
  const start = parseISO(startDate);
  const end = parseISO(endDate);

  if (!isSameYear(start, end)) {
    return `${format(start, "MMM d, yyyy")}–${format(end, "MMM d, yyyy")}`;
  }

  if (!isSameMonth(start, end)) {
    return `${format(start, "MMM d")}–${format(end, "MMM d, yyyy")}`;
  }

  return `${format(start, "MMM d")}–${format(end, "d, yyyy")}`;
}

function findNextSelectableDate(date: Date, closedDates: Set<string>): Date {
  let candidate = new Date(date);
  candidate.setHours(0, 0, 0, 0);

  while (closedDates.has(formatDateToLocal(candidate))) {
    candidate = addDays(candidate, 1);
  }

  return candidate;
}

function getInitialSelectedDate(): Date {
  return findNextSelectableDate(new Date(), new Set<string>());
}

function getWeekStartKey(date: Date): string {
  return formatDateToLocal(startOfWeek(date, { weekStartsOn: 1 }));
}

function normalizeAppointmentTime(time: string): string {
  return time.slice(0, 5);
}

function buildDashboardAppointmentUpdate(
  appointment: Appointment,
  status: "confirmed" | "rejected" | "cancelled" | "completed" | "no_show",
  cancellationReason?: string | null,
) {
  const payload = {
    booking_customer_id: appointment.customer.id ?? 0,
    service_id: appointment.service.id ?? 0,
    barber_user_id: appointment.barber.id ?? 0,
    appointment_date: appointment.appointment_date,
    appointment_time: normalizeAppointmentTime(appointment.appointment_time),
    duration_minutes: appointment.duration_minutes,
    price: Number(appointment.price),
    status,
    notes: appointment.notes,
    cancellation_reason: cancellationReason ?? null,
  };
  const validation = updateAppointmentSchema.safeParse(payload);

  if (!validation.success) {
    throw new Error(
      validation.error.issues[0]?.message ?? "This booking cannot be updated.",
    );
  }

  return payload;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "completed":
      return "bg-green-100 border-green-200";
    case "confirmed":
      return "bg-blue-100 border-blue-200";
    case "pending":
      return "bg-yellow-100 border-yellow-200";
    case "no_show":
      return "bg-gray-200 border-gray-300";
    default:
      return "bg-white border-gray-200";
  }
}

function getDayAvailabilityLabel(
  day: WeeklyAvailabilityDay,
  activeBarbers: number,
): string {
  if (day.is_closed) return "Closed";
  if (day.is_past) return "Past";
  if (activeBarbers === 0) return "No active barbers";
  if (day.is_fully_booked) return "Fully Booked";
  return `${day.available_slots} of ${day.total_slots} available`;
}

function getCompactDayAvailabilityLabel(
  day: WeeklyAvailabilityDay,
  activeBarbers: number,
): [string, string] {
  if (day.is_closed) return ["", "Closed"];
  if (day.is_past) return ["", "Past"];
  if (activeBarbers === 0) return ["No", "Barber"];
  if (day.is_fully_booked) return ["Fully", "Booked"];
  return [day.available_slots.toString(), "Available"];
}

function getSlotAvailabilityLabel(
  slot: TimeSlot,
  compact = false,
): string {
  if (slot.is_closed) return "Closed";
  if (slot.is_past) {
    if (slot.appointments.length === 0) return "Unbooked";

    const statuses = Array.from(
      new Set(slot.appointments.map((appointment) => appointment.status)),
    );

    return statuses
      .map((status) =>
        status
          .replace("_", " ")
          .replace(/^\w/, (character) => character.toUpperCase()),
      )
      .join(" / ");
  }
  if (slot.total_barbers === 0) return "No active barbers";
  if (slot.is_fully_booked) return "Fully Booked";
  return compact
    ? `${slot.available_barbers}/${slot.total_barbers} free`
    : `${slot.available_barbers} of ${slot.total_barbers} barbers available`;
}

function AppointmentDetailModal({
  slot,
  open,
  onClose,
  onConfirm,
  onReject,
  onStatusChange,
  onCancel,
  onReschedule,
  onAddOn,
  actionDisabled = false,
}: {
  slot: TimeSlot | null;
  open: boolean;
  onClose: () => void;
  onConfirm?: (appointment: SlotAppointment) => void;
  onReject?: (appointment: SlotAppointment) => void;
  onStatusChange?: (
    appointment: SlotAppointment,
    status: "completed" | "no_show",
  ) => void;
  onCancel?: (appointment: SlotAppointment) => void;
  onReschedule?: (appointment: SlotAppointment) => void;
  onAddOn?: (appointment: SlotAppointment) => void;
  actionDisabled?: boolean;
}) {
  if (!slot) return null;
  const { appointments } = slot;
  const isMulti = appointments.length > 1;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
            {slot.time}
            {isMulti && (
              <span className="ml-1 text-sm font-normal text-gray-400">
                ({appointments.length} bookings)
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {appointments.map((appointment, index) => (
          <div key={appointment.id}>
            {index > 0 && <div className="my-3 border-t border-gray-100" />}
            <div className="relative space-y-3 pb-10">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900">
                  {formatBookingId(appointment.id)}
                </span>
                <DashboardAppointmentActionMenu
                  appointment={appointment}
                  onConfirm={onConfirm ? (selectedAppointment) => {
                    onClose();
                    onConfirm(selectedAppointment);
                  } : undefined}
                  onReject={onReject ? (selectedAppointment) => {
                    onClose();
                    onReject(selectedAppointment);
                  } : undefined}
                  onStatusChange={onStatusChange ? (selectedAppointment, status) => {
                    onClose();
                    onStatusChange(selectedAppointment, status);
                  } : undefined}
                  onCancel={onCancel ? (selectedAppointment) => {
                    onClose();
                    onCancel(selectedAppointment);
                  } : undefined}
                  onReschedule={onReschedule ? (selectedAppointment) => {
                    onClose();
                    onReschedule(selectedAppointment);
                  } : undefined}
                  onAddOn={onAddOn ? (selectedAppointment) => {
                    onClose();
                    onAddOn(selectedAppointment);
                  } : undefined}
                  disabled={actionDisabled}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 shrink-0 text-gray-400" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">Customer</p>
                    <p className="truncate text-sm font-medium text-gray-900">
                      {sanitizeString(appointment.customer || "—")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">Contact</p>
                    <p className="truncate text-sm text-gray-900">
                      {sanitizeString(appointment.customer_contact || "—")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 shrink-0 text-gray-400" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="truncate text-sm text-gray-900">
                      {sanitizeString(appointment.customer_email || "—")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Barber</p>
                  <p className="truncate text-sm font-medium text-gray-900">
                    {sanitizeString(appointment.barber || "—")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Service</p>
                  <p className="truncate text-sm font-medium text-gray-900">
                    {sanitizeString(appointment.service || "—")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Date</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatDate(appointment.appointment_date)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Time</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatTime12(appointment.appointment_time)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Price</p>
                  <p className="text-sm font-medium text-gray-900">
                    {appointment.price != null
                      ? `₱${appointment.price.toLocaleString()}`
                      : "—"}
                  </p>
                </div>
              </div>

              {appointment.notes && (
                <div className="flex items-start gap-3">
                  <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">Notes</p>
                    <p className="break-words text-sm text-gray-900">
                      {sanitizeText(appointment.notes)}
                    </p>
                  </div>
                </div>
              )}
              <div className="absolute bottom-0 right-0">
                <AppointmentStatusBadge status={appointment.status} />
              </div>
            </div>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}

function WeeklyAvailabilityCard({
  day,
  activeBarbers,
  selected,
  onSelect,
}: {
  day: WeeklyAvailabilityDay;
  activeBarbers: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const label = getDayAvailabilityLabel(day, activeBarbers);
  const [compactValue, compactLabel] = getCompactDayAvailabilityLabel(
    day,
    activeBarbers,
  );

  return (
    <button
      type="button"
      disabled={day.is_closed}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${day.day}, ${day.date}: ${label}`}
      className={cn(
        "relative flex min-h-22 min-w-0 flex-col items-center justify-center rounded-lg border bg-white px-0.5 py-2 text-center transition-all focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-28 sm:rounded-xl sm:px-2 sm:py-3 lg:min-h-32 lg:px-3 lg:py-4",
        !day.is_closed &&
          "cursor-pointer hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-sm",
        day.is_today && !selected && "border-blue-300 bg-blue-50/50",
        selected &&
          "border-accent bg-accent/5 shadow-sm ring-2 ring-accent/20",
        day.is_closed &&
          "cursor-not-allowed border-dashed border-gray-200 bg-gray-100 text-gray-400 opacity-70",
      )}
    >
      {day.is_today && (
        <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-blue-500 sm:top-2 sm:right-2 sm:h-2 sm:w-2" />
      )}
      <span className="text-[8px] font-semibold tracking-wide text-gray-500 sm:text-[10px] lg:text-xs lg:tracking-wider">
        {day.day}
      </span>
      <span
        className={cn(
          "mt-0.5 text-lg leading-none font-bold text-gray-900 sm:mt-1 sm:text-xl lg:text-2xl",
          day.is_closed && "text-gray-400",
        )}
      >
        {day.day_number}
      </span>
      <span
        className={cn(
          "mt-1 text-[8px] leading-[1.05] font-medium text-gray-500 sm:text-[10px] lg:text-[11px]",
          day.is_fully_booked && "text-red-600",
          day.is_closed && "text-gray-400",
        )}
      >
        <span className="lg:hidden">
          {compactValue && <span className="block">{compactValue}</span>}
          <span className="block">{compactLabel}</span>
        </span>
        <span className="hidden lg:block">
          {day.is_closed ||
          day.is_past ||
          activeBarbers === 0 ||
          day.is_fully_booked ? (
            label
          ) : (
            <>
              {day.available_slots} of {day.total_slots}
              <span className="block">available</span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}

function DashboardAppointmentActionMenu({
  appointment,
  onConfirm,
  onReject,
  onStatusChange,
  onCancel,
  onReschedule,
  onAddOn,
  disabled = false,
}: {
  appointment: SlotAppointment;
  onConfirm?: (appointment: SlotAppointment) => void;
  onReject?: (appointment: SlotAppointment) => void;
  onStatusChange?: (
    appointment: SlotAppointment,
    status: "completed" | "no_show",
  ) => void;
  onCancel?: (appointment: SlotAppointment) => void;
  onReschedule?: (appointment: SlotAppointment) => void;
  onAddOn?: (appointment: SlotAppointment) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isPending = appointment.status === "pending";
  const isConfirmed = appointment.status === "confirmed";
  const statusActionDisabled =
    isConfirmed &&
    appointment.appointment_date.split("T")[0] > formatDateToLocal(new Date());

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative z-20" ref={ref}>
      <button
        type="button"
        aria-label={`Actions for ${formatBookingId(appointment.id)}`}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white/70 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 w-44 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
          {isPending && onConfirm && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onConfirm(appointment);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-green-700 transition hover:bg-green-50"
            >
              <Check className="h-4 w-4" />
              Confirm
            </button>
          )}
          {isPending && onReject && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onReject(appointment);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-700 transition hover:bg-red-50"
            >
              <X className="h-4 w-4" />
              Reject
            </button>
          )}
          {isConfirmed && (
            <>
              {onAddOn && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onAddOn(appointment);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                >
                  <Plus className="h-4 w-4 text-red-500" />
                  Add-on
                </button>
              )}
              {onStatusChange && (
                <>
              <button
                type="button"
                disabled={statusActionDisabled}
                title={
                  statusActionDisabled
                    ? "This action is available on or after the booking date."
                    : undefined
                }
                onClick={() => {
                  if (statusActionDisabled) return;
                  setOpen(false);
                  onStatusChange(appointment, "completed");
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                  statusActionDisabled
                    ? "cursor-not-allowed text-gray-400"
                    : "text-gray-700 transition hover:bg-gray-50",
                )}
              >
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Completed
              </button>
              <button
                type="button"
                disabled={statusActionDisabled}
                title={
                  statusActionDisabled
                    ? "This action is available on or after the booking date."
                    : undefined
                }
                onClick={() => {
                  if (statusActionDisabled) return;
                  setOpen(false);
                  onStatusChange(appointment, "no_show");
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                  statusActionDisabled
                    ? "cursor-not-allowed text-gray-400"
                    : "text-gray-700 transition hover:bg-gray-50",
                )}
              >
                <UserX className="h-4 w-4 text-red-400" />
                No-show
              </button>
                </>
              )}
              {onReschedule && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onReschedule(appointment);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                >
                  <CalendarDays className="h-4 w-4 text-blue-500" />
                  Re-schedule
                </button>
              )}
              {onCancel && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onCancel(appointment);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                >
                  <X className="h-4 w-4 text-red-500" />
                  Cancel
                </button>
              )}
            </>
          )}
          {!isPending && !isConfirmed && (
            <p className="px-3 py-2 text-sm text-gray-400">No actions available</p>
          )}
        </div>
      )}
    </div>
  );
}

function SlotStatusBadges({ appointments }: { appointments: SlotAppointment[] }) {
  const statuses = Array.from(
    new Set(appointments.map((appointment) => appointment.status)),
  );
  const statusLabels = statuses.map((status) => status.replace("_", "-"));

  return (
    <div
      className="pointer-events-none absolute top-3 right-3 z-10 flex items-center gap-1"
      aria-label={`Booking status: ${statusLabels.join(", ")}`}
    >
      {statuses.map((status) => (
        <span
          key={status}
          role="img"
          aria-label={status.replace("_", "-")}
          title={status.replace("_", "-")}
          className={cn(
            "size-2.5 rounded-full ring-2 ring-white/70",
            status === "pending" && "bg-yellow-500",
            status === "confirmed" && "bg-blue-500",
            status === "completed" && "bg-green-500",
            status === "cancelled" && "bg-red-500",
            status === "rejected" && "bg-orange-500",
            status === "no_show" && "bg-gray-500",
          )}
        />
      ))}
    </div>
  );
}

function TimeSlotCard({
  slot,
  onClick,
}: {
  slot: TimeSlot;
  onClick: () => void;
}) {
  const count = slot.appointments.length;
  const availabilityLabel = getSlotAvailabilityLabel(slot);
  const compactAvailabilityLabel = getSlotAvailabilityLabel(slot, true);

  if (count === 0) {
    return (
      <div
        className={cn(
          "flex min-h-16 items-center gap-3 rounded-xl border border-gray-200 bg-white p-3",
          slot.is_fully_booked && "border-red-200 bg-red-50",
          (slot.is_past || slot.is_closed) && "bg-gray-50 opacity-70",
        )}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50">
          <Clock className="h-4 w-4 text-gray-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{slot.time}</p>
          <p className="truncate text-xs text-gray-400">
            <span className="lg:hidden">{compactAvailabilityLabel}</span>
            <span className="hidden lg:inline">{availabilityLabel}</span>
          </p>
        </div>
      </div>
    );
  }

  if (count === 1) {
    const appointment = slot.appointments[0];
    return (
      <div
        className={cn(
          "relative min-h-16 w-full rounded-xl border transition-shadow hover:shadow-md",
          getStatusColor(appointment.status),
        )}
      >
        <button
          type="button"
          onClick={onClick}
          className="flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-xl bg-transparent p-3 text-left"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/50">
            <Clock className="h-4 w-4 text-gray-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="shrink-0 text-sm font-semibold text-gray-900">
              {slot.time}
            </p>
            <p className="truncate text-xs text-gray-500">
              <span className="lg:hidden">{compactAvailabilityLabel}</span>
              <span className="hidden lg:inline">{availabilityLabel}</span>
            </p>
          </div>
        </button>
        <SlotStatusBadges appointments={slot.appointments} />
      </div>
    );
  }

  const statuses = new Set(
    slot.appointments.map((appointment) => appointment.status),
  );
  const uniformStatus = statuses.size === 1
    ? slot.appointments[0]?.status
    : null;

  return (
    <div
      className={cn(
        "relative min-h-16 w-full rounded-xl border transition-shadow hover:shadow-md",
        uniformStatus ? getStatusColor(uniformStatus) : "border-purple-200 bg-purple-50",
      )}
    >
      <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-xl bg-transparent p-3 text-left"
      >
        <div className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          uniformStatus ? "bg-white/50" : "bg-purple-100",
        )}>
          <Clock className={cn(
            "h-4 w-4",
            uniformStatus ? "text-gray-600" : "text-purple-600",
          )} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{slot.time}</p>
          <p className="truncate text-xs font-medium text-purple-600">
            {count} bookings
          </p>
          <p className="truncate text-[11px] text-gray-500">
            <span className="lg:hidden">{compactAvailabilityLabel}</span>
            <span className="hidden lg:inline">{availabilityLabel}</span>
          </p>
        </div>
      </button>
      <SlotStatusBadges appointments={slot.appointments} />
    </div>
  );
}

export function Overview() {
  const [selectedDate, setSelectedDate] = useState<Date>(
    getInitialSelectedDate,
  );
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [detailSlot, setDetailSlot] = useState<TimeSlot | null>(null);
  const [dashboardRejectAppointment, setDashboardRejectAppointment] =
    useState<Appointment | null>(null);
  const [dashboardCancellationAppointment, setDashboardCancellationAppointment] =
    useState<Appointment | null>(null);
  const [dashboardRescheduleAppointment, setDashboardRescheduleAppointment] =
    useState<Appointment | null>(null);
  const [dashboardAddOnAppointment, setDashboardAddOnAppointment] =
    useState<Appointment | null>(null);
  const [dashboardActionId, setDashboardActionId] = useState<number | null>(
    null,
  );
  const skipFirstRealtimeRefreshRef = useRef(true);
  const currentWeekKeyRef = useRef(getWeekStartKey(new Date()));
  const selectedDateKey = formatDateToLocal(selectedDate);
  const closedDateSet = useMemo(
    () => new Set(closedDates),
    [closedDates],
  );

  const loadSchedule = useCallback(
    async (signal?: AbortSignal) => {
      setScheduleLoading(true);
      try {
        const nextSchedule = await getWeeklySchedule(selectedDate, signal);
        const selectedDay = nextSchedule.days.find(
          (day) => day.date === nextSchedule.selected_date,
        );

        if (selectedDay?.is_recurring_closed) {
          const nextOpenDay = nextSchedule.days.find(
            (day) =>
              day.date > nextSchedule.selected_date &&
              !day.is_recurring_closed,
          );
          const previousOpenDay = nextSchedule.days.findLast(
            (day) =>
              day.date < nextSchedule.selected_date &&
              !day.is_recurring_closed,
          );
          const openDay = nextOpenDay ?? previousOpenDay;

          if (openDay) {
            setSelectedDate(parseISO(openDay.date));
            return;
          }
        }

        setSchedule(nextSchedule);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Failed to load weekly schedule:", error);
        }
      } finally {
        if (!signal?.aborted) {
          setScheduleLoading(false);
        }
      }
    },
    [selectedDate],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSchedule(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadSchedule]);

  useRealtimeEvent("appointments", async (signal) => {
    if (skipFirstRealtimeRefreshRef.current) {
      skipFirstRealtimeRefreshRef.current = false;
      return;
    }

    await loadSchedule(signal);
  });

  useRealtimeEvent("booking_schedule", loadSchedule);

  const resolveDashboardAppointment = async (
    appointmentId: number,
  ): Promise<Appointment> => {
    const appointments = await getAppointments();
    const appointment = appointments.find((item) => item.id === appointmentId);

    if (!appointment) {
      throw new Error("This booking is no longer available. Refresh and try again.");
    }

    return appointment;
  };

  const handleDashboardConfirm = async (slotAppointment: SlotAppointment) => {
    if (dashboardActionId !== null) return;

    setDashboardActionId(slotAppointment.id);
    try {
      const appointment = await resolveDashboardAppointment(slotAppointment.id);

      if (appointment.batch_id) {
        await updateBatchAppointmentStatus(appointment.batch_id, "confirmed");
        toast.success("Group booking confirmed.");
      } else {
        const payload = buildDashboardAppointmentUpdate(
          appointment,
          "confirmed",
        );
        await updateAppointment(appointment.id, payload);
        toast.success("Booking confirmed.");
      }

      await loadSchedule();
      window.dispatchEvent(new CustomEvent("appointments:updated"));
    } catch (error) {
      console.error("Failed to confirm dashboard booking:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not confirm this booking. Please try again.",
      );
    } finally {
      setDashboardActionId(null);
    }
  };

  const handleDashboardReject = async (slotAppointment: SlotAppointment) => {
    if (dashboardActionId !== null) return;

    setDashboardActionId(slotAppointment.id);
    try {
      const appointment = await resolveDashboardAppointment(slotAppointment.id);
      setDashboardRejectAppointment(appointment);
    } catch (error) {
      console.error("Failed to load dashboard booking:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load this booking. Please try again.",
      );
    } finally {
      setDashboardActionId(null);
    }
  };

  const handleDashboardCancel = async (slotAppointment: SlotAppointment) => {
    if (dashboardActionId !== null) return;

    setDashboardActionId(slotAppointment.id);
    try {
      const appointment = await resolveDashboardAppointment(slotAppointment.id);
      setDashboardCancellationAppointment(appointment);
    } catch (error) {
      console.error("Failed to load dashboard booking:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load this booking. Please try again.",
      );
    } finally {
      setDashboardActionId(null);
    }
  };

  const handleDashboardReschedule = async (slotAppointment: SlotAppointment) => {
    if (dashboardActionId !== null) return;

    setDashboardActionId(slotAppointment.id);
    try {
      const appointment = await resolveDashboardAppointment(slotAppointment.id);
      setDashboardRescheduleAppointment(appointment);
    } catch (error) {
      console.error("Failed to load dashboard booking:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load this booking. Please try again.",
      );
    } finally {
      setDashboardActionId(null);
    }
  };

  const handleDashboardAddOn = async (slotAppointment: SlotAppointment) => {
    if (dashboardActionId !== null) return;

    setDashboardActionId(slotAppointment.id);
    try {
      const appointment = await resolveDashboardAppointment(slotAppointment.id);
      setDashboardAddOnAppointment(appointment);
    } catch (error) {
      console.error("Failed to load dashboard booking:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load this booking. Please try again.",
      );
    } finally {
      setDashboardActionId(null);
    }
  };

  const handleDashboardRejectSubmit = async (
    data: CancellationReasonSchemaFormValues,
  ) => {
    const appointment = dashboardRejectAppointment;
    if (!appointment || dashboardActionId !== null) return;

    setDashboardActionId(appointment.id);
    try {
      const reason = data.cancellation_reason.trim();

      if (appointment.batch_id) {
        await updateBatchAppointmentStatus(
          appointment.batch_id,
          "rejected",
          reason,
        );
        toast.success("Group booking rejected.");
      } else {
        const payload = buildDashboardAppointmentUpdate(
          appointment,
          "rejected",
          reason,
        );
        await updateAppointment(appointment.id, payload);
        toast.success("Booking rejected.");
      }

      setDashboardRejectAppointment(null);
      await loadSchedule();
      window.dispatchEvent(new CustomEvent("appointments:updated"));
    } catch (error) {
      console.error("Failed to reject dashboard booking:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not reject this booking. Please try again.",
      );
    } finally {
      setDashboardActionId(null);
    }
  };

  const handleDashboardCancellationSubmit = async (
    data: CancellationReasonSchemaFormValues,
  ) => {
    const appointment = dashboardCancellationAppointment;
    if (!appointment || dashboardActionId !== null) return;

    setDashboardActionId(appointment.id);
    try {
      const payload = buildDashboardAppointmentUpdate(
        appointment,
        "cancelled",
        data.cancellation_reason.trim(),
      );
      await updateAppointment(appointment.id, payload);
      toast.success("Booking cancelled.");
      setDashboardCancellationAppointment(null);
      await loadSchedule();
      window.dispatchEvent(new CustomEvent("appointments:updated"));
    } catch (error) {
      console.error("Failed to cancel dashboard booking:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not cancel this booking. Please try again.",
      );
    } finally {
      setDashboardActionId(null);
    }
  };

  const handleDashboardRescheduleSubmit = async (
    data: RescheduleSubmitData,
  ) => {
    const appointment = dashboardRescheduleAppointment;
    if (!appointment || dashboardActionId !== null) return;

    setDashboardActionId(appointment.id);
    try {
      const payload = {
        booking_customer_id: appointment.customer.id ?? 0,
        service_id: appointment.service.id ?? 0,
        barber_user_id: data.barber_user_id,
        appointment_date: data.appointment_date,
        appointment_time: data.appointment_time,
        duration_minutes: appointment.duration_minutes,
        price: Number(appointment.price),
        status: "confirmed" as const,
        notes: data.reason,
        cancellation_reason: null,
      };
      const validation = updateAppointmentSchema.safeParse(payload);

      if (!validation.success) {
        throw new Error(
          validation.error.issues[0]?.message ??
            "Please check the reschedule details and try again.",
        );
      }

      await updateAppointment(appointment.id, validation.data);
      toast.success("Booking rescheduled successfully.");
      setDashboardRescheduleAppointment(null);
      await loadSchedule();
      window.dispatchEvent(new CustomEvent("appointments:updated"));
    } catch (error) {
      console.error("Failed to reschedule dashboard booking:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not reschedule this booking. Please try again.",
      );
    } finally {
      setDashboardActionId(null);
    }
  };

  const handleDashboardAddOnUpdated = (updatedAppointment: Appointment) => {
    setDashboardAddOnAppointment(updatedAppointment);
    void loadSchedule();
    window.dispatchEvent(new CustomEvent("appointments:updated"));
  };

  const handleDashboardStatusChange = async (
    slotAppointment: SlotAppointment,
    status: "completed" | "no_show",
  ) => {
    if (dashboardActionId !== null) return;

    setDashboardActionId(slotAppointment.id);
    try {
      const appointment = await resolveDashboardAppointment(slotAppointment.id);
      const payload = buildDashboardAppointmentUpdate(appointment, status);

      await updateAppointment(appointment.id, payload);
      toast.success(
        status === "completed"
          ? "Booking marked as completed."
          : "Booking marked as no-show.",
      );

      await loadSchedule();
      window.dispatchEvent(new CustomEvent("appointments:updated"));
    } catch (error) {
      console.error("Failed to update dashboard booking status:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update this booking. Please try again.",
      );
    } finally {
      setDashboardActionId(null);
    }
  };

  useEffect(() => {
    const loadClosedDates = async () => {
      try {
        const response = await getClosedDates(1, 100);
        const dates = (response.data ?? []).map((item) => item.date_closed);
        const nextClosedDateSet = new Set(dates);
        setClosedDates(dates);
        setSelectedDate((currentDate) =>
          findNextSelectableDate(currentDate, nextClosedDateSet),
        );
      } catch (error) {
        console.error("Failed to load closed dates:", error);
      }
    };

    void loadClosedDates();
  }, []);

  useEffect(() => {
    setDetailSlot(null);
  }, [selectedDateKey]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const syncCurrentWeek = () => {
      const currentWeekKey = getWeekStartKey(new Date());
      const previousWeekKey = currentWeekKeyRef.current;

      if (currentWeekKey !== previousWeekKey) {
        setSelectedDate((currentDate) =>
          getWeekStartKey(currentDate) === previousWeekKey
            ? findNextSelectableDate(new Date(), closedDateSet)
            : currentDate,
        );
        currentWeekKeyRef.current = currentWeekKey;
      }
    };

    const scheduleNextSync = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setDate(nextMidnight.getDate() + 1);
      nextMidnight.setHours(0, 0, 1, 0);
      timeoutId = setTimeout(() => {
        syncCurrentWeek();
        scheduleNextSync();
      }, nextMidnight.getTime() - now.getTime());
    };

    window.addEventListener("focus", syncCurrentWeek);
    scheduleNextSync();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener("focus", syncCurrentWeek);
    };
  }, [closedDateSet]);

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setCalendarOpen(false);
  };

  const handleWeekChange = (direction: -1 | 1) => {
    setSelectedDate((currentDate) =>
      findNextSelectableDate(
        addWeeks(currentDate, direction),
        closedDateSet,
      ),
    );
  };

  const fallbackWeekStart = formatDateToLocal(
    startOfWeek(selectedDate, { weekStartsOn: 1 }),
  );
  const fallbackWeekEnd = formatDateToLocal(
    addDays(parseISO(fallbackWeekStart), 6),
  );
  const activeSchedule =
    schedule?.selected_date === selectedDateKey ? schedule : null;
  const weekRange = formatWeekRange(
    activeSchedule?.week_start ?? fallbackWeekStart,
    activeSchedule?.week_end ?? fallbackWeekEnd,
  );
  const compactWeekRange = formatCompactWeekRange(
    activeSchedule?.week_start ?? fallbackWeekStart,
    activeSchedule?.week_end ?? fallbackWeekEnd,
  );
  const weeklyStats = activeSchedule?.weekly_stats;
  const weeklyStatsLoading = scheduleLoading && !activeSchedule;
  const availabilityDays =
    activeSchedule?.days.filter((day) => !day.is_recurring_closed) ?? [];
  const recurringClosedDateSet = new Set(
    activeSchedule?.days
      .filter((day) => day.is_recurring_closed)
      .map((day) => day.date) ?? [],
  );
  const activeBarberCount = activeSchedule?.active_barbers ?? 0;
  const timeSlots = activeSchedule?.time_slots ?? [];
  const operatingHours = activeSchedule
    ? `${formatTime12(activeSchedule.opening_time)} - ${formatTime12(activeSchedule.closing_time)}`
    : "configured operation hours";
  const timeSlotGridClass = "grid grid-cols-1 gap-3 lg:grid-flow-col lg:grid-cols-3 lg:grid-rows-4";

  return (
    <div className="h-full w-full bg-slate-100 p-4 pb-12 font-sans sm:p-6 sm:pb-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          Dashboard
        </h1>
        <p className="mt-1 text-gray-500">
          Weekly records for {weekRange}.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Completed"
          value={
            weeklyStatsLoading
              ? "..."
              : (weeklyStats?.completed_appointments ?? 0).toString()
          }
          icon={CheckCircle2}
          iconContainerClassName="bg-green-100"
          iconClassName="text-green-500"
        />
        <StatCard
          label="Confirmed"
          value={
            weeklyStatsLoading
              ? "..."
              : (weeklyStats?.confirmed_appointments ?? 0).toString()
          }
          icon={CheckCircle2}
          iconContainerClassName="bg-blue-100"
          iconClassName="text-blue-500"
        />
        <StatCard
          label="Pending"
          value={
            weeklyStatsLoading
              ? "..."
              : (weeklyStats?.pending_appointments ?? 0).toString()
          }
          icon={AlertCircle}
          iconContainerClassName="bg-yellow-100"
          iconClassName="text-yellow-500"
        />
        <StatCard
          label="Avg Rating"
          value={
            weeklyStatsLoading
              ? "..."
              : (weeklyStats?.average_rating ?? 0).toString()
          }
          icon={Star}
          iconContainerClassName="bg-purple-100"
          iconClassName="text-purple-500"
        />
      </div>

      <section className="mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-5">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-1 sm:mb-4 sm:gap-3">
          <div className="flex min-w-0 items-baseline gap-1.5 sm:gap-2">
            <h2 className="shrink-0 text-sm font-bold text-gray-900 sm:text-lg">
              Week Availability
            </h2>
            <span className="min-w-0 truncate text-[9px] font-medium text-gray-500 sm:hidden">
              {compactWeekRange}
            </span>
            <span className="hidden text-sm font-medium text-gray-500 sm:inline">
              {weekRange}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-7 sm:size-9"
                  aria-label={`Select date. Current week is ${weekRange}`}
                >
                  <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-auto max-w-[calc(100vw-2rem)] p-0"
              >
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  defaultMonth={selectedDate}
                  disabled={(day) =>
                    closedDateSet.has(formatDateToLocal(day)) ||
                    recurringClosedDateSet.has(formatDateToLocal(day))
                  }
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-7 sm:size-9"
              onClick={() => handleWeekChange(-1)}
              aria-label="View previous week"
            >
              <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-7 sm:size-9"
              onClick={() => handleWeekChange(1)}
              aria-label="View next week"
            >
              <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </div>

        {scheduleLoading && !activeSchedule ? (
          <div className="grid grid-cols-6 gap-1 sm:gap-2 lg:gap-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="min-h-22 min-w-0 animate-pulse rounded-lg bg-gray-100 sm:min-h-28 sm:rounded-xl lg:min-h-32"
              />
            ))}
          </div>
        ) : (
          <div
            className="grid gap-1 sm:gap-2 lg:gap-3"
            style={{
              gridTemplateColumns: `repeat(${Math.max(availabilityDays.length, 1)}, minmax(0, 1fr))`,
            }}
          >
            {availabilityDays.map((day) => (
              <WeeklyAvailabilityCard
                key={day.date}
                day={day}
                activeBarbers={activeBarberCount}
                selected={day.date === selectedDateKey}
                onSelect={() => setSelectedDate(parseISO(day.date))}
              />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="flex min-w-0 flex-wrap items-baseline gap-x-1 text-lg leading-tight font-bold text-gray-900 sm:text-xl">
          <span className="shrink-0 text-sm font-bold text-gray-900 sm:text-lg">Time Slots for</span>
          <span>{formatDisplayDate(selectedDate)}</span>
        </h2>
        <p className="mb-4 text-xs text-gray-400 sm:text-sm">
          View bookings and barber availability ({operatingHours})
        </p>

        {scheduleLoading && !activeSchedule ? (
          <div className={timeSlotGridClass}>
            {Array.from({ length: 11 }, (_, index) => (
              <div
                key={index}
                className="min-h-16 animate-pulse rounded-xl bg-gray-100"
              />
            ))}
          </div>
        ) : timeSlots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Clock className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">No time slots for this date.</p>
          </div>
        ) : (
          <div className={timeSlotGridClass}>
            {timeSlots.map((slot) => (
              <TimeSlotCard
                key={slot.time}
                slot={slot}
                onClick={() => setDetailSlot(slot)}
              />
            ))}
          </div>
        )}
      </section>

      <div className="h-8" />

      <AppointmentDetailModal
        slot={detailSlot}
        open={detailSlot !== null}
        onClose={() => setDetailSlot(null)}
        onConfirm={handleDashboardConfirm}
        onReject={handleDashboardReject}
        onStatusChange={handleDashboardStatusChange}
        onCancel={handleDashboardCancel}
        onReschedule={handleDashboardReschedule}
        onAddOn={handleDashboardAddOn}
        actionDisabled={dashboardActionId !== null}
      />

      {dashboardRejectAppointment && (
        <CancellationForm
          appointment={dashboardRejectAppointment}
          open={true}
          mode="reject"
          onClose={() => setDashboardRejectAppointment(null)}
          onSubmit={handleDashboardRejectSubmit}
        />
      )}

      {dashboardCancellationAppointment && (
        <CancellationForm
          appointment={dashboardCancellationAppointment}
          open={true}
          mode="cancel"
          onClose={() => setDashboardCancellationAppointment(null)}
          onSubmit={handleDashboardCancellationSubmit}
        />
      )}

      {dashboardRescheduleAppointment && (
        <RescheduleForm
          appointment={dashboardRescheduleAppointment}
          open={true}
          onClose={() => setDashboardRescheduleAppointment(null)}
          onSubmit={handleDashboardRescheduleSubmit}
        />
      )}

      <AppointmentAddOnDialog
        appointment={dashboardAddOnAppointment}
        open={dashboardAddOnAppointment !== null}
        onOpenChange={(open) => {
          if (!open) setDashboardAddOnAppointment(null);
        }}
        onUpdated={handleDashboardAddOnUpdated}
      />
    </div>
  );
}
