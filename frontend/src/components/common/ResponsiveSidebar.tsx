"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CalendarDays,
  LogOut,
  Menu,
  MoreHorizontal,
  UserRound,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import { PushNotificationControl } from "@/components/common/PushNotificationControl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { sanitizeString } from "@/lib/sanitizer";
import { cn } from "@/lib/utils";

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

type ResponsiveSidebarProps = {
  sections: NavSection[];
  mobileMode?: "drawer" | "desktop-only";
};

export function ResponsiveSidebar({
  sections,
  mobileMode = "drawer",
}: ResponsiveSidebarProps) {
  const pathname = usePathname();
  const { logout, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(
    {},
  );
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const hasMobileDrawer = mobileMode === "drawer";

  const isCurrentPath = (href: string) => {
    const isRoleRoot = href === "/admin" || href === "/manager";
    return pathname === href || (!isRoleRoot && pathname.startsWith(`${href}/`));
  };

  const isItemActive = (item: NavItem) =>
    isCurrentPath(item.href) ||
    item.children?.some((child) => isCurrentPath(child.href));

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const sidebar = document.getElementById("mobile-sidebar");
      const backdrop = document.getElementById("sidebar-backdrop");
      const hamburger = document.getElementById("hamburger-button");

      if (
        isOpen &&
        isMobile &&
        sidebar &&
        !sidebar.contains(target) &&
        backdrop &&
        !backdrop.contains(target) &&
        hamburger &&
        !hamburger.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    if (hasMobileDrawer && isOpen && isMobile) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [hasMobileDrawer, isOpen, isMobile]);

  useEffect(() => {
    if (!showAccountMenu) return;

    const closeAccountMenu = (event: MouseEvent) => {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target as Node)
      ) {
        setShowAccountMenu(false);
      }
    };

    document.addEventListener("mousedown", closeAccountMenu);
    return () => document.removeEventListener("mousedown", closeAccountMenu);
  }, [showAccountMenu]);

  useEffect(() => {
    if (hasMobileDrawer && isOpen && isMobile) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [hasMobileDrawer, isOpen, isMobile]);

  const schedulesItem = sections
    .flatMap((section) => section.items)
    .find((item) => item.key === "appointment");

  const handleNavClick = () => {
    setShowAccountMenu(false);
    if (isMobile) {
      setIsOpen(false);
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      await logout();
    } catch {
      setIsLoggingOut(false);
      toast.error("Logout failed. Please try again.");
    }
  };

  return (
    <>
      {hasMobileDrawer && (
        <header className="fixed inset-x-0 top-0 z-50 flex h-[calc(4rem+env(safe-area-inset-top))] items-center border-b border-gray-200 bg-white px-4 pt-[env(safe-area-inset-top)] md:hidden">
          <button
            id="hamburger-button"
            type="button"
            onClick={() => setIsOpen(true)}
            className="flex size-9 items-center justify-center rounded-md text-primary transition-colors hover:bg-gray-100"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>

          <Link
            href={`/${user?.role ?? "manager"}`}
            prefetch={false}
            className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap text-sm font-semibold text-primary"
          >
            <Image
              src="/tol-rounded-logo.png"
              alt=""
              aria-hidden="true"
              height={22}
              width={22}
              className="rounded-md"
            />
            <span>TOL Barbershop</span>
          </Link>

          {schedulesItem ? (
            <Link
              href={schedulesItem.href}
              prefetch={false}
              onClick={handleNavClick}
              className="relative ml-auto flex size-9 items-center justify-center rounded-md text-primary transition-colors hover:bg-gray-100"
              aria-label={`Open schedules${schedulesItem.badgeCount ? ` (${schedulesItem.badgeCount} pending)` : ""}`}
            >
              <CalendarDays className="size-5" />
              {schedulesItem.badgeCount && schedulesItem.badgeCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 py-0.5 text-[9px] font-semibold leading-none text-white ring-2 ring-white">
                  {schedulesItem.badgeCount > 99 ? "99+" : schedulesItem.badgeCount}
                </span>
              ) : null}
            </Link>
          ) : (
            <span className="ml-auto size-9" aria-hidden="true" />
          )}
        </header>
      )}

      {hasMobileDrawer && isOpen && isMobile && (
        <div
          id="sidebar-backdrop"
          className="md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        id="mobile-sidebar"
        className={cn(
          "fixed left-0 top-0 z-50 flex h-dvh w-64 shrink-0 flex-col bg-primary text-sm transition-[width,transform] duration-300 ease-in-out md:sticky md:z-10",
          isCollapsed ? "md:w-20" : "md:w-64",
          hasMobileDrawer
            ? isOpen
              ? "translate-x-0"
              : "-translate-x-full md:translate-x-0"
            : "hidden md:flex md:translate-x-0",
        )}
      >
        <button
          type="button"
          onClick={() => {
            setIsCollapsed((current) => !current);
            setShowAccountMenu(false);
          }}
          className="absolute -right-3 top-5 z-20 hidden size-6 items-center justify-center rounded-full border border-slate-600 bg-primary text-primary-foreground shadow-md transition-colors hover:bg-slate-800 md:flex"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="size-3.5" />
          ) : (
            <ChevronLeft className="size-3.5" />
          )}
        </button>

        <div
          className={cn(
            "flex items-center justify-between border-b border-slate-600 p-4",
            isCollapsed && "md:justify-center",
          )}
        >
          <div className="flex items-center space-x-2">
            <Image
              src="/tol-rounded-logo.png"
              alt="TOL Barbershop logo"
              height={35}
              width={35}
              className="rounded-3xl shadow-md shadow-black/20"
            />
            <h1
              className={cn(
                "whitespace-nowrap text-xl font-bold text-primary-foreground",
                isCollapsed && "md:hidden",
              )}
            >
              TOL Barbershop
            </h1>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="md:hidden p-2 rounded-lg hover:bg-slate-800 text-primary-foreground transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav
          className={cn(
            "flex-1 overflow-y-auto p-4 overscroll-contain",
            isCollapsed && "md:px-3",
          )}
        >
          {sections.map((section) => (
            <div key={section.label} className="mb-4 last:mb-0">
              <p
                className={cn(
                  "px-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400",
                  isCollapsed && "md:sr-only",
                )}
              >
                {section.label}
              </p>
              <div className="flex flex-col gap-1">
                {section.items.map((item) => {
                  const active = isItemActive(item);
                  const expanded = expandedItems[item.key] ?? Boolean(active);

                  if (item.children?.length) {
                    return (
                      <div key={item.key}>
                        <button
                          type="button"
                          onClick={() =>
                            isCollapsed && !isMobile
                              ? setIsCollapsed(false)
                              : setExpandedItems((current) => ({
                                  ...current,
                                  [item.key]: !expanded,
                                }))
                          }
                          aria-expanded={expanded}
                          title={isCollapsed ? item.label : undefined}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left transition-colors md:relative",
                            isCollapsed && "md:justify-center md:px-0",
                            active
                              ? "bg-slate-800 text-white"
                              : "text-gray-300 hover:bg-slate-800 hover:text-white",
                          )}
                        >
                          <item.icon className="size-5 shrink-0" />
                          <span
                            className={cn(
                              "flex-1",
                              isCollapsed && "md:sr-only",
                            )}
                          >
                            {item.label}
                          </span>
                          <span className={cn(isCollapsed && "md:hidden")}>
                            {expanded ? (
                              <ChevronUp className="size-4 shrink-0" />
                            ) : (
                              <ChevronDown className="size-4 shrink-0" />
                            )}
                          </span>
                        </button>

                        {expanded && (
                          <div
                            className={cn(
                              "ml-6 mt-1 flex flex-col gap-1 border-l border-slate-600 pl-3",
                              isCollapsed && "md:hidden",
                            )}
                          >
                            {item.children.map((child) => (
                              <Link
                                key={child.key}
                                href={child.href}
                                prefetch={false}
                                onClick={handleNavClick}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors",
                                  isCurrentPath(child.href)
                                    ? "bg-slate-800 text-white"
                                    : "text-gray-400 hover:bg-slate-800 hover:text-white",
                                )}
                              >
                                <child.icon className="size-4 shrink-0" />
                                <span className="flex-1">{child.label}</span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      prefetch={false}
                      onClick={handleNavClick}
                      title={isCollapsed ? item.label : undefined}
                      className={cn(
                        "relative flex w-full items-center gap-3 rounded-lg px-4 py-2.5 transition-colors",
                        isCollapsed && "md:justify-center md:px-0",
                        active
                          ? "bg-slate-800 text-white"
                          : "text-gray-300 hover:bg-slate-800 hover:text-white",
                      )}
                    >
                      <item.icon className="size-5 shrink-0" />
                      <span
                        className={cn(
                          "flex-1",
                          isCollapsed && "md:sr-only",
                        )}
                      >
                        {item.label}
                      </span>
                      {item.badgeCount && item.badgeCount > 0 ? (
                        <span
                          className={cn(
                            "ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white",
                            isCollapsed &&
                              "md:absolute md:-right-1 md:-top-1 md:size-4 md:min-w-4 md:px-1 md:text-[9px]",
                          )}
                        >
                          {item.badgeCount > 99 ? "99+" : item.badgeCount}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div
          ref={accountMenuRef}
          className="relative border-t border-slate-600 p-3"
        >
          {showAccountMenu && (
            <div
              className={cn(
                "absolute bottom-full mb-2 overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-800 shadow-xl",
                isCollapsed
                  ? "inset-x-3 md:bottom-0 md:left-full md:right-auto md:ml-2 md:w-64"
                  : "inset-x-3",
              )}
            >
              <Link
                href={`/${user?.role ?? "manager"}/profile`}
                prefetch={false}
                onClick={handleNavClick}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
              >
                <UserRound className="size-5 shrink-0" />
                <span>Profile</span>
              </Link>
              <div className="border-t border-gray-200">
                <PushNotificationControl variant="account-menu" />
              </div>
              <div className="border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowAccountMenu(false);
                    setShowLogoutDialog(true);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-red-600 transition-colors hover:bg-red-50"
                >
                  <LogOut className="size-5 shrink-0" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowAccountMenu((current) => !current)}
            aria-expanded={showAccountMenu}
            aria-label="Open account menu"
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-white transition-colors hover:bg-slate-800",
              isCollapsed && "md:justify-center md:px-0",
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-500 bg-slate-700 text-xs font-semibold uppercase">
              {sanitizeString(user?.fullname ?? "Staff")
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1",
                isCollapsed && "md:hidden",
              )}
            >
              <span className="block truncate font-semibold">
                {sanitizeString(user?.fullname ?? "Staff")}
              </span>
              <span className="block capitalize text-xs text-gray-400">
                {sanitizeString(user?.role ?? "staff")}
              </span>
            </span>
            <MoreHorizontal
              className={cn(
                "size-5 shrink-0 text-gray-400",
                isCollapsed && "md:hidden",
              )}
            />
          </button>
        </div>
      </aside>

      <Dialog
        open={showLogoutDialog}
        onOpenChange={(open) => {
          if (!isLoggingOut) setShowLogoutDialog(open);
        }}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Confirm Logout</DialogTitle>
            <DialogDescription>
              Are you sure you want to log out of your account?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowLogoutDialog(false)}
              disabled={isLoggingOut}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? "Logging out..." : "Logout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
