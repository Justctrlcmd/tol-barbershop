"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, isValid, parseISO } from "date-fns";

type DateRange = { from: Date | undefined; to: Date | undefined };

type ReportDateRangePickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (startDate: string, endDate: string) => void;
  initialFrom?: string;
  initialTo?: string;
  maxDate?: string;
};

function formatDateValue(d: Date | undefined): string {
  if (!d || !isValid(d)) return "";
  return format(d, "yyyy-MM-dd");
}

function formatDateDisplay(d: Date | undefined): string {
  if (!d || !isValid(d)) return "";
  return format(d, "MMM dd, yyyy");
}

const PRESETS = [
  { label: "Today", getRange: (today: Date) => ({ from: new Date(today), to: new Date(today) }) },
  { label: "Last 7 days", getRange: (today: Date) => { const start = new Date(today); start.setDate(start.getDate() - 6); return { from: start, to: new Date(today) }; } },
  { label: "Last 4 weeks", getRange: (today: Date) => { const start = new Date(today); start.setDate(start.getDate() - 27); return { from: start, to: new Date(today) }; } },
  { label: "This month", getRange: (today: Date) => ({ from: new Date(today.getFullYear(), today.getMonth(), 1), to: new Date(today) }) },
  { label: "Previous month", getRange: (today: Date) => ({ from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: new Date(today.getFullYear(), today.getMonth(), 0) }) },
];

function DateRangePickerContent({
  onOpenChange,
  onSelect,
  initialFrom,
  initialTo,
  maxDate,
}: Omit<ReportDateRangePickerProps, "open">) {
  const [range, setRange] = useState<DateRange>({
    from: initialFrom ? parseISO(initialFrom) : undefined,
    to: initialTo ? parseISO(initialTo) : undefined,
  });

  const today = maxDate ? parseISO(maxDate) : new Date();
  const hasValidRange = Boolean(
    range.from
      && range.to
      && isValid(range.from)
      && isValid(range.to)
      && range.from <= range.to
      && range.to <= today,
  );

  const handleApply = useCallback(() => {
    if (!hasValidRange) return;
    onSelect(formatDateValue(range.from), formatDateValue(range.to));
    onOpenChange(false);
  }, [hasValidRange, range, onSelect, onOpenChange]);

  const handleClear = useCallback(() => {
    setRange({ from: undefined, to: undefined });
  }, []);

  const dateRangeDisplay = (() => {
    if (range.from && range.to && isValid(range.from) && isValid(range.to)) {
      return `${formatDateDisplay(range.from)} – ${formatDateDisplay(range.to)}`;
    }
    if (range.from && isValid(range.from)) {
      return `${formatDateDisplay(range.from)} – Select end date`;
    }
    return "Select start date, then end date";
  })();

  return (
    <DialogContent className="grid max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-[580px]">
      <DialogHeader className="px-4 py-4 pr-12 sm:px-5 sm:pr-12">
        <DialogTitle>Select Date Range</DialogTitle>
        <DialogDescription>{dateRangeDisplay}</DialogDescription>
      </DialogHeader>

      <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <div className="flex min-w-0 justify-center">
            <Calendar
              mode="range"
              selected={range}
              onSelect={(selected) => {
                if (selected) {
                  setRange({ from: selected.from, to: selected.to });
                }
              }}
              numberOfMonths={1}
              min={1}
              resetOnSelect
              disabled={(date) => date > today}
              className="max-w-full rounded-md border-0 [--cell-size:--spacing(8)] sm:[--cell-size:--spacing(9)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant="outline"
                size="sm"
                className="min-h-9 justify-start text-xs last:col-span-2 sm:min-h-0 sm:last:col-span-1 sm:text-sm"
                onClick={() => setRange(preset.getRange(today))}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-border bg-muted/30 px-4 py-3 sm:px-5">
        <Button variant="ghost" size="sm" className="min-h-9 px-3 sm:min-h-0" onClick={handleClear}>
          Clear
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="min-h-9 px-3 sm:min-h-0" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="min-h-9 px-3 sm:min-h-0" disabled={!hasValidRange} onClick={handleApply}>
            Apply
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

export function ReportDateRangePicker({
  open,
  onOpenChange,
  onSelect,
  initialFrom,
  initialTo,
  maxDate,
}: ReportDateRangePickerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DateRangePickerContent
          onOpenChange={onOpenChange}
          onSelect={onSelect}
          initialFrom={initialFrom}
          initialTo={initialTo}
          maxDate={maxDate}
        />
      )}
    </Dialog>
  );
}
