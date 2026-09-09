import type { PublicOpeningHours } from "@/services/public-booking.api";

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const DEFAULT_OPENING_HOURS: PublicOpeningHours = {
  open_day_from: 1,
  open_day_to: 6,
  closed_weekdays: [],
  opening_time: "09:00",
  closing_time: "19:00",
};

export type OpeningHoursRow = {
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

export function getOpeningHoursRows(
  settings: PublicOpeningHours,
): OpeningHoursRow[] {
  const standardHours = `${formatTime(settings.opening_time)} - ${formatTime(settings.closing_time)}`;
  const ranges: Array<{ start: number; end: number; hours: string }> = [];

  for (let weekday = 1; weekday <= 7; weekday++) {
    const isOpen =
      weekday >= settings.open_day_from &&
      weekday <= settings.open_day_to &&
      !settings.closed_weekdays.includes(weekday);
    const hours = isOpen ? standardHours : "Closed";
    const previous = ranges.at(-1);

    if (previous?.hours === hours) {
      previous.end = weekday;
    } else {
      ranges.push({ start: weekday, end: weekday, hours });
    }
  }

  return ranges.map(({ start, end, hours }) => ({
    days: formatDayRange(start, end),
    hours,
  }));
}
