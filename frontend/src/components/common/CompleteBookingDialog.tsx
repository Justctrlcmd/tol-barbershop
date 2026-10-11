"use client";

import { useState } from "react";

import { DiscountInput } from "@/components/common/DiscountInput";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sanitizeString } from "@/lib/sanitizer";
import { formatTime12 } from "@/lib/time-slots";
import { getDiscountError } from "@/validations/discount.validation";
import type { Appointment } from "@/services/shared/appointment.api";

type Props = {
  appointment: Appointment;
  onClose: () => void;
  onConfirm: (discount: number) => Promise<boolean>;
};

export function CompleteBookingDialog({ appointment, onClose, onConfirm }: Props) {
  const [discount, setDiscount] = useState(0);
  const [busy, setBusy] = useState(false);
  const subtotal = Number(appointment.price);
  const addOnTotal = (appointment.add_ons ?? []).reduce((sum, item) => sum + Number(item.price), 0);
  const discountError = getDiscountError(discount, subtotal);

  async function complete() {
    if (busy || discountError) return;
    setBusy(true);
    try {
      if (await onConfirm(discount)) onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Complete Booking</DialogTitle>
          <DialogDescription>Review the amount to collect before completing this booking.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1 text-sm">
          <p className="font-semibold">{sanitizeString(appointment.customer.fullname ?? "Customer")}</p>
          <p className="text-muted-foreground">{sanitizeString(appointment.barber.fullname ?? "")} · {appointment.appointment_date} · {formatTime12(appointment.appointment_time)}</p>
        </div>
        <div className="space-y-2 rounded-lg border border-border p-3 text-sm" aria-live="polite">
          <div className="flex justify-between gap-3"><span>{sanitizeString(appointment.service.name ?? "Haircut")}</span><span>₱{(subtotal - addOnTotal).toFixed(2)}</span></div>
          {(appointment.add_ons ?? []).map((item) => <div key={item.id} className="flex justify-between gap-3 text-muted-foreground"><span>{sanitizeString(item.name ?? "Add-on")}</span><span>₱{Number(item.price).toFixed(2)}</span></div>)}
          <div className="flex justify-between border-t border-border pt-2"><span>Subtotal</span><span>₱{subtotal.toFixed(2)}</span></div>
          {discount > 0 && <div className="flex justify-between text-green-700 dark:text-green-400"><span>Discount</span><span>−₱{discount.toFixed(2)}</span></div>}
          <div className="flex justify-between border-t border-border pt-2 font-semibold"><span>Amount to collect</span><span>₱{Math.max(0, subtotal - discount).toFixed(2)}</span></div>
        </div>
        <DiscountInput value={discount} onChange={setDiscount} subtotal={subtotal} disabled={busy} />
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={busy || Boolean(discountError)} onClick={() => void complete()}>{busy ? "Completing..." : "Complete Booking"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
