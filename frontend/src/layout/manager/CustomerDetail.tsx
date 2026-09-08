"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getCustomerDetail,
  type CustomerDetail as CustomerDetailType,
} from "@/services/manager/customers.api";
import { SectionCard } from "@/components/common/SectionCard";
import { StatCard } from "@/components/common/StatCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Calendar,
  Star,
  Clock,
  Phone,
  Mail,
  User,
  CheckCircle2,
} from "lucide-react";
import { formatTime12 } from "@/lib/time-slots";

function formatDate(date: string | null): string {
  if (!date) return "\u2014";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    completed: {
      label: "Completed",
      className: "bg-green-100 text-green-700",
    },
    confirmed: {
      label: "Confirmed",
      className: "bg-blue-100 text-blue-700",
    },
    pending: {
      label: "Pending",
      className: "bg-yellow-100 text-yellow-700",
    },
    cancelled: {
      label: "Cancelled",
      className: "bg-red-100 text-red-700",
    },
    no_show: {
      label: "No-show",
      className: "bg-gray-200 text-gray-600",
    },
    rejected: {
      label: "Rejected",
      className: "bg-red-100 text-red-700",
    },
  };

  const c = config[status] ?? {
    label: status,
    className: "bg-gray-100 text-gray-600",
  };

  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", c.className)}
    >
      {c.label}
    </span>
  );
}

function InlineBar({
  label,
  count,
  percentage,
  maxPercentage,
  color,
}: {
  label: string;
  count: number;
  percentage: number;
  maxPercentage: number;
  color: string;
}) {
  const width = maxPercentage > 0 ? (percentage / maxPercentage) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-700 w-28 sm:w-36 truncate shrink-0">
        {label}
      </span>
      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${width}%`, minWidth: percentage > 0 ? "16px" : "0" }}
        />
      </div>
      <span className="text-sm font-medium text-gray-700 w-16 text-right shrink-0">
        {count}
      </span>
      <span className="text-xs text-gray-400 w-10 text-right shrink-0">
        {percentage}%
      </span>
    </div>
  );
}

type CustomerDetailProps = {
  id: string;
}

export function CustomerDetail({ id }: CustomerDetailProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerDetailType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCustomer = async () => {
      setLoading(true);
      try {
        const data = await getCustomerDetail(Number(id));
        setCustomer(data);
      } catch (error) {
        console.error("Failed to load customer:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomer();
  }, [id]);

  if (loading) {
    return (
      <div className="w-full h-full bg-slate-100 p-4 sm:p-6 pb-12 sm:pb-10 font-sans">
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
          Loading customer details...
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="w-full h-full bg-slate-100 p-4 sm:p-6 pb-12 sm:pb-10 font-sans">
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
          Customer not found.
        </div>
      </div>
    );
  }

  const maxServicePct = customer.service_preferences.length > 0
    ? Math.max(...customer.service_preferences.map((s) => s.percentage))
    : 0;

  const maxBarberPct = customer.barber_preferences.length > 0
    ? Math.max(...customer.barber_preferences.map((b) => b.percentage))
    : 0;

  const totalAppts =
    customer.completed_count +
    customer.no_show_count +
    customer.cancelled_count;

  const colorPalette = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-teal-500",
  ];

  return (
    <div className="w-full h-full bg-slate-100 p-4 sm:p-6 pb-12 sm:pb-10 font-sans">
      <button
        onClick={() =>
          router.push(
            pathname.startsWith("/admin/")
              ? "/admin/customers"
              : "/manager/customers",
          )
        }
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Customers
      </button>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6 mb-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-lg font-bold text-blue-700 shrink-0">
            {customer.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2  justify-between">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                {customer.fullname}
              </h1>
              <span
              className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", customer.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}
              >
                {customer.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-1 text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {customer.email ?? "No email"}
              </div>
              <div className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                {customer.contact_number ?? "No contact number"}
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                First booking record {customer.registered_date}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard
          label="Total Visits"
          value={customer.completed_count.toLocaleString()}
          icon={CheckCircle2}
          iconContainerClassName="bg-green-100"
          iconClassName="text-green-500"
          size="sm"
        />
        <StatCard
          label="Lifetime Value"
          value={formatCurrency(customer.lifetime_value)}
          icon={User}
          iconContainerClassName="bg-blue-100"
          iconClassName="text-blue-500"
          size="sm"
        />
        <StatCard
          label="Avg Rating"
          value={customer.average_rating !== null ? `${customer.average_rating}\u2605` : "\u2014"}
          icon={Star}
          iconContainerClassName="bg-yellow-100"
          iconClassName="text-yellow-500"
          size="sm"
        />
        <StatCard
          label="Last Visit"
          value={formatDate(customer.last_visit_date)}
          icon={Clock}
          iconContainerClassName="bg-purple-100"
          iconClassName="text-purple-500"
          size="sm"
        />
      </div>

      <SectionCard title="Booking Breakdown" className="mb-4">
        <div className="grid grid-cols-3 gap-4 mt-2">
          <div className="text-center p-3 bg-green-50 rounded-xl">
            <p className="text-2xl font-bold text-green-700">
              {customer.completed_count}
            </p>
            <p className="text-xs text-green-600 mt-0.5">Completed</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-xl">
            <p className="text-2xl font-bold text-gray-600">
              {customer.no_show_count}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">No-show</p>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-xl">
            <p className="text-2xl font-bold text-red-600">
              {customer.cancelled_count}
            </p>
            <p className="text-xs text-red-500 mt-0.5">Cancelled</p>
          </div>
        </div>
        {totalAppts > 0 && (
          <div className="flex gap-4 mt-3 text-xs text-gray-500 justify-center">
            <span>
              No-show rate:{" "}
              <span className="font-medium text-gray-700">{customer.no_show_rate}%</span>
            </span>
            <span>
              Cancellation rate:{" "}
              <span className="font-medium text-gray-700">{customer.cancellation_rate}%</span>
            </span>
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <SectionCard title="Service Preferences">
          {customer.service_preferences.length > 0 ? (
            <div className="space-y-2 mt-3">
              {customer.service_preferences.map((pref, idx) => (
                <InlineBar
                  key={pref.service_name}
                  label={pref.service_name}
                  count={pref.count}
                  percentage={pref.percentage}
                  maxPercentage={maxServicePct}
                  color={colorPalette[idx % colorPalette.length]}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 mt-3">No completed bookings yet.</p>
          )}
        </SectionCard>

        <SectionCard title="Barber Preferences">
          {customer.barber_preferences.length > 0 ? (
            <div className="space-y-2 mt-3">
              {customer.barber_preferences.map((pref, idx) => (
                <InlineBar
                  key={pref.barber_name}
                  label={pref.barber_name}
                  count={pref.count}
                  percentage={pref.percentage}
                  maxPercentage={maxBarberPct}
                  color={colorPalette[idx % colorPalette.length]}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 mt-3">No completed bookings yet.</p>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Last 3 Recent Bookings">
        {customer.recent_appointments.length > 0 ? (
          <>
            <div className="hidden md:block mt-3 overflow-x-auto">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead>Barber</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customer.recent_appointments.map((appt) => (
                    <TableRow key={appt.id}>
                      <TableCell className="text-gray-600">
                        {appt.barber_name}
                      </TableCell>
                      <TableCell className="text-gray-700">
                        {appt.service_name}
                      </TableCell>
                      <TableCell className="text-gray-700 whitespace-nowrap">
                        {appt.appointment_date}
                      </TableCell>
                      <TableCell className="text-gray-600 whitespace-nowrap">
                        {formatTime12(appt.appointment_time)}
                      </TableCell>
                      <TableCell className="text-gray-700 font-medium">
                        {formatCurrency(appt.price)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={appt.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="block md:hidden space-y-3 mt-3">
              {customer.recent_appointments.map((appt) => (
                <div
                  key={appt.id}
                  className="bg-gray-50 rounded-xl border border-gray-100 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">
                      Booking
                    </span>
                    <StatusBadge status={appt.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                    <div>
                      <span className="block text-gray-400">Barber</span>
                      {appt.barber_name}
                    </div>
                    <div>
                      <span className="block text-gray-400">Service</span>
                      {appt.service_name}
                    </div>
                    <div>
                      <span className="block text-gray-400">Date</span>
                      {appt.appointment_date}
                    </div>
                    <div>
                      <span className="block text-gray-400">Time</span>
                      {formatTime12(appt.appointment_time)}
                    </div>
                    <div>
                      <span className="block text-gray-400">Price</span>
                      <span className="font-medium text-gray-700">{formatCurrency(appt.price)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400 mt-3">No bookings yet.</p>
        )}
      </SectionCard>
      <div className="h-10" />
    </div>
    
  );
  
}
