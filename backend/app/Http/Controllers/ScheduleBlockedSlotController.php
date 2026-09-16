<?php

namespace App\Http\Controllers;

use App\Http\Requests\ScheduleBlockedSlotRequest;
use App\Http\Resources\ScheduleBlockedSlotResource;
use App\Models\Appointment;
use App\Models\ScheduleBlockedSlot;
use App\Models\ScheduleBlockedSlotActivity;
use App\Models\ScheduleOpenSlot;
use App\Models\User;
use App\Services\AppointmentBookingService;
use App\Services\BookingScheduleService;
use App\Support\EntityChange;
use App\Traits\ApiResponseTrait;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ScheduleBlockedSlotController extends Controller
{
    use ApiResponseTrait;

    public function __construct(private readonly BookingScheduleService $scheduleService) {}

    public function index(): JsonResponse
    {
        $slots = ScheduleBlockedSlot::query()
            ->with('barber:id,fullname')
            ->whereDate('slot_date', '>=', $this->scheduleService->today()->toDateString())
            ->orderBy('slot_date')
            ->orderBy('slot_time')
            ->orderBy('barber_user_id')
            ->get();

        return $this->success(
            'Blocked slots retrieved successfully',
            ScheduleBlockedSlotResource::collection($slots),
        );
    }

    public function options(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'slot_date' => ['required', 'date_format:Y-m-d'],
            'barber_user_id' => [
                'required',
                'integer',
                Rule::exists('users', 'id')->where(fn ($query) => $query
                    ->where('role', 'barber')
                    ->where('is_active', true)),
            ],
        ]);

        $date = $validated['slot_date'];
        $barberId = (int) $validated['barber_user_id'];
        $blockedSlots = $this->scheduleService->blockedSlotsFor($date, $barberId);
        $appointments = Appointment::with('service:id,duration')
            ->where('barber_user_id', $barberId)
            ->whereDate('appointment_date', $date)
            ->whereIn('status', AppointmentBookingService::ACTIVE_STATUSES)
            ->whereNotNull('active_slot_key')
            ->get(['appointment_time', 'duration_minutes', 'service_id']);

        return $this->success('Blocked slot options retrieved successfully', [
            'time_slots' => $this->scheduleService->blockableStartTimesFor($date, $barberId),
            'blocked_slots' => $blockedSlots->map(fn (ScheduleBlockedSlot $slot): array => [
                'id' => $slot->id,
                'appointment_time' => substr((string) $slot->slot_time, 0, 5),
                'duration_minutes' => (int) $slot->duration_minutes,
            ])->values()->all(),
            'occupied_slots' => $appointments->map(fn (Appointment $appointment): array => [
                'appointment_time' => substr((string) $appointment->appointment_time, 0, 5),
                'duration_minutes' => max(1, (int) ($appointment->duration_minutes ?? $appointment->service?->duration ?? 60)),
            ])->values()->all(),
            'open_slot_times' => $this->scheduleService->openSlotTimesFor($date, $barberId),
        ]);
    }

    public function store(ScheduleBlockedSlotRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $actor = $request->user();
        $duration = BookingScheduleService::SLOT_INTERVAL_MINUTES;

        try {
            $slots = \DB::transaction(function () use ($validated, $actor, $duration) {
                $barber = User::query()
                    ->whereKey($validated['barber_user_id'])
                    ->where('role', 'barber')
                    ->where('is_active', true)
                    ->lockForUpdate()
                    ->first();

                if (! $barber) {
                    throw ValidationException::withMessages([
                        'barber_user_id' => 'The selected barber is not active.',
                    ]);
                }

                if ($this->scheduleService->isExplicitlyClosed($validated['slot_date'], (int) $barber->id)) {
                    throw ValidationException::withMessages([
                        'slot_date' => 'This barber already has a full-day closure on this date.',
                    ]);
                }

                $candidateTimes = $this->scheduleService->blockableStartTimesFor(
                    $validated['slot_date'],
                    (int) $barber->id,
                );
                $slotTimes = collect($validated['slot_times'])
                    ->map(fn (string $time): string => substr($time, 0, 5))
                    ->unique()
                    ->sort()
                    ->values();

                foreach ($slotTimes as $time) {
                    if (! in_array($time, $candidateTimes, true)) {
                        throw ValidationException::withMessages([
                            'slot_times' => "The time slot {$time} is not part of this barber's schedule.",
                        ]);
                    }

                    $scheduledAt = CarbonImmutable::createFromFormat(
                        '!Y-m-d H:i',
                        $validated['slot_date'].' '.$time,
                        (string) config('app.shop_timezone', 'Asia/Manila'),
                    );
                    if (! $scheduledAt || $scheduledAt->lte($this->scheduleService->now())) {
                        throw ValidationException::withMessages([
                            'slot_times' => "The time slot {$time} has already passed.",
                        ]);
                    }
                }

                $existing = ScheduleBlockedSlot::query()
                    ->whereDate('slot_date', $validated['slot_date'])
                    ->where('barber_user_id', $barber->id)
                    ->lockForUpdate()
                    ->get();

                $existingTimes = $existing->map(
                    fn (ScheduleBlockedSlot $slot): string => substr((string) $slot->slot_time, 0, 5),
                );
                if ($slotTimes->intersect($existingTimes)->isNotEmpty()) {
                    throw ValidationException::withMessages([
                        'slot_times' => 'One or more selected time slots are already blocked.',
                    ]);
                }

                $openSlots = ScheduleOpenSlot::query()
                    ->whereDate('slot_date', $validated['slot_date'])
                    ->where('barber_user_id', $barber->id)
                    ->whereIn('slot_time', $slotTimes->all())
                    ->lockForUpdate()
                    ->exists();
                if ($openSlots) {
                    throw ValidationException::withMessages([
                        'slot_times' => 'Remove the matching custom open slot before blocking this time.',
                    ]);
                }

                $appointments = Appointment::with('service:id,duration')
                    ->where('barber_user_id', $barber->id)
                    ->whereDate('appointment_date', $validated['slot_date'])
                    ->whereIn('status', AppointmentBookingService::ACTIVE_STATUSES)
                    ->whereNotNull('active_slot_key')
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get(['appointment_time', 'duration_minutes', 'service_id']);

                foreach ($slotTimes as $time) {
                    $conflict = $appointments->contains(
                        fn (Appointment $appointment): bool => substr((string) $appointment->appointment_time, 0, 5) === $time,
                    );
                    if ($conflict) {
                        throw ValidationException::withMessages([
                            'slot_times' => "Cannot block {$time}; it matches an active booking.",
                        ]);
                    }
                }

                return $slotTimes->map(function (string $time) use ($validated, $actor, $barber, $duration): ScheduleBlockedSlot {
                    $slot = ScheduleBlockedSlot::create([
                        'slot_date' => $validated['slot_date'],
                        'slot_time' => $time,
                        'duration_minutes' => $duration,
                        'barber_user_id' => $barber->id,
                        'reason' => $validated['reason'],
                        'created_by_user_id' => $actor?->id,
                    ]);
                    ScheduleBlockedSlotActivity::create([
                        'schedule_blocked_slot_id' => $slot->id,
                        'action' => 'blocked',
                        'slot_date' => $slot->slot_date,
                        'slot_time' => $slot->slot_time,
                        'duration_minutes' => $duration,
                        'barber_user_id' => $barber->id,
                        'barber_name_snapshot' => $barber->fullname,
                        'reason' => $validated['reason'],
                        'actor_user_id' => $actor?->id,
                        'actor_name_snapshot' => $actor?->fullname,
                    ]);

                    return $slot;
                });
            }, 3);
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'slot_times' => 'One or more selected time slots are already blocked.',
            ]);
        }

        EntityChange::dispatch('booking_schedule');
        EntityChange::dispatch('closed_dates');

        return $this->created(
            'Barber time slots blocked successfully',
            ScheduleBlockedSlotResource::collection($slots),
        );
    }

    public function destroy(ScheduleBlockedSlot $scheduleBlockedSlot): JsonResponse
    {
        $actor = request()->user();

        \DB::transaction(function () use ($scheduleBlockedSlot, $actor): void {
            $slot = ScheduleBlockedSlot::query()
                ->with('barber:id,fullname')
                ->whereKey($scheduleBlockedSlot->id)
                ->lockForUpdate()
                ->firstOrFail();
            ScheduleBlockedSlotActivity::create([
                'schedule_blocked_slot_id' => $slot->id,
                'action' => 'unblocked',
                'slot_date' => $slot->slot_date,
                'slot_time' => $slot->slot_time,
                'duration_minutes' => $slot->duration_minutes,
                'barber_user_id' => $slot->barber_user_id,
                'barber_name_snapshot' => $slot->barber?->fullname,
                'reason' => $slot->reason,
                'actor_user_id' => $actor?->id,
                'actor_name_snapshot' => $actor?->fullname,
            ]);
            $slot->delete();
        }, 3);

        EntityChange::dispatch('booking_schedule');
        EntityChange::dispatch('closed_dates');

        return $this->noData('Barber time slot unblocked successfully');
    }
}
