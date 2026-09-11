<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\BookingCustomer;
use App\Models\ClosedDates;
use App\Models\Service;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Validation\ValidationException;
use Throwable;

class AppointmentBookingService
{
    public const ACTIVE_STATUSES = ['pending', 'confirmed'];

    public const HISTORY_STATUSES = ['completed', 'cancelled', 'rejected', 'no_show'];

    public const MAX_PENDING_APPOINTMENTS_PER_CUSTOMER = 11;

    public const STAFF_REVIEW_GROUP_SLOT_THRESHOLD = 5;

    private const STATUS_TRANSITIONS = [
        'pending' => ['confirmed', 'cancelled', 'rejected'],
        'confirmed' => ['completed', 'cancelled', 'no_show'],
        'completed' => [],
        'cancelled' => [],
        'no_show' => [],
        'rejected' => [],
    ];

    public function __construct(private readonly BookingScheduleService $scheduleService) {}

    /**
     * @param  array<int, array{service_id: int, appointment_time: string}>  $slots
     * @param  array<int, int>  $ignoreAppointmentIds
     * @return array{barber: User, customer: BookingCustomer|null, services: Collection<int, Service>}
     */
    public function validateAndLock(
        ?int $customerId,
        int $barberUserId,
        string $appointmentDate,
        array $slots,
        int $pendingAppointmentsToAdd = 0,
        array $ignoreAppointmentIds = [],
    ): array {
        $date = $this->parseBookingDate($appointmentDate);
        $singleSlot = count($slots) === 1;
        $parsedSlots = collect($slots)->map(function (array $slot, int $index) use ($date, $singleSlot): array {
            $field = $singleSlot ? 'appointment_time' : "appointments.{$index}.appointment_time";
            $startMinutes = $this->parseSlotTime($slot['appointment_time'], $field);
            $scheduledAt = $date->setTime(intdiv($startMinutes, 60), $startMinutes % 60);

            if ($scheduledAt->addMinutes(15)->lt(CarbonImmutable::now($this->shopTimezone()))) {
                throw ValidationException::withMessages([
                    $field => 'The booking time cannot be in the past.',
                ]);
            }

            return [
                'service_id' => (int) $slot['service_id'],
                'appointment_time' => $slot['appointment_time'],
                'start_minutes' => $startMinutes,
                'field' => $field,
            ];
        });

        $resources = $this->lockActiveResources(
            $customerId,
            $barberUserId,
            $parsedSlots->pluck('service_id')->all(),
        );

        if ($pendingAppointmentsToAdd > 0 && $resources['customer']) {
            $pendingCount = Appointment::where('booking_customer_id', $customerId)
                ->where('status', 'pending')
                ->count();

            if ($pendingCount + $pendingAppointmentsToAdd > self::MAX_PENDING_APPOINTMENTS_PER_CUSTOMER) {
                throw ValidationException::withMessages([
                    'appointments' => sprintf(
                        'A customer may have at most %d pending bookings.',
                        self::MAX_PENDING_APPOINTMENTS_PER_CUSTOMER,
                    ),
                ]);
            }
        }

        $this->assertDateAvailableAndLock($barberUserId, $appointmentDate);

        $allowedTimes = $this->scheduleService->startTimesFor($appointmentDate, $barberUserId);
        if ($allowedTimes === []) {
            throw ValidationException::withMessages([
                'appointment_date' => 'The selected date is not available for booking.',
            ]);
        }

        foreach ($parsedSlots as $slot) {
            if (! in_array($this->scheduleService->normalizeTime($slot['appointment_time']), $allowedTimes, true)) {
                throw ValidationException::withMessages([
                    $slot['field'] => 'The selected start time is not available.',
                ]);
            }
        }

        $ignoreAppointmentIds = collect($ignoreAppointmentIds)
            ->map(fn (int|string $id): int => (int) $id)
            ->filter()
            ->values()
            ->all();

        $existingAppointments = Appointment::with('service:id,duration')
            ->where('barber_user_id', $barberUserId)
            ->where('appointment_date', '>=', $appointmentDate)
            ->where('appointment_date', '<', $date->addDay()->toDateString())
            ->whereIn('status', self::ACTIVE_STATUSES)
            ->whereNotNull('active_slot_key')
            ->when(
                $ignoreAppointmentIds !== [],
                fn ($query) => $query->whereNotIn('id', $ignoreAppointmentIds),
            )
            ->orderBy('appointment_time')
            ->lockForUpdate()
            ->get();

        $explicitOpenSlotTimes = $this->scheduleService->openSlotTimesFor(
            $appointmentDate,
            $barberUserId,
            true,
        );

        $occupiedIntervals = $existingAppointments->map(function (Appointment $appointment): array {
            $startMinutes = $this->minutesFromStoredTime((string) $appointment->appointment_time);
            $duration = max(1, (int) ($appointment->duration_minutes ?? $appointment->service?->duration ?? 60));

            return [
                'start' => $startMinutes,
                'end' => $startMinutes + $duration,
            ];
        })->all();

        foreach ($parsedSlots as $slot) {
            $service = $resources['services']->get($slot['service_id']);
            $start = $slot['start_minutes'];
            $end = $start + max(1, (int) $service->duration);
            $isExplicitOpenSlot = in_array(
                $this->scheduleService->normalizeTime($slot['appointment_time']),
                $explicitOpenSlotTimes,
                true,
            );
            $hasBookingAtSameStartTime = collect($occupiedIntervals)
                ->contains(fn (array $occupied): bool => $occupied['start'] === $start);

            if (! $isExplicitOpenSlot || $hasBookingAtSameStartTime) {
                foreach ($occupiedIntervals as $occupied) {
                    if ($start < $occupied['end'] && $end > $occupied['start']) {
                        $time12 = CarbonImmutable::parse($slot['appointment_time'])->format('g:i A');
                        throw ValidationException::withMessages([
                            $slot['field'] => "The time slot {$time12} overlaps another booking.",
                        ]);
                    }
                }
            }

            $occupiedIntervals[] = ['start' => $start, 'end' => $end];
        }

        return $resources;
    }

    /**
     * @param  array<int, int>  $serviceIds
     * @return array{barber: User, customer: BookingCustomer|null, services: Collection<int, Service>}
     */
    public function lockActiveResources(?int $customerId, int $barberUserId, array $serviceIds): array
    {
        $users = $this->lockUsers([$barberUserId]);
        $barber = $users->get($barberUserId);

        if (! $barber || $barber->role !== 'barber' || ! (bool) $barber->is_active) {
            throw ValidationException::withMessages([
                'barber_user_id' => 'The selected barber is not active.',
            ]);
        }

        $customer = $customerId
            ? BookingCustomer::query()->whereKey($customerId)->lockForUpdate()->first()
            : null;
        if ($customerId && ! $customer) {
            throw ValidationException::withMessages([
                'booking_customer_id' => 'The selected customer is not available.',
            ]);
        }

        $serviceIds = collect($serviceIds)
            ->map(fn (int|string $id): int => (int) $id)
            ->unique()
            ->sort()
            ->values();
        $services = Service::whereIn('id', $serviceIds)
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->keyBy('id');

        foreach ($serviceIds as $serviceId) {
            $service = $services->get($serviceId);

            if (! $service || ! $service->is_active || (int) $service->duration < 1) {
                throw ValidationException::withMessages([
                    'service_id' => 'The selected service is not active.',
                ]);
            }
        }

        return [
            'barber' => $barber,
            'customer' => $customer,
            'services' => $services,
        ];
    }

    /**
     * @param  array<int, int|string|null>  $userIds
     * @return Collection<int, User>
     */
    public function lockUsers(array $userIds): Collection
    {
        $userIds = collect($userIds)
            ->filter(fn ($id): bool => $id !== null)
            ->map(fn (int|string $id): int => (int) $id)
            ->unique()
            ->sort()
            ->values();

        if ($userIds->isEmpty()) {
            return new Collection;
        }

        return User::whereIn('id', $userIds)
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->keyBy('id');
    }

    public function assertCreatableStatus(string $status): void
    {
        if (! in_array($status, self::ACTIVE_STATUSES, true)) {
            throw ValidationException::withMessages([
                'status' => 'Invalid booking status.',
            ]);
        }
    }

    public function assertValidStatusTransition(string $currentStatus, string $nextStatus): void
    {
        if ($currentStatus === $nextStatus) {
            return;
        }

        if (! in_array($nextStatus, self::STATUS_TRANSITIONS[$currentStatus] ?? [], true)) {
            throw ValidationException::withMessages([
                'status' => 'This booking cannot be changed to that status.',
            ]);
        }
    }

    public function assertNotFutureTerminal(string $appointmentDate, string $appointmentTime, string $status): void
    {
        if (! in_array($status, ['completed', 'no_show'], true)) {
            return;
        }

        try {
            $scheduledAt = CarbonImmutable::createFromFormat(
                '!Y-m-d H:i',
                $appointmentDate.' '.substr($appointmentTime, 0, 5),
                $this->shopTimezone(),
            );
        } catch (Throwable) {
            $scheduledAt = false;
        }

        $today = CarbonImmutable::now($this->shopTimezone())->toDateString();

        if (! $scheduledAt || $scheduledAt->toDateString() > $today) {
            throw ValidationException::withMessages([
                'status' => 'This booking has not happened yet and cannot be marked as completed.',
            ]);
        }
    }

    public function activeSlotKey(int $barberUserId, string $appointmentDate, string $appointmentTime): string
    {
        return $barberUserId.'|'.$appointmentDate.'|'.substr($appointmentTime, 0, 5);
    }

    public function requiresStaffReviewBeforeReservation(array $slots): bool
    {
        return count($slots) >= self::STAFF_REVIEW_GROUP_SLOT_THRESHOLD;
    }

    public function assertDateAvailableAndLock(int $barberUserId, string $appointmentDate): void
    {
        $closure = ClosedDates::query()
            ->where('date_closed', $appointmentDate)
            ->where('is_removed', false)
            ->where(function ($query) use ($barberUserId): void {
                $query
                    ->where('closure_scope', 'shop')
                    ->orWhere(function ($barberQuery) use ($barberUserId): void {
                        $barberQuery
                            ->where('closure_scope', 'barber')
                            ->where('barber_user_id', $barberUserId);
                    });
            })
            ->lockForUpdate()
            ->first(['closure_scope']);

        if (! $closure) {
            return;
        }

        $message = $closure->closure_scope === 'barber'
            ? 'The selected barber is not working on this date.'
            : 'The barbershop is closed on the selected date.';

        throw ValidationException::withMessages([
            'appointment_date' => $message,
        ]);
    }

    private function parseBookingDate(string $value): CarbonImmutable
    {
        try {
            $date = CarbonImmutable::createFromFormat('!Y-m-d', $value, $this->shopTimezone());
        } catch (Throwable) {
            $date = false;
        }

        if (! $date || $date->format('Y-m-d') !== $value) {
            throw ValidationException::withMessages([
                'appointment_date' => 'The booking date must use the Y-m-d format.',
            ]);
        }

        $today = CarbonImmutable::today($this->shopTimezone());
        if ($date->lt($today)) {
            throw ValidationException::withMessages([
                'appointment_date' => 'The booking date cannot be in the past.',
            ]);
        }

        $bookingDaysAhead = $this->scheduleService->bookingDaysAhead();
        if ($date->gt($today->addDays($bookingDaysAhead))) {
            throw ValidationException::withMessages([
                'appointment_date' => "Bookings may only be scheduled up to {$bookingDaysAhead} days in advance.",
            ]);
        }

        return $date;
    }

    private function parseSlotTime(string $value, string $field): int
    {
        if (preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $value) !== 1) {
            throw ValidationException::withMessages([
                $field => 'The selected start time is not available.',
            ]);
        }

        $time = substr($value, 0, 5);
        [$hour, $minute] = explode(':', $time);

        return ((int) $hour * 60) + (int) $minute;
    }

    private function minutesFromStoredTime(string $value): int
    {
        [$hour, $minute] = array_map('intval', explode(':', substr($value, 0, 5)));

        return ($hour * 60) + $minute;
    }

    private function shopTimezone(): string
    {
        return (string) config('app.shop_timezone', 'Asia/Manila');
    }
}
