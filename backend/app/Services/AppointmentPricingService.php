<?php

namespace App\Services;

use App\Models\ServiceAddOn;
use Illuminate\Validation\ValidationException;

class AppointmentPricingService
{
    public function completion(float $subtotal, float $amount, ?int $staffId): array
    {
        if ($amount < 0 || $amount > round($subtotal, 2)) {
            throw ValidationException::withMessages(['discount_amount' => 'The discount must be between zero and the booking total.']);
        }

        return [
            'subtotal' => round($subtotal, 2),
            'discount_type' => $amount > 0 ? 'custom' : null,
            'discount_amount' => round($amount, 2),
            'discount_applied_by_user_id' => $amount > 0 ? $staffId : null,
            'price' => round($subtotal - $amount, 2),
        ];
    }

    public function publicAddOns(array $appointments): array
    {
        $ids = collect($appointments)->flatMap(fn (array $slot) => $slot['add_on_ids'] ?? [])
            ->unique()->sort()->values();
        $addOns = ServiceAddOn::whereIn('id', $ids)->where('is_active', true)
            ->orderBy('id')->lockForUpdate()->get()->keyBy('id');

        return collect($appointments)->map(function (array $slot, int $index) use ($addOns): array {
            $selected = $slot['add_on_ids'] ?? [];
            if (count($selected) !== count(array_unique($selected))) {
                throw ValidationException::withMessages(["appointments.{$index}.add_on_ids" => 'Select each add-on once.']);
            }

            return collect($selected)->map(function (int $id) use ($addOns, $index): array {
                $addOn = $addOns->get($id);
                if (! $addOn) {
                    throw ValidationException::withMessages(["appointments.{$index}.add_on_ids" => 'A selected add-on is no longer available.']);
                }

                return [
                    'service_add_on_id' => $addOn->id,
                    'name_snapshot' => $addOn->name,
                    'price' => $addOn->price,
                ];
            })->all();
        })->all();
    }
}
