"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { sanitizeString } from "@/lib/sanitizer";
import type { PublicAddOn } from "@/services/public-booking.api";

type Props = {
  addOns: PublicAddOn[];
  selected: number[];
  onChange: (ids: number[]) => void;
};

export function PublicBookingAddOns({ addOns, selected, onChange }: Props) {
  if (!addOns.length) return null;

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">Add-ons <span className="font-normal text-muted-foreground">(optional)</span></legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {addOns.map((item) => (
          <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-background p-3 text-sm">
            <Checkbox checked={selected.includes(item.id)} onCheckedChange={(checked) => onChange(checked === true ? [...selected.filter((id) => id !== item.id), item.id] : selected.filter((id) => id !== item.id))} />
            <span className="min-w-0 flex-1 break-words">{sanitizeString(item.name)}</span>
            <span className="shrink-0 font-medium">₱{Number(item.price).toFixed(2)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
