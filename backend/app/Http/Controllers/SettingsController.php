<?php

namespace App\Http\Controllers;

use App\Http\Requests\BookingScheduleRequest;
use App\Models\Appointment;
use App\Models\BookingSchedule;
use App\Models\ScheduleOpenSlot;
use App\Services\AppointmentBookingService;
use App\Services\BookingScheduleService;
use App\Support\EntityChange;
use App\Traits\ApiResponseTrait;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SettingsController extends Controller
{
    use ApiResponseTrait;

    public function __construct(private readonly BookingScheduleService $scheduleService) {}

    public function publicBookingSettings(): JsonResponse
    {
        try {
            $schedule = $this->scheduleService->current();

            return $this->success('Booking settings retrieved successfully', [
                ...$this->scheduleService->settingsPayload($schedule),
                'open_slots' => $this->scheduleService->publicOpenSlots($schedule)->all(),
            ])->withHeaders(['Cache-Control' => 'no-store, private']);
        } catch (\Exception $e) {
            return $this->error('Could not fetch booking settings', [], 500);
        }
    }

    public function show(): JsonResponse
    {
        return $this->success(
            'Booking schedule retrieved successfully',
            $this->scheduleService->settingsPayload(),
        );
    }

    public function day(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'barber_id' => [
                'required',
                'integer',
                Rule::exists('users', 'id')->where(fn ($query) => $query
                    ->where('role', 'barber')
                    ->where('is_active', true)),
            ],
        ]);
        $schedule = $this->scheduleService->forDate($validated['date']);

        return $this->success('Schedule day retrieved successfully', [
            ...$this->scheduleService->settingsPayload($schedule),
            'time_slots' => $this->scheduleService->startTimesFor(
                $validated['date'],
                (int) $validated['barber_id'],
            ),
        ]);
    }

    public function update(BookingScheduleRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $today = $this->scheduleService->today()->toDateString();

        $schedule = DB::transaction(function () use ($validated, $today, $request): BookingSchedule {
            $current = $this->scheduleService->current(true);
            $operatingScheduleChanged = collect([
                'open_day_from',
                'open_day_to',
                'closed_weekdays',
                'opening_time',
                'closing_time',
                'custom_open_times',
            ])->contains(fn (string $key): bool => $this->normalizedValue($current->{$key}) !== $this->normalizedValue($validated[$key]));

            if ($operatingScheduleChanged) {
                $this->assertNoScheduleConflicts($validated, $today);
            }

            $schedule = BookingSchedule::query()
                ->whereDate('effective_from', $today)
                ->lockForUpdate()
                ->first();
            $data = [
                ...$validated,
                'closed_weekday' => $validated['closed_weekdays'][0] ?? null,
                'custom_open_time' => $validated['custom_open_times'][0],
                'created_by_user_id' => $request->user()?->id,
            ];

            if ($schedule) {
                $schedule->update($data);
            } else {
                $schedule = BookingSchedule::create([
                    ...$data,
                    'effective_from' => $today,
                ]);
            }

            return $schedule->refresh();
        }, 3);

        EntityChange::dispatch('booking_schedule');

        return $this->success(
            'Booking schedule updated successfully',
            $this->scheduleService->settingsPayload($schedule),
        );
    }

    private function assertNoScheduleConflicts(array $candidate, string $today): void
    {
        $openSlots = ScheduleOpenSlot::query()
            ->whereDate('slot_date', '>=', $today)
            ->lockForUpdate()
            ->get(['slot_date', 'slot_time', 'barber_user_id'])
            ->mapWithKeys(fn (ScheduleOpenSlot $slot): array => [
                $slot->slot_date->toDateString().'|'.$slot->barber_user_id.'|'.substr((string) $slot->slot_time, 0, 5) => true,
            ]);
        $appointments = Appointment::query()
            ->whereDate('appointment_date', '>=', $today)
            ->whereIn('status', AppointmentBookingService::ACTIVE_STATUSES)
            ->orderBy('id')
            ->lockForUpdate()
            ->get(['id', 'appointment_date', 'appointment_time', 'barber_user_id']);
        $conflicts = $appointments->filter(function (Appointment $appointment) use ($candidate, $openSlots): bool {
            $date = $appointment->appointment_date->toDateString();
            $time = substr((string) $appointment->appointment_time, 0, 5);
            $customKey = $date.'|'.$appointment->barber_user_id.'|'.$time;

            return ! $this->scheduleService->isStartTimeAllowedBySchedule($date, $time, $candidate)
                && ! $openSlots->has($customKey);
        })->count();

        if ($conflicts > 0) {
            $label = $conflicts === 1 ? 'booking' : 'bookings';
            throw ValidationException::withMessages([
                'schedule' => "Resolve {$conflicts} active {$label} that fall outside the new schedule first.",
            ]);
        }
    }

    private function normalizedValue(mixed $value): string
    {
        if (is_array($value)) {
            return json_encode(array_values($value)) ?: '';
        }

        return substr((string) $value, 0, str_contains((string) $value, ':') ? 5 : strlen((string) $value));
    }
}
