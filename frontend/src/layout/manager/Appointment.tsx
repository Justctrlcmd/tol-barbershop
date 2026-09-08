"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtimeEvent } from "@/contexts/RealtimeContext";
import {
  CalendarDays,
  User,
  Mail,
  Phone,
  MoreVertical,
  Check,
  X,
  CheckCircle2,
  UserX,
  Scissors,
  RotateCcw,
  Search,
  Plus,
  CalendarPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GroupPendingCard } from "@/components/common/GroupPendingCard";
import { AppointmentAddOnDialog } from "@/components/common/AppointmentAddOnDialog";
import dynamic from "next/dynamic";
const PendingAppointmentDetailDialog = dynamic(
  () =>
    import("@/components/common/PendingAppointmentDetailDialog").then(
      (mod) => mod.PendingAppointmentDetailDialog
    ),
  { ssr: false }
);
const AssistedBookingForm = dynamic(
  () =>
    import("@/forms/AssistedBookingForm").then(
      (mod) => mod.AssistedBookingForm,
    ),
  { ssr: false },
);
import { SectionCard } from "@/components/common/SectionCard";
import { TextAreaWithLabel } from "@/components/common/TextAreaWithLabel";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAppointments,
  resendBookingEmail,
  updateBatchAppointmentStatus,
  updateAppointment,
  type Appointment,
} from "@/services/shared/appointment.api";
import { updateAppointmentSchema } from "@/validations/appointment.validation";
import { CancellationForm } from "@/forms/CancellationForm";
import { RescheduleForm, type RescheduleSubmitData } from "@/forms/RescheduleForm";
import { type CancellationReasonSchemaFormValues } from "@/validations/appointment.validation";
import { toast } from "sonner";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { formatBookingId } from "@/lib/booking";
import { formatTime12 } from "@/lib/time-slots";

type BarberGroup = {
  barberName: string;
  appointments: Appointment[];
};

type DateBarberGroup = {
  label: string;
  sortKey: string;
  barberGroups: BarberGroup[];
};

function formatDateLabel(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeToHHmm(time: string): string {
  const match = time.match(/^(\d{2}):(\d{2})/);
  if (match) {
    return `${match[1]}:${match[2]}`;
  }

  const date = new Date(`1970-01-01T${time}`);
  if (!Number.isNaN(date.getTime())) {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  return time;
}

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

type PendingUnit =
  | { kind: "group"; batchId: string; appointments: Appointment[]; sortKey: string; overdue: boolean }
  | { kind: "individual"; appointment: Appointment; sortKey: string; overdue: boolean };

function toManilaTimestamp(date: string, time: string): number {
  const hhmm = normalizeToHHmm(time);
  return new Date(`${date}T${hhmm}:00+08:00`).getTime();
}

function isUnitOverdue(appts: Appointment[], nowMs: number): boolean {
  const earliest = appts.reduce(
    (min, a) => Math.min(min, toManilaTimestamp(a.appointment_date, a.appointment_time)),
    Infinity,
  );
  return earliest < nowMs;
}

function matchesAppointmentSearch(appt: Appointment, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;

  return [
    String(appt.id),
    formatBookingId(appt.id),
    appt.customer.fullname,
    appt.customer.email,
    appt.customer_name,
    appt.customer_name_snapshot,
    appt.barber.fullname,
    appt.barber_name_snapshot,
    appt.service.name,
    appt.service_name_snapshot,
    ...(appt.add_ons ?? []).map((addOn) => addOn.name),
    appt.appointment_date,
    formatShortDate(appt.appointment_date),
    formatTime12(appt.appointment_time),
  ].some((value) => value?.toLowerCase().includes(query));
}

function sortPendingUnits(units: PendingUnit[]): PendingUnit[] {
  const upcoming: PendingUnit[] = [];
  const overdue: PendingUnit[] = [];

  for (const unit of units) {
    (unit.overdue ? overdue : upcoming).push(unit);
  }

  upcoming.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  overdue.sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  return [...upcoming, ...overdue];
}

function ActionMenu({
  onSelect,
  onCancel,
  onReschedule,
  onAddOn,
  disabled,
}: {
  onSelect: (action: "completed" | "no_show") => void;
  onCancel?: () => void;
  onReschedule?: () => void;
  onAddOn?: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Booking actions"
        className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-400"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-10 w-40 bg-white rounded-xl border border-gray-200 shadow-lg py-1 text-sm">
          {onAddOn && (
            <button
              onClick={() => {
                onAddOn();
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-gray-50 text-gray-700"
            >
              <Plus className="w-4 h-4 text-red-500" /> Add-on
            </button>
          )}
          <button
            onClick={() => {
              if (disabled) return;
              onSelect("completed");
              setOpen(false);
            }}
            disabled={disabled}
            title={
              disabled
                ? "Can only mark as completed on or after the booking date"
                : undefined
            }
            className={cn("flex items-center gap-2 w-full px-3 py-2 text-left", disabled ? "text-gray-400 cursor-not-allowed" : "hover:bg-gray-50 text-gray-700")}
          >
            <CheckCircle2 className="w-4 h-4 text-green-500" /> Completed
          </button>
          <button
            onClick={() => {
              if (disabled) return;
              onSelect("no_show");
              setOpen(false);
            }}
            disabled={disabled}
            title={
              disabled
                ? "Can only mark as no-show on or after the booking date"
                : undefined
            }
            className={cn("flex items-center gap-2 w-full px-3 py-2 text-left", disabled ? "text-gray-400 cursor-not-allowed" : "hover:bg-gray-50 text-gray-700")}
          >
            <UserX className="w-4 h-4 text-red-400" /> No-show
          </button>
          {onReschedule && (
            <button
              onClick={() => {
                onReschedule();
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 hover:bg-gray-50 text-gray-700"
            >
              <CalendarDays className="w-4 h-4 text-blue-500" /> Re-schedule
            </button>
          )}
          {onCancel && (
            <button
              onClick={() => {
                onCancel();
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 hover:bg-gray-50 text-gray-700"
            >
              <X className="w-4 h-4 text-red-500" /> Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AppointmentRow({
  appt,
  onStatusChange,
  onCancel,
  onReschedule,
  onAddOn,
  onResendEmail,
  resendingEmail,
  todayDate,
  className = "",
}: {
  appt: Appointment;
  onStatusChange: (appt: Appointment, status: "completed" | "no_show") => void;
  onCancel?: (appt: Appointment) => void;
  onReschedule?: (appt: Appointment) => void;
  onAddOn?: (appt: Appointment) => void;
  onResendEmail: (deliveryId: number) => void;
  resendingEmail: boolean;
  todayDate: string;
  className?: string;
}) {
  const actionDisabled = appt.appointment_date.split("T")[0] > todayDate;
  const canReschedule = appt.appointment_date.split("T")[0] >= todayDate;
  return (
    <div className={cn("relative rounded-xl border border-gray-200 bg-white p-4", className)}>
      <div className="pr-10">
        <p className="mt-0.5 text-xs text-gray-400">{formatBookingId(appt.id)}</p>
        <p className="mt-0.5 break-words font-bold text-gray-900 text-sm">{appt.customer.fullname}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          {appt.customer.email ? (
            <span className="inline-flex min-w-0 items-center gap-1.5 break-all">
              <Mail className="size-3.5 shrink-0" />
              {appt.customer.email}
            </span>
          ) : null}
          {appt.customer.contact_number ? (
            <span className="inline-flex items-center gap-1.5">
              <Phone className="size-3.5 shrink-0" />
              {appt.customer.contact_number}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t border-gray-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Barber</p>
          <p className="mt-0.5 break-words text-sm text-gray-700">{appt.barber.fullname}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Service</p>
          <p className="mt-0.5 break-words text-sm leading-snug text-gray-700">{appt.service.name}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Date</p>
          <p className="mt-0.5 text-sm text-gray-700">{formatShortDate(appt.appointment_date)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Time</p>
          <p className="mt-0.5 font-bold text-sm text-blue-600">{formatTime12(appt.appointment_time)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Price</p>
          <p className="mt-0.5 text-sm font-semibold text-gray-700">₱{Number(appt.price).toLocaleString()}</p>
        </div>
      </div>

      {appt.add_ons && appt.add_ons.length > 0 ? (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Add-ons</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {appt.add_ons.map((addOn) => (
              <span
                key={addOn.id}
                className="rounded-full bg-red-50 px-2 py-1 text-xs text-red-700"
              >
                {addOn.name} · ₱{Number(addOn.price).toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {appt.latest_email_delivery ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500">
          <Mail className="size-3.5 shrink-0" />
          <span className="capitalize">
            {appt.latest_email_delivery.type.replaceAll("_", " ")} email: {appt.latest_email_delivery.status}
          </span>
          {appt.latest_email_delivery.status === "failed" ? (
            <button
              type="button"
              disabled={resendingEmail}
              onClick={() => onResendEmail(appt.latest_email_delivery!.id)}
              className="inline-flex items-center gap-1 font-semibold text-red-600 disabled:opacity-50"
            >
              <RotateCcw className="size-3" />
              {resendingEmail ? "Resending..." : "Resend"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="absolute right-3 top-3">
        <ActionMenu
          onSelect={(status) => onStatusChange(appt, status)}
          onCancel={() => onCancel?.(appt)}
          onReschedule={canReschedule ? () => onReschedule?.(appt) : undefined}
          onAddOn={() => onAddOn?.(appt)}
          disabled={actionDisabled}
        />
      </div>
    </div>
  );
}

function PendingCard({
  req,
  overdue = false,
  onApprove,
  onCancel,
  disabled = false,
}: {
  req: Appointment;
  overdue?: boolean;
  onApprove: (appt: Appointment) => void;
  onCancel: (appt: Appointment) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative rounded-xl border border-yellow-200 bg-yellow-50 p-4">
      {overdue && (
        <span className="absolute top-2 right-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
          Overdue
        </span>
      )}
      <div className="flex items-center gap-1.5 mb-1">
        <User className="w-4 h-4 text-gray-400" />
        <span className="font-semibold text-gray-900 text-sm">
          {req.customer.fullname}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Mail className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs text-gray-500">{req.customer.email}</span>
      </div>
      <div className="flex items-center gap-1.5 mb-3">
        <Phone className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs text-gray-500">
          {req.customer.contact_number}
        </span>
      </div>
      <div className="border-t border-yellow-200 mb-3" />
      <div className="text-xs text-gray-600 space-y-0.5 mb-4">
        <p>
          <span className="font-medium text-gray-800">Barber:</span>{" "}
          {req.barber.fullname}
        </p>
        <p>
          <span className="font-medium text-gray-800">Service:</span>{" "}
          {req.service.name}
        </p>
        <p>
          <span className="font-medium text-gray-800">Date:</span>{" "}
          {formatShortDate(req.appointment_date)}
        </p>
        <p>
          <span className="font-medium text-gray-800">Time:</span>{" "}
          {formatTime12(req.appointment_time)}
        </p>
        <p>
          <span className="font-medium text-gray-800">Price:</span>{" "}
          ₱{Number(req.price).toLocaleString()}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => onApprove(req)}
            disabled={disabled || overdue}
            title={overdue ? "Cannot confirm an overdue booking" : undefined}
            className={cn(
              "gap-1.5 text-sm h-9",
              overdue
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white",
            )}
          >
            <Check className="w-4 h-4" /> Confirm
          </Button>
          <Button
            onClick={() => onCancel(req)}
            disabled={disabled}
            className="bg-red-500 hover:bg-red-600 text-white gap-1.5 text-sm h-9"
          >
            <X className="w-4 h-4" /> Reject
          </Button>
        </div>
      </div>
    </div>
  );
}

function toDateBarberGroups(appointments: Appointment[]): DateBarberGroup[] {
  const byDate = appointments.reduce<Record<string, Appointment[]>>(
    (acc, appt) => {
      const key = appt.appointment_date;
      if (!acc[key]) acc[key] = [];
      acc[key].push(appt);
      return acc;
    },
    {},
  );

  return Object.entries(byDate)
    .map(([sortKey, appts]) => {
      const byBarber = appts.reduce<Record<string, Appointment[]>>(
        (acc, appt) => {
          const key = appt.barber.fullname ?? "Unknown";
          if (!acc[key]) acc[key] = [];
          acc[key].push(appt);
          return acc;
        },
        {},
      );

      const barberGroups: BarberGroup[] = Object.entries(byBarber)
        .map(([barberName, barberAppts]) => ({
          barberName,
          appointments: [...barberAppts].sort((a, b) =>
            a.appointment_time.localeCompare(b.appointment_time),
          ),
        }))
        .sort((a, b) => a.barberName.localeCompare(b.barberName));

      return { label: formatDateLabel(sortKey), sortKey, barberGroups };
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

export function Appointment() {
  const { user: authUser, isLoading: isAuthLoading } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const appointmentLoading = loading && (isAuthLoading || authUser !== null);
  const [updatingIds, setUpdatingIds] = useState<number[]>([]);
  const [cancellationDialogOpen, setCancellationDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [confirmedPage, setConfirmedPage] = useState(1);
  const [appointmentSearch, setAppointmentSearch] = useState("");
  const [pastDueOpen, setPastDueOpen] = useState(false);
  const confirmedPageSize = 10;
  const [confirmActionOpen, setConfirmActionOpen] = useState(false);
  const [confirmActionTarget, setConfirmActionTarget] = useState<{
    appt: Appointment;
    status: "completed" | "no_show";
  } | null>(null);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [rescheduleAppointment, setRescheduleAppointment] =
    useState<Appointment | null>(null);
  const [updatingBatchIds, setUpdatingBatchIds] = useState<string[]>([]);
  const [approveTarget, setApproveTarget] = useState<Appointment[] | null>(null);
  const [batchRejectDialogOpen, setBatchRejectDialogOpen] = useState(false);
  const [batchRejectTarget, setBatchRejectTarget] = useState<Appointment[] | null>(null);
  const [batchRejectReason, setBatchRejectReason] = useState("");
  const todayDateRef = useRef(getTodayDate());
  const [pendingDetailAppointments, setPendingDetailAppointments] = useState<
    Appointment[] | null
  >(null);
  const [now, setNow] = useState(() => Date.now());
  const [resendingDeliveryId, setResendingDeliveryId] = useState<number | null>(null);
  const [addOnAppointment, setAddOnAppointment] = useState<Appointment | null>(null);
  const [assistedBookingOpen, setAssistedBookingOpen] = useState(false);

  const loadAppointments = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await getAppointments(signal);
      setAppointments(data);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.error("Failed to load bookings:", error);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadAppointments(controller.signal);
    return () => controller.abort();
  }, [loadAppointments]);

  useRealtimeEvent("appointments", loadAppointments);

  const pending = useMemo(
    () => appointments.filter((a) => a.status === "pending"),
    [appointments],
  );
  const showPendingRequests = appointmentLoading || pending.length > 0;

  const sortedPending = useMemo(() => {
    const grouped = new Map<string, Appointment[]>();
    const individuals: Appointment[] = [];

    for (const appt of pending) {
      if (appt.batch_id) {
        const existing = grouped.get(appt.batch_id);
        if (existing) {
          existing.push(appt);
        } else {
          grouped.set(appt.batch_id, [appt]);
        }
      } else {
        individuals.push(appt);
      }
    }

    const units: PendingUnit[] = [];

    for (const appts of grouped.values()) {
      const sortKey = appts
        .map((a) => `${a.appointment_date}T${normalizeToHHmm(a.appointment_time)}`)
        .sort()[0];
      units.push({
        kind: "group",
        batchId: appts[0].batch_id ?? "",
        appointments: appts,
        sortKey,
        overdue: isUnitOverdue(appts, now),
      });
    }

    for (const appt of individuals) {
      const sortKey = `${appt.appointment_date}T${normalizeToHHmm(appt.appointment_time)}`;
      units.push({
        kind: "individual",
        appointment: appt,
        sortKey,
        overdue: toManilaTimestamp(appt.appointment_date, appt.appointment_time) < now,
      });
    }

    return sortPendingUnits(units);
  }, [pending, now]);

  const confirmedAppointments = useMemo(
    () => appointments.filter((a) => a.status === "confirmed"),
    [appointments],
  );

  const filteredConfirmedAppointments = useMemo(
    () => confirmedAppointments.filter((appt) => matchesAppointmentSearch(appt, appointmentSearch)),
    [appointmentSearch, confirmedAppointments],
  );

  const [today] = useState(getTodayDate);

  const upcomingConfirmed = useMemo(
    () => filteredConfirmedAppointments.filter((a) => a.appointment_date >= today),
    [filteredConfirmedAppointments, today],
  );

  const pastDueConfirmed = useMemo(
    () => filteredConfirmedAppointments.filter((a) => a.appointment_date < today),
    [filteredConfirmedAppointments, today],
  );

  const pastDueGroups = useMemo(
    () => toDateBarberGroups(pastDueConfirmed),
    [pastDueConfirmed],
  );

  const confirmedTotalPages = Math.max(1, Math.ceil(upcomingConfirmed.length / confirmedPageSize));

  const paginatedConfirmedGroups = useMemo(() => {
    const start = (confirmedPage - 1) * confirmedPageSize;
    const paginated = upcomingConfirmed.slice(start, start + confirmedPageSize);
    return toDateBarberGroups(paginated);
  }, [upcomingConfirmed, confirmedPage]);

  const runUpdate = async (
    appt: Appointment,
    status: "confirmed" | "cancelled" | "rejected" | "completed" | "no_show",
    cancellationReason?: string,
  ): Promise<boolean> => {
    try {
      const bookingCustomerId = appt.customer.id;
      const serviceId = appt.service.id;
      const barberUserId = appt.barber.id;

      if (!bookingCustomerId || !serviceId || !barberUserId) {
        toast.error("This booking is missing required details.");
        return false;
      }

      setUpdatingIds((prev) => [...prev, appt.id]);

      const normalizedCancellationReason =
        (status === "cancelled" || status === "rejected") && cancellationReason?.trim()
          ? cancellationReason.trim()
          : null;

      const payload = {
        booking_customer_id: bookingCustomerId,
        service_id: serviceId,
        barber_user_id: barberUserId,
        appointment_date: appt.appointment_date,
        appointment_time: normalizeToHHmm(appt.appointment_time),
        duration_minutes: appt.duration_minutes,
        price: Number(appt.price),
        notes: appt.notes,
        cancellation_reason: normalizedCancellationReason,
        status,
      };

      const validation = updateAppointmentSchema.safeParse(payload);
      if (!validation.success) {
        toast.error("Please check the booking details and try again.");
        return false;
      }

      await updateAppointment(appt.id, validation.data);
      const actionMessages: Record<string, string> = {
        confirmed: "Booking confirmed",
        completed: "Booking marked as completed",
        cancelled: "Booking cancelled",
        rejected: "Booking rejected",
        no_show: "Booking marked as no-show",
      };
      toast.success(actionMessages[status] ?? "Booking updated");

      await loadAppointments();
      window.dispatchEvent(new CustomEvent("appointments:updated"));
      return true;
    } catch (error) {
      console.error("Failed to update booking:", error);
      toast.error(error instanceof Error ? error.message : "Could not update booking. Please try again.");
      return false;
    } finally {
      setUpdatingIds((prev) => prev.filter((id) => id !== appt.id));
    }
  };

  const handleBatchApprove = async (appts: Appointment[]) => {
    const batchId = appts[0]?.batch_id;
    if (!batchId || updatingBatchIds.includes(batchId)) return;

    try {
      setUpdatingBatchIds((prev) => [...prev, batchId]);

      await updateBatchAppointmentStatus(batchId, "confirmed");
      toast.success(
        `${appts.length} booking${appts.length > 1 ? "s" : ""} confirmed`,
      );

      await loadAppointments();
      window.dispatchEvent(new CustomEvent("appointments:updated"));
    } catch (error) {
      console.error("Failed to confirm group:", error);
      toast.error(error instanceof Error ? error.message : "Could not confirm bookings. Please try again.");
    } finally {
      setUpdatingBatchIds((prev) => prev.filter((id) => id !== batchId));
    }
  };

  const handleBatchRejectClick = (appts: Appointment[]) => {
    setBatchRejectTarget(appts);
    setBatchRejectReason("");
    setBatchRejectDialogOpen(true);
  };

  const handleBatchRejectSubmit = async () => {
    const appts = batchRejectTarget;
    if (!appts || appts.length === 0) return;

    const batchId = appts[0]?.batch_id;
    if (!batchId || updatingBatchIds.includes(batchId)) return;

    if (!batchRejectReason.trim()) {
      toast.error("Please provide a reason for rejection.");
      return;
    }

    if (batchRejectReason.trim().length > 500) {
      toast.error("Rejection reason must not exceed 500 characters");
      return;
    }

    try {
      setUpdatingBatchIds((prev) => [...prev, batchId]);

      const reason = batchRejectReason.trim() || null;

      await updateBatchAppointmentStatus(batchId, "rejected", reason);
      toast.success(
        `${appts.length} booking${appts.length > 1 ? "s" : ""} rejected`,
      );

      setBatchRejectDialogOpen(false);
      setBatchRejectTarget(null);
      setBatchRejectReason("");
      await loadAppointments();
      window.dispatchEvent(new CustomEvent("appointments:updated"));
    } catch (error) {
      console.error("Failed to batch reject:", error);
      toast.error(error instanceof Error ? error.message : "Could not reject bookings. Please try again.");
    } finally {
      setUpdatingBatchIds((prev) => prev.filter((id) => id !== batchId));
    }
  };

  const handleCancelClick = (appt: Appointment) => {
    setSelectedAppointment(appt);
    setCancellationDialogOpen(true);
  };

  const handlePendingDetailApprove = () => {
    const targets = pendingDetailAppointments;
    if (!targets?.length) return;

    setPendingDetailAppointments(null);
    setApproveTarget(targets);
  };

  const handlePendingDetailReject = () => {
    const targets = pendingDetailAppointments;
    if (!targets?.length) return;

    setPendingDetailAppointments(null);

    if (targets[0].batch_id) {
      handleBatchRejectClick(targets);
      return;
    }

    handleCancelClick(targets[0]);
  };

  const handleResendEmail = async (deliveryId: number) => {
    try {
      setResendingDeliveryId(deliveryId);
      await resendBookingEmail(deliveryId);
      toast.success("Email sent successfully");
      await loadAppointments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not resend the email.");
    } finally {
      setResendingDeliveryId(null);
    }
  };

  const handleAddOnUpdated = (updatedAppointment: Appointment) => {
    setAppointments((current) =>
      current.map((appointment) =>
        appointment.id === updatedAppointment.id
          ? updatedAppointment
          : appointment,
      ),
    );
    setAddOnAppointment(updatedAppointment);
  };

  const handleCancellationSubmit = async (
    data: CancellationReasonSchemaFormValues,
  ) => {
    if (selectedAppointment) {
      const targetStatus = selectedAppointment.status === "pending" ? "rejected" : "cancelled";
      const success = await runUpdate(
        selectedAppointment,
        targetStatus,
        data.cancellation_reason,
      );
      if (success) {
        setCancellationDialogOpen(false);
        setSelectedAppointment(null);
      }
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmActionTarget) return;
    const { appt, status } = confirmActionTarget;
    const success = await runUpdate(appt, status);
    if (success) {
      setConfirmActionOpen(false);
      setConfirmActionTarget(null);
    }
  };

  const handleApproveConfirm = async () => {
    const targets = approveTarget;
    if (!targets?.length) return;

    if (targets[0].batch_id) {
      await handleBatchApprove(targets);
      setApproveTarget(null);
      return;
    }

    const success = await runUpdate(targets[0], "confirmed");
    if (success) setApproveTarget(null);
  };

  const handleRescheduleClick = (appt: Appointment) => {
    setRescheduleAppointment(appt);
    setRescheduleDialogOpen(true);
  };

  const handleRescheduleSubmit = async (data: RescheduleSubmitData) => {
    if (!rescheduleAppointment) return;

    try {
      setUpdatingIds((prev) => [...prev, rescheduleAppointment.id]);

      const payload = {
        booking_customer_id: rescheduleAppointment.customer.id!,
        service_id: rescheduleAppointment.service.id!,
        barber_user_id: data.barber_user_id,
        appointment_date: data.appointment_date,
        appointment_time: data.appointment_time,
        duration_minutes: rescheduleAppointment.duration_minutes,
        price: Number(rescheduleAppointment.price),
        notes: data.reason,
        status: "confirmed" as const,
      };

      const validation = updateAppointmentSchema.safeParse(payload);
      if (!validation.success) {
        toast.error("Please check the reschedule details and try again.");
        return;
      }

      await updateAppointment(rescheduleAppointment.id, validation.data);
      toast.success("Booking rescheduled successfully");

      setRescheduleDialogOpen(false);
      setRescheduleAppointment(null);
      await loadAppointments();
      window.dispatchEvent(new CustomEvent("appointments:updated"));
    } catch (error) {
      console.error("Failed to reschedule booking:", error);
      toast.error(error instanceof Error ? error.message : "Could not reschedule booking. Please try again.");
    } finally {
      setUpdatingIds((prev) => prev.filter((id) => id !== rescheduleAppointment.id));
    }
  };

  const approveTargetBatchId = approveTarget?.[0]?.batch_id;
  const isApproving =
    approveTarget?.some((appointment) => updatingIds.includes(appointment.id)) ||
    (approveTargetBatchId
      ? updatingBatchIds.includes(approveTargetBatchId)
      : false);
  const isConfirmingAction = confirmActionTarget
    ? updatingIds.includes(confirmActionTarget.appt.id)
    : false;
  const batchRejectTargetId = batchRejectTarget?.[0]?.batch_id;
  const isRejectingBatch = batchRejectTargetId
    ? updatingBatchIds.includes(batchRejectTargetId)
    : false;

  return (
    <div className="w-full bg-slate-100 p-4 sm:p-6 pb-12 sm:pb-10 font-sans">
      <div className="relative mb-6 sm:flex sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <h1 className="pr-44 text-2xl font-bold text-gray-900 sm:pr-0 sm:text-3xl">
            Schedules
          </h1>
          <p className="text-gray-500 mt-1">
            Manage booking requests and scheduled bookings
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setAssistedBookingOpen(true)}
          className="absolute right-0 top-0 w-auto shrink-0 gap-2 bg-blue-600 text-white hover:bg-blue-700 sm:static"
        >
          <CalendarPlus className="size-4" />
          Assisted Booking
        </Button>
      </div>

      <div
        className={cn(
          "grid grid-cols-1 gap-4 items-start",
          showPendingRequests && "lg:grid-cols-[1fr_420px]",
        )}
      >
        {showPendingRequests ? (
          <SectionCard
            title="Pending Requests"
            description={`${pending.length} pending`}
            className="lg:order-2"
          >

            {appointmentLoading ? (
              <div className="flex flex-col items-center justify-center py-14 text-gray-400">
                <p className="text-sm">Loading requests...</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {sortedPending.map((unit) => {
                  if (unit.kind === "group") {
                    const isUpdating = updatingBatchIds.includes(unit.batchId);
                    return (
                      <div
                        key={unit.batchId}
                        className={isUpdating ? "opacity-60" : ""}
                      >
                        <GroupPendingCard
                          appointments={unit.appointments}
                          overdue={unit.overdue}
                          onViewDetails={setPendingDetailAppointments}
                          onApproveAll={setApproveTarget}
                          onRejectAll={handleBatchRejectClick}
                          disabled={isUpdating}
                        />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={unit.appointment.id}
                      className={updatingIds.includes(unit.appointment.id) ? "opacity-60" : ""}
                    >
                      <PendingCard
                        req={unit.appointment}
                        overdue={unit.overdue}
                        onApprove={(appt) => setApproveTarget([appt])}
                        onCancel={handleCancelClick}
                        disabled={updatingIds.includes(unit.appointment.id)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        ) : null}

        <div className="flex flex-col gap-4 lg:order-1">
          <SectionCard
            title="Confirmed Bookings"
            description="Scheduled bookings grouped by date"
          >

            <div className="relative mb-5 w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <Input
                type="search"
                value={appointmentSearch}
                onChange={(event) => {
                  setAppointmentSearch(event.target.value);
                  setConfirmedPage(1);
                }}
                placeholder="Search bookings by customer, service, barber, date, or ID"
                aria-label="Search confirmed bookings"
                className="h-9 pl-9"
                maxLength={100}
              />
            </div>

            {appointmentLoading ? (
              <div className="flex flex-col items-center justify-center py-14 text-gray-400">
                <p className="text-sm">Loading bookings...</p>
              </div>
            ) : confirmedAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-gray-400">
                <CalendarDays className="w-10 h-10 mb-2 opacity-20" />
                <p className="text-sm">No bookings scheduled.</p>
              </div>
            ) : filteredConfirmedAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-gray-400">
                <Search className="mb-2 h-10 w-10 opacity-20" />
                <p className="text-sm">No bookings match your search.</p>
              </div>
            ) : (
              <>
                {upcomingConfirmed.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="font-semibold text-gray-800 text-sm">Upcoming</h3>
                      <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        {upcomingConfirmed.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-6">
                      {paginatedConfirmedGroups.map((group) => (
                        <div key={group.sortKey}>
                          <div className="flex items-center gap-3 mb-3">
                            <CalendarDays className="w-4 h-4 text-blue-500" />
                            <span className="font-bold text-gray-900 text-sm">
                              {group.label}
                            </span>
                            <span className="text-xs text-gray-400">
                              {group.barberGroups.reduce((sum, bg) => sum + bg.appointments.length, 0)} booking
                              {group.barberGroups.reduce((sum, bg) => sum + bg.appointments.length, 0) !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="flex flex-col gap-3">
                            {group.barberGroups.map((bg) => (
                              <div key={bg.barberName}>
                                <div className="flex items-center gap-2 mb-2 pl-7">
                                  <Scissors className="w-3 h-3 text-gray-400" />
                                  <span className="font-semibold text-gray-700 text-xs">{bg.barberName}</span>
                                </div>
                                <div className="flex flex-col gap-2 pl-7">
                                  {bg.appointments.map((appt) => (
                                    <div
                                      key={appt.id}
                                      className={
                                        updatingIds.includes(appt.id) ? "opacity-60" : ""
                                      }
                                    >
                                      <AppointmentRow
                                        appt={appt}
                                        onStatusChange={(item, status) => {
                                          setConfirmActionTarget({ appt: item, status });
                                          setConfirmActionOpen(true);
                                        }}
                                        onCancel={handleCancelClick}
                                        onReschedule={handleRescheduleClick}
                                        onAddOn={setAddOnAppointment}
                                        onResendEmail={handleResendEmail}
                                        resendingEmail={resendingDeliveryId === appt.latest_email_delivery?.id}
                                        todayDate={todayDateRef.current}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {upcomingConfirmed.length > confirmedPageSize ? (
                      <Pagination className="mt-4 overflow-hidden px-1">
                        <PaginationContent className="flex-nowrap gap-0.5">
                          <PaginationItem>
                            <PaginationPrevious
                              href="#"
                              className="h-8 w-8 sm:h-9 sm:w-auto"
                              text=""
                              onClick={(event) => {
                                event.preventDefault();
                                setConfirmedPage((prev) => Math.max(1, prev - 1));
                              }}
                            />
                          </PaginationItem>
                          {(() => {
                            const pages: (number | "...")[] = [];
                            const total = confirmedTotalPages;
                            const current = confirmedPage;
                            pages.push(1);
                            if (current > 3) pages.push("...");
                            const start = Math.max(2, current - 1);
                            const end = Math.min(total - 1, current + 1);
                            for (let i = start; i <= end; i++) pages.push(i);
                            if (current < total - 2) pages.push("...");
                            if (total > 1) pages.push(total);
                            return pages.map((pageNo, idx) =>
                              pageNo === "..." ? (
                                <PaginationItem key={`ellipsis-${idx}`}>
                                  <PaginationEllipsis className="size-7 sm:size-8" />
                                </PaginationItem>
                              ) : (
                                <PaginationItem key={pageNo}>
                                  <PaginationLink
                                    href="#"
                                    isActive={pageNo === current}
                                    className="h-7 w-7 sm:h-8 sm:w-8 text-xs sm:text-sm font-medium rounded-lg"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      setConfirmedPage(pageNo);
                                    }}
                                  >
                                    {pageNo}
                                  </PaginationLink>
                                </PaginationItem>
                              ),
                            );
                          })()}
                          <PaginationItem>
                            <PaginationNext
                              href="#"
                              className="h-8 w-8 sm:h-9 sm:w-auto"
                              text=""
                              onClick={(event) => {
                                event.preventDefault();
                                setConfirmedPage((prev) => Math.min(confirmedTotalPages, prev + 1));
                              }}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    ) : null}
                  </>
                )}

                {pastDueConfirmed.length > 0 && (
                  <div className="mt-6 border-t border-gray-200 pt-4">
                    <button
                      onClick={() => setPastDueOpen((prev) => !prev)}
                      className="flex items-center gap-2 w-full text-left"
                    >
                      <span className="font-semibold text-gray-800 text-sm">
                        Past Due
                      </span>
                      <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-100 text-red-700">
                        {pastDueConfirmed.length}
                      </span>
                      <span className="text-gray-400 ml-auto text-xs">
                        {pastDueOpen ? "Hide" : "Show"}
                      </span>
                    </button>
                    {pastDueOpen && (
                      <div className="flex flex-col gap-6 mt-4">
                        {pastDueGroups.map((group) => (
                          <div key={group.sortKey}>
                            <div className="flex items-center gap-3 mb-3">
                              <CalendarDays className="w-4 h-4 text-red-400" />
                              <span className="font-bold text-gray-700 text-sm">
                                {group.label}
                              </span>
                              <span className="text-xs text-red-400">
                                {group.barberGroups.reduce((sum, bg) => sum + bg.appointments.length, 0)} booking
                                {group.barberGroups.reduce((sum, bg) => sum + bg.appointments.length, 0) !== 1 ? "s" : ""}
                              </span>
                            </div>
                            <div className="flex flex-col gap-3">
                              {group.barberGroups.map((bg) => (
                                <div key={bg.barberName}>
                                  <div className="flex items-center gap-2 mb-2 pl-7">
                                    <Scissors className="w-3 h-3 text-gray-400" />
                                    <span className="font-semibold text-gray-700 text-xs">{bg.barberName}</span>
                                  </div>
                                  <div className="flex flex-col gap-2 pl-7">
                                    {bg.appointments.map((appt) => (
                                      <AppointmentRow
                                        key={appt.id}
                                        appt={appt}
                                        onStatusChange={(item, status) => {
                                          setConfirmActionTarget({ appt: item, status });
                                          setConfirmActionOpen(true);
                                        }}
                                        onCancel={handleCancelClick}
                                        onAddOn={setAddOnAppointment}
                                        onResendEmail={handleResendEmail}
                                        resendingEmail={resendingDeliveryId === appt.latest_email_delivery?.id}
                                        todayDate={todayDateRef.current}
                                        className={
                                          (updatingIds.includes(appt.id) ? "opacity-60" : "") +
                                          " !border-red-300 !bg-red-50"
                                        }
                                      />
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </SectionCard>

        </div>
      </div>

      <PendingAppointmentDetailDialog
        appointments={pendingDetailAppointments}
        open={pendingDetailAppointments !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDetailAppointments(null);
        }}
        onConfirm={handlePendingDetailApprove}
        onReject={handlePendingDetailReject}
        onResendEmail={handleResendEmail}
        resendingEmail={resendingDeliveryId !== null}
        disabled={
          pendingDetailAppointments?.some(
            (appointment) =>
              updatingIds.includes(appointment.id) ||
              (appointment.batch_id
                ? updatingBatchIds.includes(appointment.batch_id)
                : false),
          ) ?? false
        }
      />

      <Dialog
        open={approveTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isApproving) setApproveTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {approveTarget && approveTarget.length > 1
                ? "Confirm Group Booking"
                : "Confirm Booking"}
            </DialogTitle>
            <DialogDescription>
              Confirm {approveTarget?.length ?? 0} booking
              {(approveTarget?.length ?? 0) === 1 ? "" : "s"}. This reserves the
              selected time {approveTarget && approveTarget.length > 1 ? "slots" : "slot"}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setApproveTarget(null)}
              disabled={Boolean(isApproving)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleApproveConfirm}
              disabled={Boolean(isApproving)}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {isApproving
                ? "Approving..."
                : approveTarget && approveTarget.length > 1
                  ? "Confirm All"
                  : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmActionOpen}
        onOpenChange={(open) => {
          if (isConfirmingAction) return;
          if (!open) {
            setConfirmActionOpen(false);
            setConfirmActionTarget(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Action</DialogTitle>
            <DialogDescription>
              Are you sure you want to mark this booking as{" "}
              {confirmActionTarget?.status === "completed"
                ? "Completed"
                : "No-show"}
              ?
            </DialogDescription>
          </DialogHeader>
          {confirmActionTarget && (
            <div className="rounded-lg border border-gray-200 p-4 space-y-2 text-sm">
              <p>
                <span className="font-medium">Customer:</span>{" "}
                {confirmActionTarget.appt.customer.fullname}
              </p>
              <p>
                <span className="font-medium">Barber:</span>{" "}
                {confirmActionTarget.appt.barber.fullname}
              </p>
              <p>
                <span className="font-medium">Service:</span>{" "}
                {confirmActionTarget.appt.service.name}
              </p>
              <p>
                <span className="font-medium">Date:</span>{" "}
                {formatShortDate(confirmActionTarget.appt.appointment_date)}
              </p>
              <p>
                <span className="font-medium">Time:</span>{" "}
                {formatTime12(confirmActionTarget.appt.appointment_time)}
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmActionOpen(false);
                setConfirmActionTarget(null);
              }}
              disabled={isConfirmingAction}
            >
              Cancel
            </Button>
            <Button
              className={
                confirmActionTarget?.status === "completed"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-500 hover:bg-red-600"
              }
              onClick={handleConfirmAction}
              disabled={isConfirmingAction}
            >
              {isConfirmingAction
                ? "Updating..."
                : `Yes, ${
                    confirmActionTarget?.status === "completed"
                      ? "Complete"
                      : "Mark No-show"
                  }`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={batchRejectDialogOpen}
        onOpenChange={(open) => {
          if (isRejectingBatch) return;
          if (!open) {
            setBatchRejectDialogOpen(false);
            setBatchRejectTarget(null);
            setBatchRejectReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Group Booking</DialogTitle>
            <DialogDescription>
              Reject {batchRejectTarget?.length ?? 0} bookings from{" "}
              {batchRejectTarget?.[0]?.customer.fullname ?? "this customer"}.
            </DialogDescription>
          </DialogHeader>
          {batchRejectTarget && (
            <div className="rounded-lg border border-gray-200 p-4 space-y-2 text-sm">
              <p className="font-medium text-gray-700">Bookings to reject:</p>
              {batchRejectTarget.map((appt) => (
                <div key={appt.id} className="flex items-center justify-between text-gray-600">
                  <span>{appt.customer_name ?? appt.customer.fullname}</span>
                  <span>{appt.service.name} at {formatTime12(appt.appointment_time)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <TextAreaWithLabel
              id="batch-reject-reason"
              label="Reason"
              rows={3}
              value={batchRejectReason}
              onChange={(e) => setBatchRejectReason(e.target.value)}
              placeholder="Enter the reason for rejection..."
              maxLength={500}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setBatchRejectDialogOpen(false);
                setBatchRejectTarget(null);
                setBatchRejectReason("");
              }}
              disabled={isRejectingBatch}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-500 hover:bg-red-600"
              onClick={handleBatchRejectSubmit}
              disabled={isRejectingBatch}
            >
              {isRejectingBatch ? "Rejecting..." : "Reject All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedAppointment && (
        <CancellationForm
          open={cancellationDialogOpen}
          onClose={() => {
            setCancellationDialogOpen(false);
            setSelectedAppointment(null);
          }}
          onSubmit={handleCancellationSubmit}
          appointment={selectedAppointment}
          mode={selectedAppointment.status === "pending" ? "reject" : "cancel"}
        />
      )}

      {rescheduleAppointment && (
        <RescheduleForm
          open={rescheduleDialogOpen}
          onClose={() => {
            setRescheduleDialogOpen(false);
            setRescheduleAppointment(null);
          }}
          onSubmit={handleRescheduleSubmit}
          appointment={rescheduleAppointment}
        />
      )}

      <AppointmentAddOnDialog
        appointment={addOnAppointment}
        open={addOnAppointment !== null}
        onOpenChange={(open) => {
          if (!open) setAddOnAppointment(null);
        }}
        onUpdated={handleAddOnUpdated}
      />

      <AssistedBookingForm
        open={assistedBookingOpen}
        onOpenChange={setAssistedBookingOpen}
        onSuccess={async () => {
          await loadAppointments();
          window.dispatchEvent(new CustomEvent("appointments:updated"));
        }}
      />

    </div>
  );
}
