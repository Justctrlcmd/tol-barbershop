<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AppointmentResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     */
    public function toArray(Request $request): array
    {
        $barber = [
            'id' => $this->barber?->id,
            'fullname' => $this->barber_name_snapshot ?? $this->barber?->fullname,
        ];

        if (in_array($request->user()?->role, ['admin', 'manager'], true)) {
            $barber['email'] = $this->barber?->email;
            $barber['contact_number'] = $this->barber?->contact_number;
        }

        return [
            'id' => $this->id,

            'customer' => [
                'id' => $this->is_walkin ? null : $this->bookingCustomer?->id,
                'fullname' => $this->resource->customerDisplayName(),
                'email' => $this->is_walkin
                    ? null
                    : ($this->customer_email_snapshot ?? $this->bookingCustomer?->email),
                'contact_number' => $this->is_walkin
                    ? $this->walkin_customer_contact_number
                    : ($this->customer_contact_number_snapshot ?? $this->bookingCustomer?->contact_number),
            ],

            'barber' => $barber,

            'service' => [
                'id' => $this->service?->id,
                'name' => $this->service_name_snapshot ?? $this->service?->name,
            ],

            'add_ons' => $this->whenLoaded('addOns', fn () => $this->addOns->map(
                fn ($addOn): array => [
                    'id' => $addOn->id,
                    'add_on_id' => $addOn->service_add_on_id,
                    'name' => $addOn->name_snapshot ?? $addOn->serviceAddOn?->name,
                    'price' => $addOn->price,
                ],
            )->values()),

            'feedback' => $this->whenLoaded('feedback', fn () => [
                'id' => $this->feedback?->id,
                'rating' => $this->feedback?->rating,
                'comment' => $this->feedback?->comment,
                'submitted_at' => $this->feedback?->created_at,
            ]),

            'appointment_date' => $this->appointment_date->format('Y-m-d'),
            'appointment_time' => $this->appointment_time,
            'duration_minutes' => $this->duration_minutes,

            'price' => $this->price,
            'subtotal' => $this->subtotal ?? $this->price,
            'discount_type' => $this->discount_type,
            'discount_amount' => $this->discount_amount,
            'discount_applied_by_user_id' => $this->discount_applied_by_user_id,
            'status' => $this->status,
            'is_walkin' => (bool) $this->is_walkin,
            'booking_source' => $this->booking_source,
            'batch_id' => $this->batch_id,
            'customer_name' => $this->customer_name,
            'customer_name_snapshot' => $this->customer_name_snapshot,
            'service_name_snapshot' => $this->service_name_snapshot,
            'barber_name_snapshot' => $this->barber_name_snapshot,

            'notes' => $this->notes,
            'cancellation_reason' => $this->cancellation_reason,

            'confirmed_at' => $this->confirmed_at,
            'completed_at' => $this->completed_at,
            'cancelled_at' => $this->cancelled_at,
            'rejected_at' => $this->rejected_at,

            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'latest_email_delivery' => $this->whenLoaded('emailDeliveries', function () {
                $delivery = $this->emailDeliveries->sortByDesc('created_at')->first();

                return $delivery ? [
                    'id' => $delivery->id,
                    'type' => $delivery->type,
                    'status' => $delivery->status,
                    'attempts' => $delivery->attempts,
                    'sent_at' => $delivery->sent_at,
                    'failed_at' => $delivery->failed_at,
                ] : null;
            }),
        ];
    }
}
