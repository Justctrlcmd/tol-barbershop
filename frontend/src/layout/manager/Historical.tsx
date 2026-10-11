"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { TablePagination } from "@/components/common/TablePagination";
import {
  type AppointmentHistoryStatusFilter,
  useAppointmentHistory,
} from "@/hooks/useAppointmentHistory";
import {
  resendBookingEmail,
  type AppointmentStatus,
} from "@/services/shared/appointment.api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/common/SectionCard";
import { AppointmentStatusBadge } from "@/components/common/AppointmentStatusBadge";
import { formatBookingId } from "@/lib/booking";
import { formatTime12 } from "@/lib/time-slots";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Row = {
  id: number;
  customer: string;
  service: string;
  barber: string;
  date: string;
  time: string;
  status: AppointmentStatus;
  price: number;
  discountAmount: number;
  discountLabel: string | null;
  addOns: { name: string | null; price: number | string }[];
  cancellation_reason: string | null;
  emailDelivery: {
    id: number;
    type: string;
    status: "pending" | "sent" | "failed";
  } | null;
};

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function Historical() {
  const {
    appointments,
    meta,
    loading,
    refreshing,
    error,
    search,
    setSearch,
    status,
    setStatus,
    setPage,
    getPageHref,
    refresh,
  } = useAppointmentHistory();
  const [resendingDeliveryId, setResendingDeliveryId] = useState<number | null>(null);
  const rows = useMemo<Row[]>(
    () =>
      appointments.map((appointment) => ({
        id: appointment.id,
        customer: appointment.customer.fullname ?? "Unknown customer",
        service: appointment.service.name ?? "Unknown service",
        barber: appointment.barber.fullname ?? "Unknown barber",
        date: formatDate(appointment.appointment_date),
        time: formatTime12(appointment.appointment_time),
        status: appointment.status,
        price: Number(appointment.price) || 0,
        discountAmount: Number(appointment.discount_amount ?? 0),
        discountLabel: Number(appointment.discount_amount ?? 0) > 0 ? "Discount" : null,
        addOns: appointment.add_ons ?? [],
        cancellation_reason: appointment.cancellation_reason,
        emailDelivery: appointment.latest_email_delivery ?? null,
      })),
    [appointments],
  );

  async function resendEmail(deliveryId: number) {
    setResendingDeliveryId(deliveryId);
    try {
      await resendBookingEmail(deliveryId);
      toast.success("Email sent successfully.");
      await refresh();
    } catch (resendError) {
      toast.error(resendError instanceof Error ? resendError.message : "Could not resend the email.");
    } finally {
      setResendingDeliveryId(null);
    }
  }

  return (
    <div className="w-full h-full bg-slate-100 p-4 sm:p-6 pb-12 sm:pb-10 font-sans">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Schedule History</h1>
        <p className="text-gray-500 mt-1">
          Final outcomes are ordered by last updated, latest first
        </p>
      </div>

      <SectionCard title="Filters" className="mb-4 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by reference, customer, service, barber"
            className="w-full sm:w-3/4"
            maxLength={100}
          />
          <Select
            value={status}
            onValueChange={(value) =>
              setStatus(value as AppointmentHistoryStatusFilter)
            }
          >
            <SelectTrigger className="w-full sm:w-1/4 border-gray-300">
              <SelectValue placeholder="All Final Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Final Statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="no_show">No-show</SelectItem>
              <SelectItem value="walkin">Walk-in</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      <div className="space-y-3" aria-busy={loading || refreshing}>
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        ) : null}
        <div className="block md:hidden space-y-3">
          {loading ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center text-gray-400 text-sm">
              Loading bookings...
            </div>
          ) : rows.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center text-gray-400 text-sm">
              No bookings found.
            </div>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900 text-sm">
                    {formatBookingId(row.id)}
                  </span>
                  <AppointmentStatusBadge status={row.status} />
                </div>
                <p className="text-sm text-gray-900 font-medium">{row.customer}</p>
                <p className="text-xs text-gray-500">
                  {row.barber} · {row.service}
                </p>
                {row.addOns.length > 0 ? (
                  <p className="text-xs text-red-600">
                    Add-ons: {row.addOns.map((addOn) => addOn.name).filter(Boolean).join(", ")}
                  </p>
                ) : null}
                <p className="text-xs text-gray-500">
                  {row.date} · {row.time}
                </p>
                {row.discountLabel && <p className="text-xs text-green-700">{row.discountLabel}: −₱{row.discountAmount.toFixed(2)}</p>}
                {row.emailDelivery ? (
                  <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                    <span className="capitalize">
                      {row.emailDelivery.type.replaceAll("_", " ")} email: {row.emailDelivery.status}
                    </span>
                    {row.emailDelivery.status === "failed" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={resendingDeliveryId === row.emailDelivery.id}
                        onClick={() => void resendEmail(row.emailDelivery!.id)}
                      >
                        {resendingDeliveryId === row.emailDelivery.id ? "Resending..." : "Resend"}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                  <span className="text-sm font-semibold text-gray-900">
                    ₱{row.price.toFixed(2)}
                  </span>
                  {row.cancellation_reason ? (
                    <span className="text-xs text-red-500 truncate max-w-[150px]" title={row.cancellation_reason}>
                      {row.cancellation_reason}
                    </span>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Barber</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell className="text-gray-500" colSpan={8}>
                    Loading appointments...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell className="text-gray-500" colSpan={8}>
                    No bookings found.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id} className="group relative">
                    <TableCell>{formatBookingId(row.id)}</TableCell>
                    <TableCell>{row.customer}</TableCell>
                    <TableCell>{row.barber}</TableCell>
                    <TableCell>
                      <div>{row.service}</div>
                      {row.addOns.length > 0 ? (
                        <div className="mt-1 text-xs text-red-600">
                          + {row.addOns.map((addOn) => addOn.name).filter(Boolean).join(", ")}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>{row.time}</TableCell>
                    <TableCell><div>₱{row.price.toFixed(2)}</div>{row.discountLabel && <div className="mt-1 text-xs text-green-700">{row.discountLabel}: −₱{row.discountAmount.toFixed(2)}</div>}</TableCell>
                    <TableCell>
                      <div className="relative inline-block">
                        <AppointmentStatusBadge status={row.status} />
                        <div className="pointer-events-auto absolute left-1/2 top-full z-20 mt-2 hidden w-max max-w-72 -translate-x-1/2 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 shadow-md group-hover:block">
                          <p className="capitalize">
                            Email: {row.emailDelivery?.status ?? "Not sent"}
                          </p>
                          {row.cancellation_reason ? (
                            <p className="mt-1 text-red-600">
                              Reason: {row.cancellation_reason}
                            </p>
                          ) : null}
                          {row.emailDelivery?.status === "failed" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-2 h-7 px-2 text-xs"
                              disabled={resendingDeliveryId === row.emailDelivery.id}
                              onClick={() => void resendEmail(row.emailDelivery!.id)}
                            >
                              {resendingDeliveryId === row.emailDelivery.id ? "Resending..." : "Resend"}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {meta ? (
          <TablePagination
            currentPage={meta.current_page}
            lastPage={meta.last_page}
            getPageHref={getPageHref}
            onPageChange={setPage}
            disabled={loading}
          />
        ) : null}

        <div className="h-5" />
      </div>
    </div>
  );
}
