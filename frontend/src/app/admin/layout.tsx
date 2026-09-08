"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRealtimeEvent } from "@/contexts/RealtimeContext";
import {
  BarChart3,
  Calendar,
  Clock3,
  Contact,
  History,
  Images,
  LayoutDashboard,
  MessageSquareText,
  Scissors,
  Settings,
  UserPlus,
} from "lucide-react";
import { ResponsiveSidebar } from "@/components/common/ResponsiveSidebar";
import { NotificationPrompt } from "@/components/common/NotificationPrompt";
import { toast } from "sonner";
import { useRoleRoutePersistence } from "@/hooks/useRoleRoutePersistence";
import { useAuth } from "@/contexts/AuthContext";
import { getNavigationSummary } from "@/services/shared/navigation.api";

type NavItem = {
  key: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badgeCount?: number;
  children?: NavItem[];
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const navSections = [
  {
    label: "Overview",
    items: [
      { key: "dashboard", href: "/admin", icon: LayoutDashboard, label: "Dashboard" },
    ],
  },
  {
    label: "Operations",
    items: [
      { key: "appointment", href: "/admin/appointment", icon: Calendar, label: "Schedules" },
      { key: "walkin", href: "/admin/walkin", icon: UserPlus, label: "Walkin" },
      { key: "history", href: "/admin/history", icon: History, label: "History" },
      { key: "crm", href: "/admin/customers", icon: Contact, label: "Customers" },
      {
        key: "management",
        href: "/admin/management",
        icon: Settings,
        label: "Management",
        children: [
          { key: "management-services", href: "/admin/management/services", icon: Scissors, label: "Services & Add-ons" },
          { key: "management-barbers", href: "/admin/management/barbers", icon: UserPlus, label: "Barbers" },
          { key: "management-schedule", href: "/admin/management/booking-schedule", icon: Clock3, label: "Booking Schedule" },
          { key: "management-gallery", href: "/admin/management/gallery", icon: Images, label: "Gallery" },
        ],
      },
    ],
  },
  {
    label: "Analytics",
    items: [
      { key: "reports", href: "/admin/reports", icon: BarChart3, label: "Reports" },
      { key: "feedback", href: "/admin/feedback", icon: MessageSquareText, label: "Feedback" },
    ],
  },
 ] satisfies NavSection[];
const navItems = navSections.flatMap((section) => section.items);
const noPermissions: string[] = [];

const matchesPath = (item: NavItem, pathname: string): boolean =>
  item.href === "/admin"
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);

const findRequiredPermission = (
  items: NavItem[],
  pathname: string,
): string | undefined => {
  for (const item of items) {
    const childPermission = item.children
      ? findRequiredPermission(item.children, pathname)
      : undefined;
    if (childPermission) return childPermission;
    if (matchesPath(item, pathname)) return item.key;
  }
  return undefined;
};

const hasPathPermission = (
  items: NavItem[],
  pathname: string,
  permissions: string[],
  parentGranted = false,
): boolean | undefined => {
  for (const item of items) {
    const granted = parentGranted || permissions.includes(item.key);
    if (item.children?.some((child) => matchesPath(child, pathname))) {
      return hasPathPermission(item.children, pathname, permissions, granted);
    }
    if (matchesPath(item, pathname)) return granted;
  }
  return undefined;
};

const findFallbackPath = (
  items: NavItem[],
  permissions: string[],
): string | undefined => {
  for (const item of items) {
    const inheritedPermission = permissions.includes(item.key);
    if (item.children) {
      const childPath = findFallbackPath(item.children, permissions);
      if (childPath) return childPath;
    }
    if (inheritedPermission || !item.children?.length) {
      if (permissions.includes(item.key)) return item.href;
    }
  }
  return undefined;
};

const filterNavItem = (
  item: NavItem,
  permissions: string[],
  parentGranted = false,
): NavItem | null => {
  const granted = parentGranted || permissions.includes(item.key);
  const children = item.children
    ?.map((child) => filterNavItem(child, permissions, granted))
    .filter((child): child is NavItem => child !== null);

  if (!granted && (!children || children.length === 0)) return null;

  return children ? { ...item, children } : item;
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useRoleRoutePersistence("/admin");
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const prevCountRef = useRef(0);
  const isFirstLoadRef = useRef(true);
  const permissions = user?.permissions ?? noPermissions;
  const fallbackPath = findFallbackPath(navItems, permissions);
  const requiredPermission = findRequiredPermission(navItems, pathname);
  const hasRequiredPermission = hasPathPermission(navItems, pathname, permissions);
  const canViewAppointments = permissions.includes("appointment");

  useEffect(() => {
    if (isLoading || user?.role !== "admin" || !requiredPermission) return;
    if (hasRequiredPermission !== false) return;

    if (fallbackPath) router.replace(fallbackPath);
  }, [
    fallbackPath,
    isLoading,
    permissions,
    requiredPermission,
    hasRequiredPermission,
    router,
    user?.role,
  ]);

  const fetchSummary = useCallback(async (signal?: AbortSignal, force = false) => {
    try {
      const summary = await getNavigationSummary(signal, force);
      const pendingAppointments = summary.pending_appointments ?? 0;

      if (!isFirstLoadRef.current && pendingAppointments > prevCountRef.current) {
        const diff = pendingAppointments - prevCountRef.current;
        toast(`${diff} New Pending Booking${diff > 1 ? "s" : ""}`, {
          description: `A customer has submitted a new booking request.`,
          action: {
            label: "View",
            onClick: () => router.push("/admin/appointment"),
          },
          duration: 8000,
        });
      }
      isFirstLoadRef.current = false;
      prevCountRef.current = pendingAppointments;
      setPendingCount(pendingAppointments);

    } catch {}
  }, [router]);

  useEffect(() => {
    if (!canViewAppointments) return;

    const controller = new AbortController();
    queueMicrotask(() => void fetchSummary(controller.signal, false));

    const onAppointmentsUpdated = () => fetchSummary();
    window.addEventListener("appointments:updated", onAppointmentsUpdated);

    return () => {
      controller.abort();
      window.removeEventListener("appointments:updated", onAppointmentsUpdated);
    };
  }, [canViewAppointments, fetchSummary]);

  useRealtimeEvent("appointments", fetchSummary, canViewAppointments);

  const sections = navSections
    .map((section) => ({
      ...section,
      items: section.items
        .map((item) => filterNavItem(item, permissions))
        .filter((item): item is NavItem => item !== null),
    }))
    .filter((section) => section.items.length > 0)
    .map((section) => ({
      ...section,
      items: section.items.map((item) => {
        if (item.key === "appointment") return { ...item, badgeCount: pendingCount };
        return item;
      }),
    }));

  if (
    !isLoading &&
    user?.role === "admin" &&
    permissions.length === 0 &&
    pathname !== "/admin/profile"
  ) {
    return (
      <div className="flex h-dvh overflow-hidden">
        <ResponsiveSidebar sections={[]} />
        <main className="flex min-h-0 flex-1 items-center justify-center bg-gray-100 p-6 text-center">
          <div className="max-w-md rounded-xl border bg-white p-6 shadow-sm">
            <h1 className="text-lg font-semibold text-gray-900">
              No modules assigned
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Ask a manager to assign the modules required for your role.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (
    !isLoading &&
    requiredPermission &&
    hasRequiredPermission === false
  ) {
    return null;
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <ResponsiveSidebar sections={sections} />
      <main className="min-h-0 flex-1 overflow-y-auto bg-gray-100 md:pl-0 pt-[calc(4rem+env(safe-area-inset-top))] md:pt-0 pb-[calc(5rem+env(safe-area-inset-bottom))] overscroll-contain">
        {children}
        <NotificationPrompt />
      </main>
    </div>
  );
}
