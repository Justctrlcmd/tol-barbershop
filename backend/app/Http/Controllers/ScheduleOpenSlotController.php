<?php

namespace App\Http\Controllers;

use App\Http\Requests\ScheduleOpenSlotRequest;
use App\Http\Resources\ScheduleOpenSlotResource;
use App\Models\Appointment;
use App\Models\ScheduleOpenSlot;
use App\Models\User;
use App\Services\AppointmentBookingService;
use App\Services\BookingScheduleService;
use App\Support\EntityChange;
use App\Traits\ApiResponseTrait;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ScheduleOpenSlotController extends Controller
{
    use ApiResponseTrait;

    public function __construct(private readonly BookingScheduleService $scheduleService) {}

    public function index(): JsonResponse
    {
        $slots = ScheduleOpenSlot::query()
            ->with('barber:id,fullname')
            ->whereDate('slot_date', '>=', $this->scheduleService->today()->toDateString())
            ->orderBy('slot_date')
            ->orderBy('slot_time')
            ->orderBy('barber_user_id')
            ->get();

        return $this->success(
            'Open slots retrieved successfully',
            ScheduleOpenSlotResource::collection($slots),
        );
    }

    public function store(ScheduleOpenSlotRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $slotTime = $this->toTwentyFourHourTime(
            (int) $validated['hour'],
            (int) $validated['minute'],
            $validated['period'],
        );
        $scheduledAt = CarbonImmutable::createFromFormat(
            '!Y-m-d H:i',
            $validated['slot_date'].' '.$slotTime,
            (string) config('app.shop_timezone', 'Asia/Manila'),
        );

        if (! $scheduledAt || $scheduledAt->lte($this->scheduleService->now())) {
            throw ValidationException::withMessages([
                'slot_time' => 'This time has already passed.',
            ]);
        }

        try {
            $slots = DB::transaction(function () use ($validated, $slotTime, $request) {
                $barberIds = collect($validated['barber_user_ids'])
                    ->map(fn (int|string $id): int => (int) $id)
                    ->unique()
                    ->sort()
                    ->values();
                $barbers = User::query()
                    ->whereIn('id', $barberIds)
                    ->where('role', 'barber')
                    ->where('is_active', true)
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get(['id', 'fullname'])
                    ->keyBy('id');

                if ($barbers->count() !== $barberIds->count()) {
                    throw ValidationException::withMessages([
                        'barber_user_ids' => 'One or more selected barbers are not active.',
                    ]);
                }

                foreach ($barberIds as $barberId) {
                    if ($this->scheduleService->isExplicitlyClosed($validated['slot_date'], $barberId)) {
                        throw ValidationException::withMessages([
                            'slot_date' => "{$barbers->get($barberId)->fullname} is closed on this date.",
                        ]);
                    }
                }

                $duplicates = ScheduleOpenSlot::query()
                    ->whereDate('slot_date', $validated['slot_date'])
                    ->where('slot_time', $slotTime)
                    ->whereIn('barber_user_id', $barberIds)
                    ->lockForUpdate()
                    ->pluck('barber_user_id');

                if ($duplicates->isNotEmpty()) {
                    throw ValidationException::withMessages([
                        'slot_time' => 'This open slot already exists for one or more selected barbers.',
                    ]);
                }

                return $barberIds->map(fn (int $barberId): ScheduleOpenSlot => ScheduleOpenSlot::create([
                    'slot_date' => $validated['slot_date'],
                    'slot_time' => $slotTime,
                    'barber_user_id' => $barberId,
                    'created_by_user_id' => $request->user()?->id,
                ]));
            }, 3);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'slot_time' => 'This open slot already exists for one or more selected barbers.',
            ]);
        }

        $slots->each(fn (ScheduleOpenSlot $slot) => $slot->load('barber:id,fullname'));
        EntityChange::dispatch('booking_schedule');

        return $this->created(
            'Open slot added successfully',
            ScheduleOpenSlotResource::collection($slots),
        );
    }

    public function destroy(ScheduleOpenSlot $scheduleOpenSlot): JsonResponse
    {
        DB::transaction(function () use ($scheduleOpenSlot): void {
            $slot = ScheduleOpenSlot::query()->whereKey($scheduleOpenSlot->id)->lockForUpdate()->firstOrFail();
            $schedule = $this->scheduleService->forDate($slot->slot_date);
            $isStandard = $this->scheduleService->isStartTimeAllowedBySchedule(
                $slot->slot_date,
                (string) $slot->slot_time,
                $schedule,
            );

            if (! $isStandard) {
                $hasAppointment = Appointment::query()
                    ->whereDate('appointment_date', $slot->slot_date)
                    ->where('appointment_time', $slot->slot_time)
                    ->where('barber_user_id', $slot->barber_user_id)
                    ->whereIn('status', AppointmentBookingService::ACTIVE_STATUSES)
                    ->lockForUpdate()
                    ->exists();

                if ($hasAppointment) {
                    throw ValidationException::withMessages([
                        'open_slot' => 'Resolve the active booking using this open slot first.',
                    ]);
                }
            }

            $slot->delete();
        }, 3);

        EntityChange::dispatch('booking_schedule');

        return $this->noData('Open slot removed successfully');
    }

    private function toTwentyFourHourTime(int $hour, int $minute, string $period): string
    {
        $hour = $hour % 12;
        if ($period === 'PM') {
            $hour += 12;
        }

        return sprintf('%02d:%02d', $hour, $minute);
    }
}
