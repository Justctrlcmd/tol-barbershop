<?php

namespace App\Services;

use App\Models\BookingSchedule;
use App\Models\ClosedDates;
use App\Models\ScheduleOpenSlot;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

class BookingScheduleService
{
    public const SLOT_INTERVAL_MINUTES = 60;

    public const MAX_SLOTS_PER_BOOKING = 11;

    public function current(bool $lock = false): BookingSchedule
    {
        return $this->forDate($this->today(), $lock);
    }

    public function forDate(string|CarbonInterface $date, bool $lock = false): BookingSchedule
    {
        $dateString = $this->date($date)->toDateString();
        $query = BookingSchedule::query()
            ->where('effective_from', '<=', $dateString)
            ->orderByDesc('effective_from')
            ->orderByDesc('id');

        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->firstOrFail();
    }

    public function settingsPayload(?BookingSchedule $schedule = null): array
    {
        $schedule ??= $this->current();
        $customOpenTimes = $this->customOpenTimes($schedule);

        return [
            'open_day_from' => $schedule->open_day_from,
            'open_day_to' => $schedule->open_day_to,
            'closed_weekday' => $this->closedWeekdays($schedule)[0] ?? null,
            'closed_weekdays' => $this->closedWeekdays($schedule),
            'opening_time' => substr((string) $schedule->opening_time, 0, 5),
            'closing_time' => substr((string) $schedule->closing_time, 0, 5),
            'custom_open_time' => $customOpenTimes[0],
            'custom_open_times' => $customOpenTimes,
            'booking_days_ahead' => $schedule->booking_days_ahead,
            'slot_interval_minutes' => self::SLOT_INTERVAL_MINUTES,
            'max_slots_per_booking' => self::MAX_SLOTS_PER_BOOKING,
            'effective_from' => $schedule->effective_from->toDateString(),
        ];
    }

    public function publicOpenSlots(BookingSchedule $schedule): Collection
    {
        $today = $this->today();
        $latest = $today->addDays($schedule->booking_days_ahead);

        return ScheduleOpenSlot::query()
            ->whereBetween('slot_date', [$today->toDateString(), $latest->toDateString()])
            ->orderBy('slot_date')
            ->orderBy('slot_time')
            ->get(['slot_date', 'slot_time', 'barber_user_id'])
            ->map(fn (ScheduleOpenSlot $slot): array => [
                'date' => $slot->slot_date->toDateString(),
                'time' => substr((string) $slot->slot_time, 0, 5),
                'barber_user_id' => (int) $slot->barber_user_id,
            ]);
    }

    public function isRecurringOpenDate(string|CarbonInterface $date, BookingSchedule|array|null $schedule = null): bool
    {
        $date = $this->date($date);
        $schedule ??= $this->forDate($date);
        $weekday = $date->dayOfWeekIso;
        $from = (int) $this->value($schedule, 'open_day_from');
        $to = (int) $this->value($schedule, 'open_day_to');
        $closedWeekdays = $this->closedWeekdays($schedule);

        return $weekday >= $from
            && $weekday <= $to
            && ! in_array($weekday, $closedWeekdays, true);
    }

    public function standardStartTimes(BookingSchedule|array $schedule): array
    {
        $opening = $this->timeToMinutes((string) $this->value($schedule, 'opening_time'));
        $closing = $this->timeToMinutes((string) $this->value($schedule, 'closing_time'));
        $customOpenTimes = $this->customOpenTimes($schedule);
        $times = [];

        for ($minutes = $opening; $minutes <= $closing; $minutes += self::SLOT_INTERVAL_MINUTES) {
            if ($minutes !== 720) {
                $times[] = $this->minutesToTime($minutes);
            }
        }

        return collect([...$times, ...$customOpenTimes])
            ->unique()
            ->sortBy(fn (string $time): int => $this->timeToMinutes($time))
            ->values()
            ->all();
    }

    public function startTimesFor(string|CarbonInterface $date, int $barberUserId): array
    {
        $date = $this->date($date);
        if ($this->isExplicitlyClosed($date, $barberUserId)) {
            return [];
        }

        $schedule = $this->forDate($date);
        $times = $this->isRecurringOpenDate($date, $schedule)
            ? $this->standardStartTimes($schedule)
            : [];
        $customTimes = $this->openSlotTimesFor($date, $barberUserId);

        return collect([...$times, ...$customTimes])
            ->unique()
            ->sortBy(fn (string $time): int => $this->timeToMinutes($time))
            ->values()
            ->all();
    }

    public function openSlotTimesFor(
        string|CarbonInterface $date,
        int $barberUserId,
        bool $lock = false,
    ): array {
        $query = ScheduleOpenSlot::query()
            ->whereDate('slot_date', $this->date($date)->toDateString())
            ->where('barber_user_id', $barberUserId);

        if ($lock) {
            $query->lockForUpdate();
        }

        return $query
            ->pluck('slot_time')
            ->map(fn ($time): string => $this->normalizeTime((string) $time))
            ->all();
    }

    public function isStartTimeAllowed(string|CarbonInterface $date, int $barberUserId, string $time): bool
    {
        $time = $this->normalizeTime($time);

        return in_array($time, $this->startTimesFor($date, $barberUserId), true);
    }

    public function isStartTimeAllowedBySchedule(
        string|CarbonInterface $date,
        string $time,
        BookingSchedule|array $schedule,
    ): bool {
        return $this->isRecurringOpenDate($date, $schedule)
            && in_array($this->normalizeTime($time), $this->standardStartTimes($schedule), true);
    }

    public function isExplicitlyClosed(string|CarbonInterface $date, int $barberUserId): bool
    {
        return ClosedDates::query()
            ->whereDate('date_closed', $this->date($date)->toDateString())
            ->where('is_removed', false)
            ->where(function ($query) use ($barberUserId): void {
                $query->where('closure_scope', 'shop')
                    ->orWhere(function ($barberQuery) use ($barberUserId): void {
                        $barberQuery
                            ->where('closure_scope', 'barber')
                            ->where('barber_user_id', $barberUserId);
                    });
            })
            ->exists();
    }

    public function bookingDaysAhead(): int
    {
        return (int) $this->current()->booking_days_ahead;
    }

    public function today(): CarbonImmutable
    {
        return CarbonImmutable::today($this->shopTimezone());
    }

    public function now(): CarbonImmutable
    {
        return CarbonImmutable::now($this->shopTimezone());
    }

    public function normalizeTime(string $time): string
    {
        return substr($time, 0, 5);
    }

    public function timeToMinutes(string $time): int
    {
        [$hour, $minute] = array_map('intval', explode(':', substr($time, 0, 5)));

        return ($hour * 60) + $minute;
    }

    private function minutesToTime(int $minutes): string
    {
        return sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
    }

    private function date(string|CarbonInterface $date): CarbonImmutable
    {
        return $date instanceof CarbonInterface
            ? CarbonImmutable::instance($date)->setTimezone($this->shopTimezone())->startOfDay()
            : CarbonImmutable::createFromFormat('!Y-m-d', $date, $this->shopTimezone());
    }

    private function value(BookingSchedule|array $schedule, string $key): mixed
    {
        return is_array($schedule) ? ($schedule[$key] ?? null) : $schedule->{$key};
    }

    private function customOpenTimes(BookingSchedule|array $schedule): array
    {
        $times = $this->value($schedule, 'custom_open_times');
        if (! is_array($times) || $times === []) {
            $times = [$this->value($schedule, 'custom_open_time')];
        }

        return collect($times)
            ->filter(fn (mixed $time): bool => is_string($time) && $time !== '')
            ->map(fn (string $time): string => $this->normalizeTime($time))
            ->unique()
            ->sortBy(fn (string $time): int => $this->timeToMinutes($time))
            ->values()
            ->all();
    }

    private function closedWeekdays(BookingSchedule|array $schedule): array
    {
        $weekdays = $this->value($schedule, 'closed_weekdays');

        if (! is_array($weekdays)) {
            $legacyWeekday = $this->value($schedule, 'closed_weekday');
            $weekdays = $legacyWeekday === null ? [] : [$legacyWeekday];
        }

        return collect($weekdays)
            ->filter(fn (mixed $weekday): bool => is_int($weekday) || ctype_digit((string) $weekday))
            ->map(fn (mixed $weekday): int => (int) $weekday)
            ->filter(fn (int $weekday): bool => $weekday >= 1 && $weekday <= 7)
            ->unique()
            ->sort()
            ->values()
            ->all();
    }

    private function shopTimezone(): string
    {
        return (string) config('app.shop_timezone', 'Asia/Manila');
    }
}
