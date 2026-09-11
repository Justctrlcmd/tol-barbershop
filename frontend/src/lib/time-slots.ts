export type TimeOption = {
  value: string;
  label: string;
};

type OccupiedTimeSlot = {
  appointment_time: string;
  duration_minutes: number;
};

function timeToMinutes(value: string): number | null {
  const twelveHour = value.match(/^(\d{1,2}):([0-5]\d)\s(AM|PM)$/i);
  if (twelveHour) {
    let hours = Number(twelveHour[1]) % 12;
    if (twelveHour[3].toUpperCase() === "PM") hours += 12;
    return hours * 60 + Number(twelveHour[2]);
  }

  const twentyFourHour = value.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!twentyFourHour) return null;

  return Number(twentyFourHour[1]) * 60 + Number(twentyFourHour[2]);
}

export function isTimeSlotUnavailable(
  appointmentTime: string,
  durationMinutes: number,
  occupiedSlots: OccupiedTimeSlot[],
  explicitOpenSlotTimes: string[] = [],
): boolean {
  const start = timeToMinutes(appointmentTime);
  if (start === null) return true;

  const isExplicitOpenSlot = explicitOpenSlotTimes.some(
    (time) => timeToMinutes(time) === start,
  );
  const hasBookingAtSameStartTime = occupiedSlots.some(
    (slot) => timeToMinutes(slot.appointment_time) === start,
  );

  if (isExplicitOpenSlot && !hasBookingAtSameStartTime) return false;

  const end = start + Math.max(1, durationMinutes);

  return occupiedSlots.some((slot) => {
    const occupiedStart = timeToMinutes(slot.appointment_time);
    if (occupiedStart === null) return true;

    const occupiedEnd = occupiedStart + Math.max(1, slot.duration_minutes);
    return start < occupiedEnd && end > occupiedStart;
  });
}

export function generateTimeOptions(
  openingTime: string,
  closingTime: string,
  intervalMinutes: number,
  customOpenTime?: string,
): TimeOption[] {
  const options: TimeOption[] = [];
  const [openH, openM] = openingTime.split(":").map(Number);
  const [closeH, closeM] = closingTime.split(":").map(Number);

  let currentMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  while (currentMinutes <= closeMinutes) {
    const hours = Math.floor(currentMinutes / 60);
    const mins = currentMinutes % 60;
    const period = hours >= 12 ? "PM" : "AM";
    const displayH = hours % 12 || 12;

    if (hours === 12 && mins === 0 && customOpenTime) {
      const customMinutes = timeToMinutes(customOpenTime);
      if (customMinutes !== null) {
        const customHours = Math.floor(customMinutes / 60);
        const customMins = customMinutes % 60;
        const customPeriod = customHours >= 12 ? "PM" : "AM";
        const customDisplayHour = customHours % 12 || 12;
        const customValue = `${customDisplayHour}:${String(customMins).padStart(2, "0")} ${customPeriod}`;
        options.push({ value: customValue, label: customValue });
        currentMinutes += intervalMinutes;
        continue;
      }
    }

    const value = `${displayH}:${String(mins).padStart(2, "0")} ${period}`;
    options.push({ value, label: value });
    currentMinutes += intervalMinutes;
  }

  return options;
}

export function formatTime12(time24: string | null | undefined): string {
  if (!time24) return "\u2014";
  const date = new Date(`1970-01-01T${time24}`);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
