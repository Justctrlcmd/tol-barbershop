"use client";

import { useId, useState } from "react";

import { InputWithLabel } from "@/components/common/InputWithLabel";
import { Button } from "@/components/ui/button";
import { getDiscountError } from "@/validations/discount.validation";

type Props = {
  value: number;
  onChange: (amount: number) => void;
  subtotal: number;
  disabled?: boolean;
};

export function DiscountInput({ value, onChange, subtotal, disabled }: Props) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const error = getDiscountError(value, subtotal);

  if (!expanded && !value) {
    return <Button type="button" variant="outline" disabled={disabled} onClick={() => setExpanded(true)}>Add Discount</Button>;
  }

  return (
    <fieldset disabled={disabled} className="space-y-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">Discount</legend>
      <InputWithLabel
        id={id}
        label="Discount amount (₱)"
        type="number"
        inputMode="decimal"
        min={0}
        max={subtotal}
        step="0.01"
        placeholder="Enter amount"
        value={value || ""}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && <p id={`${id}-error`} className="text-sm text-destructive">{error}</p>}
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { onChange(0); setExpanded(false); }}>Remove Discount</Button>
    </fieldset>
  );
}
