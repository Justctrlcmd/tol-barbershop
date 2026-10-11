<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\BookingEmailDelivery;
use App\Models\FeedbackToken;
use App\Support\DisplayId;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Str;

class AppointmentNotificationService
{
    public function __construct(private readonly BookingEmailService $emailService) {}

    public function notifyStatus(
        Appointment $appointment,
        string $status,
        ?int $createdByUserId = null,
    ): ?BookingEmailDelivery {
        $appointment->loadMissing(['bookingCustomer', 'barber', 'service', 'addOns']);
        if (! $appointment->bookingCustomer
            || blank($this->recipientEmail($appointment))
            || ! in_array($status, ['confirmed', 'rejected', 'cancelled', 'completed'], true)) {
            return null;
        }

        $copy = $this->statusCopy($appointment, $status);
        $ratingUrl = $status === 'completed' ? $this->ratingUrl($appointment) : null;
        if ($ratingUrl) {
            $copy['actionText'] = 'Rate Your Visit';
            $copy['actionUrl'] = $ratingUrl;
            $copy['footer'] = 'This private rating link expires in 30 days and can only be used once.';
        }

        return $this->emailService->createAndSend(
            $appointment,
            $status,
            $copy,
            $createdByUserId,
        );
    }

    public function notifyRescheduled(
        Appointment $appointment,
        ?int $createdByUserId = null,
    ): ?BookingEmailDelivery {
        $appointment->loadMissing(['bookingCustomer', 'barber', 'service', 'addOns']);
        if (! $appointment->bookingCustomer
            || blank($this->recipientEmail($appointment))) {
            return null;
        }

        return $this->emailService->createAndSend(
            $appointment,
            'rescheduled',
            [
                'subject' => 'Your TOL Barbershop booking was rescheduled',
                'heading' => 'Schedule Updated',
                'customerName' => $appointment->bookingCustomer->fullname,
                'intro' => 'Your booking schedule has been updated by the barbershop.',
                'highlight' => DisplayId::booking($appointment->id),
                'details' => $this->details($appointment),
                'footer' => 'Please use this updated schedule and arrive about five minutes early.',
            ],
            $createdByUserId,
        );
    }

    public function notifyGroupStatus(
        Collection $appointments,
        string $status,
        ?int $createdByUserId = null,
    ): ?BookingEmailDelivery {
        if ($appointments->isEmpty()) {
            return null;
        }

        $appointments->loadMissing(['bookingCustomer', 'barber', 'service', 'addOns']);
        $first = $appointments->first();
        if (! $first?->bookingCustomer
            || blank($this->recipientEmail($first))) {
            return null;
        }

        $heading = match ($status) {
            'confirmed' => 'Group Booking Confirmed',
            'rejected' => 'Group Booking Rejected',
            'cancelled' => 'Group Booking Cancelled',
            default => 'Group Booking Updated',
        };
        $intro = match ($status) {
            'confirmed' => 'Your group booking has been confirmed by the barbershop.',
            'rejected' => 'The barbershop could not confirm your group booking request.',
            'cancelled' => 'Your group booking has been cancelled.',
            default => 'Your group booking status has been updated.',
        };

        $details = [
            'Reference' => DisplayId::group($first->id),
            'Date' => $first->appointment_date->format('F j, Y'),
            'Barber' => $first->barber?->fullname ?? '—',
            'Bookings' => (string) $appointments->count(),
            'Total' => '₱'.number_format((float) $appointments->sum('price'), 2),
        ];
        if (in_array($status, ['rejected', 'cancelled'], true) && filled($first->cancellation_reason)) {
            $details['Reason'] = $first->cancellation_reason;
        }

        return $this->emailService->createAndSend(
            $first,
            $status,
            [
                'subject' => "TOL Barbershop: {$heading}",
                'heading' => $heading,
                'customerName' => $first->bookingCustomer->fullname,
                'intro' => $intro,
                'details' => $details,
                'footer' => $status === 'confirmed'
                    ? 'Please arrive about five minutes before the earliest booking.'
                    : 'Contact TOL Barbershop if you need assistance.',
            ],
            $createdByUserId,
            $first->batch_id,
        );
    }

    private function statusCopy(Appointment $appointment, string $status): array
    {
        $heading = match ($status) {
            'confirmed' => 'Booking Confirmed',
            'rejected' => 'Booking Rejected',
            'cancelled' => 'Booking Cancelled',
            'completed' => 'Booking Completed',
            'no_show' => 'Booking Marked No-Show',
            default => 'Booking Updated',
        };
        $intro = match ($status) {
            'confirmed' => 'Your booking has been confirmed by the barbershop.',
            'rejected' => 'The barbershop could not confirm your booking request.',
            'cancelled' => 'Your booking has been cancelled.',
            'completed' => 'Thank you for visiting TOL Barbershop. Your booking is complete.',
            'no_show' => 'Your booking was marked as a no-show.',
            default => 'Your booking status has been updated.',
        };
        $details = $this->details($appointment);
        if (in_array($status, ['rejected', 'cancelled'], true) && filled($appointment->cancellation_reason)) {
            $details['Reason'] = $appointment->cancellation_reason;
        }

        return [
            'subject' => "TOL Barbershop: {$heading}",
            'heading' => $heading,
            'customerName' => $appointment->bookingCustomer?->fullname ?? 'there',
            'intro' => $intro,
            'highlight' => DisplayId::booking($appointment->id),
            'details' => $details,
            'footer' => $status === 'confirmed'
                ? 'Please arrive about five minutes early.'
                : 'Contact TOL Barbershop if you need assistance.',
        ];
    }

    private function details(Appointment $appointment): array
    {
        $details = [
            'Service' => $appointment->service?->name ?? '—',
            'Barber' => $appointment->barber?->fullname ?? '—',
            'Date' => $appointment->appointment_date->format('F j, Y'),
            'Time' => Carbon::createFromFormat('H:i', substr((string) $appointment->appointment_time, 0, 5))->format('g:i A'),
            'Total' => '₱'.number_format((float) $appointment->price, 2),
        ];

        if ($appointment->addOns->isNotEmpty()) {
            $details['Add-ons'] = $appointment->addOns
                ->map(fn ($addOn): string => $addOn->name_snapshot.' (₱'.number_format((float) $addOn->price, 2).')')
                ->implode(', ');
        }

        if ((float) $appointment->discount_amount > 0) {
            $details['Subtotal'] = '₱'.number_format((float) $appointment->subtotal, 2);
            $details['Discount'] = '−₱'.number_format((float) $appointment->discount_amount, 2);
        }

        return $details;
    }

    private function ratingUrl(Appointment $appointment): ?string
    {
        if ($appointment->batch_id) {
            $batch = Appointment::query()->where('batch_id', $appointment->batch_id)->get();
            if ($batch->contains(fn (Appointment $item): bool => $item->status !== 'completed')) {
                return null;
            }

            $existing = FeedbackToken::query()->where('batch_id', $appointment->batch_id)->first();
            if ($existing) {
                return null;
            }
        } elseif (FeedbackToken::query()->where('appointment_id', $appointment->id)->exists()) {
            return null;
        }

        $plainToken = Str::random(64);
        FeedbackToken::create([
            'token_hash' => hash('sha256', $plainToken),
            'booking_customer_id' => $appointment->booking_customer_id,
            'appointment_id' => $appointment->batch_id ? null : $appointment->id,
            'batch_id' => $appointment->batch_id,
            'expires_at' => now()->addDays(30),
        ]);

        return rtrim((string) config('app.frontend_url'), '/').'/feedback?token='.$plainToken;
    }

    private function recipientEmail(Appointment $appointment): ?string
    {
        if ($appointment->booking_source === 'staff_assisted') {
            return filled($appointment->customer_email_snapshot)
                ? $appointment->customer_email_snapshot
                : null;
        }

        return $appointment->customer_email_snapshot ?? $appointment->bookingCustomer?->email;
    }
}
