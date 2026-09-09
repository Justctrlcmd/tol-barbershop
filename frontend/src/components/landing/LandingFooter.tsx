"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Mail, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  getPublicOpeningHours,
  type PublicOpeningHours,
} from "@/services/public-booking.api";

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const DEFAULT_OPENING_HOURS: PublicOpeningHours = {
  open_day_from: 1,
  open_day_to: 6,
  closed_weekdays: [],
  opening_time: "09:00",
  closing_time: "19:00",
};

type OpeningHoursRow = {
  days: string;
  hours: string;
};

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`;
}

function formatDayRange(start: number, end: number): string {
  const firstDay = WEEKDAYS[start - 1];
  const lastDay = WEEKDAYS[end - 1];

  return start === end ? firstDay : `${firstDay} - ${lastDay}`;
}

function getOpeningHoursRows(settings: PublicOpeningHours): OpeningHoursRow[] {
  const standardHours = `${formatTime(settings.opening_time)} - ${formatTime(settings.closing_time)}`;
  const closedWeekdays = WEEKDAYS
    .map((_, index) => index + 1)
    .filter(
      (weekday) =>
        weekday < settings.open_day_from ||
        weekday > settings.open_day_to ||
        settings.closed_weekdays.includes(weekday),
    );
  const closedRanges = closedWeekdays.reduce<
    Array<{ start: number; end: number }>
  >((ranges, weekday) => {
    const previous = ranges.at(-1);
    if (previous && weekday === previous.end + 1) {
      previous.end = weekday;
    } else {
      ranges.push({ start: weekday, end: weekday });
    }

    return ranges;
  }, []);

  return [
    {
      days: formatDayRange(settings.open_day_from, settings.open_day_to),
      hours: standardHours,
    },
    ...closedRanges.map(({ start, end }) => ({
      days: formatDayRange(start, end),
      hours: "Closed",
    })),
  ];
}

export function LandingFooter() {
  const [openingHours, setOpeningHours] = useState(DEFAULT_OPENING_HOURS);
  const openingHoursRows = useMemo(
    () => getOpeningHoursRows(openingHours),
    [openingHours],
  );

  useEffect(() => {
    let isCurrent = true;

    void getPublicOpeningHours()
      .then((settings) => {
        if (isCurrent) setOpeningHours(settings);
      })
      .catch(() => undefined);

    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <footer
      id="contact"
      className="flex flex-col border-y border-white/10 bg-primary text-white "
    >
      <div className="grid md:grid-cols-3 grid-cols-1 px-6 sm:px-8 lg:px-10 xl:px-32 py-12 gap-8 sm:gap-12">
        <div className="flex flex-col">
          <div className="flex items-center gap-3 mb-5 ">
            <Image
              src="/tol-rounded-logo.png"
              alt="TOL Barbershop logo"
              height={35}
              width={35}
              className="rounded-3xl shadow-md shadow-black/20"
            />
            <p className="text-xl font-semibold ">TOL Barbershop</p>
          </div>
          <p className="text-sm">
            Where traditional barbering meets modern style. May barbero kana,
            may Ka-TOL ka pa!
          </p>
          <div className="mt-5 flex items-center gap-3">
            <a
              href="https://www.facebook.com/profile.php?id=61550652631553"
              target="_blank"
              rel="noreferrer"
              aria-label="TOL Barbershop on Facebook"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white hover:border-accent hover:text-accent transition-colors"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M22 12.06C22 6.48 17.52 2 11.94 2S2 6.48 2 12.06c0 5.02 3.66 9.19 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.23.2 2.23.2v2.46h-1.25c-1.24 0-1.62.77-1.62 1.56v1.89h2.76l-.44 2.91h-2.32V22C18.34 21.25 22 17.08 22 12.06Z" />
              </svg>
            </a>
            <a
              href="https://www.instagram.com/tolbarbershop/?hl=en"
              target="_blank"
              rel="noreferrer"
              aria-label="TOL Barbershop on Instagram"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white hover:border-accent hover:text-accent transition-colors"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <rect width="18" height="18" x="3" y="3" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle
                  cx="17.5"
                  cy="6.5"
                  r="1"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
            </a>
          </div>
        </div>

        <div className="flex flex-col space-y-5 ">
          <p className="text-xl font-semibold mb-5">Contact Us</p>
          <div className="flex items-center space-x-3">
            <Mail />
            <a
              href="mailto:ofcl.tolbarbershop@gmail.com"
              className="text-sm hover:text-accent transition-colors"
            >
              ofcl.tolbarbershop@gmail.com
            </a>
          </div>

          <div className="flex items-start space-x-3">
            <MapPin size={50} />
            <p className="text-sm">
              2nd floor, Osrem Building, Gen Trias Drive, Tejero, Gen Trias
              City, Cavite (in front of Petron crossing)
            </p>
          </div>
        </div>

        <div className="flex flex-col">
          <p className="text-xl font-semibold mb-5">Opening Hours</p>

          {openingHoursRows.map((row, index) => (
            <div
              key={`${row.days}-${row.hours}`}
              className={cn(
                "flex justify-between gap-4 pb-4",
                index > 0 && "border-t border-white/10 pt-4",
              )}
            >
              <p className="text-sm">{row.days}</p>
              <p className="text-right text-sm">{row.hours}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 px-6 sm:px-8 py-4 border-t border-white/10 bg-black/10 text-center">
        <p className="text-sm text-neutral">
          &copy; 2026 TOL Barbershop. All rights reserved.
        </p>
        <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-1 sm:text-sm text-xs">
          <Link href="/privacy-policy" prefetch={false} className="text-neutral hover:text-white">
            Privacy Policy
          </Link>
          <Link href="/terms-of-use" prefetch={false} className="text-neutral hover:text-white">
            Terms of Use
          </Link>
        </div>
      </div>
    </footer>
  );
}
