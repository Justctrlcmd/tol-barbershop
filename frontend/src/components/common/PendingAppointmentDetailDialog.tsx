"use client";

import {
  Mail,
  Phone,
  Scissors,
  StickyNote,
  User,
  Users,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBookingId } from "@/lib/booking";
import { sanitizeString, sanitizeText } from "@/lib/sanitizer";
import { formatTime12 } from "@/lib/time-slots";

import type { Appointment } from "@/services/shared/appointment.api";

type PendingAppointmentDetailDialogProps = {
  appointments: Appointment[] | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onReject: () => void;
  onResendEmail?: (deliveryId: number) => void;
  resendingEmail?: boolean;
  disabled?: boolean;
};

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function displayString(
  value: string | null | undefined,
  fallback = "Not provided",
): string {
  if (!value) return fallback;
  return sanitizeString(value) || fallback;
}

export function PendingAppointmentDetailDialog({
  appointments,
  open,
  onOpenChange,
  onConfirm,
  onReject,
  onResendEmail,
  resendingEmail = false,
  disabled = false,
}: PendingAppointmentDetailDialogProps) {
  if (!appointments?.length) return null;

  const sortedAppointments = [...appointments].sort((a, b) =>
    a.appointment_time.localeCompare(b.appointment_time),
  );
  const first = sortedAppointments[0];
  const isGroup = sortedAppointments.some((appointment) => appointment.batch_id);
  const bookingContact =
    sortedAppointments.find((appointment) => !appointment.customer_name) ?? first;
  const totalPrice = sortedAppointments.reduce(
    (sum, appointment) => sum + Number(appointment.price),
    0,
  );
  const notes = first.notes ? sanitizeText(first.notes) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-gray-100 px-4 py-4 pr-12 sm:px-6 sm:py-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              {isGroup ? <Users className="size-5" /> : <User className="size-5" />}
            </span>
            <div className="min-w-0 space-y-1.5">
              <DialogTitle className="text-lg font-semibold text-gray-950">
                {isGroup ? "Group booking request" : "Booking request"}
              </DialogTitle>
              <DialogDescription>
                Review {sortedAppointments.length} booking
                {sortedAppointments.length === 1 ? "" : "s"} before taking action.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto px-4 py-5 sm:px-6">
          <div className="grid gap-4">
            <section className="grid gap-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Schedule
                </p>
                <p className="mt-2 flex items-center gap-2 font-semibold text-gray-950">
                  <Scissors className="size-4 text-amber-700" />
                  {displayString(first.barber.fullname, "Unassigned barber")}
                </p>
                <p className="mt-3 flex items-center gap-2 font-semibold text-gray-950">
                  <Scissors className="size-4 text-amber-700" />
                  {isGroup ? "Multiple services" : displayString(first.service.name, "Unknown service")}
                </p>
                <p className="mt-3 font-semibold text-gray-950">
                  {formatDate(first.appointment_date)}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  <span className="font-medium text-gray-800">Time:</span>{" "}
                  {sortedAppointments
                    .map((appointment) => formatTime12(appointment.appointment_time))
                    .join(" & ")}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Total
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-950">
                  ₱{totalPrice.toLocaleString()}
                </p>
              </div>
            </section>

            {first.latest_email_delivery ? (
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Latest customer email
                  </p>
                  <p className="mt-1 text-sm font-medium capitalize text-gray-900">
                    {first.latest_email_delivery.type.replaceAll("_", " ")} · {first.latest_email_delivery.status}
                  </p>
                </div>
                {first.latest_email_delivery.status === "failed" && onResendEmail ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={resendingEmail}
                    onClick={() => onResendEmail(first.latest_email_delivery!.id)}
                  >
                    <RotateCcw className="size-4" />
                    {resendingEmail ? "Resending..." : "Resend email"}
                  </Button>
                ) : null}
              </section>
            ) : null}

            <section className="rounded-xl border border-gray-200 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Booking contact
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex items-center gap-3">
                  <User className="size-4 shrink-0 text-gray-400" />
                  <span className="min-w-0 truncate text-sm font-medium text-gray-900">
                    {displayString(bookingContact.customer.fullname)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="size-4 shrink-0 text-gray-400" />
                  <span className="min-w-0 break-all text-sm text-gray-600">
                    {displayString(first.customer.email)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="size-4 shrink-0 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {displayString(first.customer.contact_number)}
                  </span>
                </div>
              </div>
            </section>

            {notes ? (
              <section className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <StickyNote className="mt-0.5 size-4 shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Notes
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700">
                    {notes}
                  </p>
                </div>
              </section>
            ) : null}

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-semibold text-gray-950">
                  {isGroup ? "Group members" : "Booking details"}
                </h3>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                  {sortedAppointments.length}
                </span>
              </div>

              <div className="space-y-3">
                {sortedAppointments.map((appointment, index) => (
                  <article
                    key={appointment.id}
                    className="rounded-xl border border-gray-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-gray-950">
                            {displayString(
                              appointment.customer_name ?? appointment.customer.fullname,
                              "Unknown customer",
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatBookingId(appointment.id)}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 font-semibold text-gray-950">
                        ₱{Number(appointment.price).toLocaleString()}
                      </span>
                    </div>

                    <div className="grid gap-3 pt-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-gray-500">Service</p>
                        <p className="mt-0.5 font-medium text-gray-900">
                          {displayString(appointment.service.name, "Unknown service")}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Time</p>
                        <p className="mt-0.5 font-medium text-gray-900">
                          {formatTime12(appointment.appointment_time)}
                        </p>
                      </div>
                    </div>
                    {(appointment.add_ons ?? []).length > 0 && <div className="mt-3 text-sm text-muted-foreground"><p className="font-medium">Add-ons</p>{appointment.add_ons!.map((item) => <p key={item.id}>{displayString(item.name, "Add-on")} · ₱{Number(item.price).toFixed(2)}</p>)}</div>}
                  </article>
                ))}
              </div>
            </section>
          </div>
        </div>

        <DialogFooter className="!m-0 rounded-none rounded-b-xl px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={onReject} disabled={disabled}>
            {isGroup && sortedAppointments.length > 1 ? "Reject all" : "Reject"}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={disabled}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            {isGroup && sortedAppointments.length > 1 ? "Confirm all" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
