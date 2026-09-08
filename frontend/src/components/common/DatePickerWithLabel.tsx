"use client";

import { useMemo, useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getClosedDates } from "@/services/manager/close.date.api";

const formatDateToLocal = (date: Date): string => {
  return (
    date.getFullYear() +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0")
  );
};

const formatDateForDisplay = (date: Date): string =>
  date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

type DatePickerWithLabelProps = {
  id: string;
  label: string;
  placeholder?: string;
  date?: Date;
  onDateChange?: (date: Date | undefined) => void;
  disablePastDates?: boolean;
  maxDaysAhead?: number;
  disableSundays?: boolean;
  disabled?: boolean;
  barberId?: number;
  closedDates?: string[];
  isDateDisabled?: (date: Date) => boolean;
};

export function DatePickerWithLabel({
  id,
  label,
  placeholder = "Select date",
  date,
  onDateChange,
  disablePastDates = false,
  maxDaysAhead,
  disableSundays = true,
  disabled = false,
  barberId,
  closedDates: providedClosedDates,
  isDateDisabled,
}: DatePickerWithLabelProps) {
  const [open, setOpen] = useState(false);
  const [fetchedClosedDates, setFetchedClosedDates] = useState<string[]>([]);
  const closedDates = providedClosedDates ?? fetchedClosedDates;

  const selectedDate = date;

  const { today, maxDate } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const max = maxDaysAhead !== undefined ? new Date(start) : undefined;
    if (max && maxDaysAhead !== undefined) {
      max.setDate(start.getDate() + maxDaysAhead);
    }

    return { today: start, maxDate: max };
  }, [maxDaysAhead]);

  useEffect(() => {
    if (providedClosedDates) {
      return;
    }

    const fetchClosedDates = async () => {
      try {
        const response = await getClosedDates(
          1,
          100,
          barberId ? "availability" : "shop",
          barberId,
        );
        if (response && response.data) {
          const dates = response.data.map(
            (closedDate) => closedDate.date_closed,
          );
          setFetchedClosedDates(dates);
        }
      } catch (error) {
        console.error("Error fetching closed dates:", error);
      }
    };

    fetchClosedDates();
  }, [barberId, providedClosedDates]);

  function handleDateSelect(nextDate: Date | undefined) {
    if (!nextDate) return;
    onDateChange?.(nextDate);
    setOpen(false);
  }

  return (
    <div className="grid w-full gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Popover
        open={disabled ? false : open}
        onOpenChange={(nextOpen) => {
          if (disabled) {
            setOpen(false);
            return;
          }
          setOpen(nextOpen);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full bg-white py-5 justify-between border-gray-300 px-3 font-normal"
          >
            <span
              className={
                selectedDate ? "text-foreground" : "text-muted-foreground"
              }
            >
              {selectedDate ? formatDateForDisplay(selectedDate) : placeholder}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0 max-w-[calc(100vw-2rem)]">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleDateSelect}
            disabled={
              disabled ||
              ((day) => {
                const isPast = disablePastDates && day < today;
                const isAfterMax = maxDate && day > maxDate;
                const isSunday = disableSundays && day.getDay() === 0;

                const dayString = formatDateToLocal(day);
                const isClosedDate = closedDates.includes(dayString);
                const isDisabledBySchedule = isDateDisabled?.(day) ?? false;

                return isPast || isAfterMax || isSunday || isClosedDate || isDisabledBySchedule;
              })
            }
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
