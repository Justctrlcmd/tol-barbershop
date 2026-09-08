<?php

use App\Models\Appointment;
use App\Models\BookingCustomer;
use App\Models\BookingSchedule;
use App\Models\ClosedDates;
use App\Models\ScheduleOpenSlot;
use App\Models\Service;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    Carbon::setTestNow('2026-09-07 10:00:00');
});

afterEach(function () {
    Carbon::setTestNow();
});

function scheduleUser(string $role): User
{
    return User::factory()->create(['role' => $role, 'is_active' => true]);
}

function schedulePayload(array $overrides = []): array
{
    return [
        'open_day_from' => 1,
        'open_day_to' => 7,
        'closed_weekdays' => [7],
        'opening_time' => '09:00',
        'closing_time' => '19:00',
        'custom_open_times' => ['12:30'],
        'booking_days_ahead' => 7,
        ...$overrides,
    ];
}

test('whole-operation schedule validates dependent ranges and booking window', function () {
    Sanctum::actingAs(scheduleUser('manager'));

    $this->getJson('/api/v1/booking-schedule')
        ->assertOk()
        ->assertJsonPath('data.open_day_from', 1)
        ->assertJsonPath('data.open_day_to', 7)
        ->assertJsonPath('data.closed_weekday', 7)
        ->assertJsonPath('data.closed_weekdays', [7])
        ->assertJsonPath('data.custom_open_time', '12:30')
        ->assertJsonPath('data.custom_open_times', ['12:30'])
        ->assertJsonPath('data.booking_days_ahead', 7);

    $this->putJson('/api/v1/booking-schedule', schedulePayload([
        'open_day_from' => 3,
        'open_day_to' => 2,
        'booking_days_ahead' => 31,
    ]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['open_day_to', 'booking_days_ahead']);
});

test('only managers can update the operation configuration', function () {
    Sanctum::actingAs(scheduleUser('admin'));

    $this->putJson('/api/v1/booking-schedule', schedulePayload())
        ->assertForbidden();
});

test('schedule changes are effective today and block active appointment conflicts', function () {
    $manager = scheduleUser('manager');
    $barber = scheduleUser('barber');
    $customer = BookingCustomer::create([
        'fullname' => 'Schedule Customer',
        'email' => 'schedule-customer@example.com',
        'contact_number' => '09123456789',
    ]);
    $service = Service::create([
        'name' => 'Schedule Service',
        'description' => 'Schedule configuration test service',
        'duration' => 60,
        'price' => 200,
        'is_active' => true,
    ]);
    $appointment = Appointment::create([
        'booking_customer_id' => $customer->id,
        'service_id' => $service->id,
        'barber_user_id' => $barber->id,
        'appointment_date' => '2026-09-08',
        'appointment_time' => '09:00',
        'duration_minutes' => 60,
        'price' => 200,
        'status' => 'confirmed',
        'active_slot_key' => "{$barber->id}|2026-09-08|09:00",
    ]);
    Sanctum::actingAs($manager);

    $this->putJson('/api/v1/booking-schedule', schedulePayload([
        'open_day_from' => 3,
        'booking_days_ahead' => 14,
    ]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('schedule');

    $appointment->update(['status' => 'cancelled', 'active_slot_key' => null]);

    $this->putJson('/api/v1/booking-schedule', schedulePayload([
        'open_day_from' => 3,
        'booking_days_ahead' => 14,
    ]))
        ->assertOk()
        ->assertJsonPath('data.effective_from', '2026-09-07')
        ->assertJsonPath('data.booking_days_ahead', 14);

    expect(BookingSchedule::whereDate('effective_from', '1970-01-01')->exists())->toBeTrue()
        ->and(BookingSchedule::whereDate('effective_from', '2026-09-07')->exists())->toBeTrue();
});

test('recurring custom time applies to every open date from today forward', function () {
    $manager = scheduleUser('manager');
    $barber = scheduleUser('barber');
    Sanctum::actingAs($manager);

    $this->putJson('/api/v1/booking-schedule', schedulePayload([
        'custom_open_times' => ['14:30', '15:35'],
    ]))
        ->assertOk()
        ->assertJsonPath('data.custom_open_time', '14:30')
        ->assertJsonPath('data.custom_open_times', ['14:30', '15:35'])
        ->assertJsonPath('data.effective_from', '2026-09-07');

    $this->getJson("/api/v1/public-booking/available-slots?barber_id={$barber->id}&date=2026-09-08")
        ->assertOk()
        ->assertJsonFragment(['14:30'])
        ->assertJsonFragment(['15:35'])
        ->assertJsonMissing(['12:00']);
});

test('multiple recurring closed days prevent bookings on every selected weekday', function () {
    $manager = scheduleUser('manager');
    $barber = scheduleUser('barber');
    Sanctum::actingAs($manager);

    $this->putJson('/api/v1/booking-schedule', schedulePayload([
        'closed_weekdays' => [2, 5],
    ]))
        ->assertOk()
        ->assertJsonPath('data.closed_weekdays', [2, 5]);

    $this->getJson("/api/v1/public-booking/available-slots?barber_id={$barber->id}&date=2026-09-08")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('date');

    $this->getJson("/api/v1/public-booking/available-slots?barber_id={$barber->id}&date=2026-09-11")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('date');

    $this->getJson("/api/v1/public-booking/available-slots?barber_id={$barber->id}&date=2026-09-09")
        ->assertOk()
        ->assertJsonFragment(['09:00']);
});

test('custom times and open slots must use five-minute increments', function () {
    Sanctum::actingAs(scheduleUser('manager'));

    $this->putJson('/api/v1/booking-schedule', schedulePayload([
        'custom_open_times' => ['12:32'],
    ]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('custom_open_times.0');

    $this->postJson('/api/v1/schedule-open-slots', [
        'slot_date' => '2026-09-08',
        'barber_user_ids' => [scheduleUser('barber')->id],
        'hour' => 2,
        'minute' => 32,
        'period' => 'PM',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('minute');
});

test('custom open slots expose a recurring closed day for multiple barbers', function () {
    $manager = scheduleUser('manager');
    $firstBarber = scheduleUser('barber');
    $secondBarber = scheduleUser('barber');
    Sanctum::actingAs($manager);

    $this->postJson('/api/v1/schedule-open-slots', [
        'slot_date' => '2026-09-13',
        'barber_user_ids' => [$firstBarber->id, $secondBarber->id],
        'hour' => 2,
        'minute' => 30,
        'period' => 'PM',
    ])->assertCreated();

    expect(ScheduleOpenSlot::count())->toBe(2);

    $this->getJson("/api/v1/public-booking/available-slots?barber_id={$firstBarber->id}&date=2026-09-13")
        ->assertOk()
        ->assertJsonPath('time_slots.0', '14:30');

    $this->getJson('/api/v1/public-booking/bootstrap')
        ->assertOk()
        ->assertJsonFragment([
            'date' => '2026-09-13',
            'time' => '14:30',
            'barber_user_id' => $secondBarber->id,
        ]);
});

test('open slots reject past times explicit closures and partial duplicate writes', function () {
    $manager = scheduleUser('manager');
    $firstBarber = scheduleUser('barber');
    $secondBarber = scheduleUser('barber');
    Sanctum::actingAs($manager);

    $this->postJson('/api/v1/schedule-open-slots', [
        'slot_date' => '2026-09-07',
        'barber_user_ids' => [$firstBarber->id],
        'hour' => 9,
        'minute' => 30,
        'period' => 'AM',
    ])->assertUnprocessable()->assertJsonValidationErrors('slot_time');

    ClosedDates::create([
        'date_closed' => '2026-09-09',
        'closure_scope' => 'barber',
        'barber_user_id' => $secondBarber->id,
        'barber_name_snapshot' => $secondBarber->fullname,
        'scope_key' => 'barber:'.$secondBarber->id,
        'reason' => 'Day off',
        'is_removed' => false,
    ]);

    $this->postJson('/api/v1/schedule-open-slots', [
        'slot_date' => '2026-09-09',
        'barber_user_ids' => [$secondBarber->id],
        'hour' => 2,
        'minute' => 30,
        'period' => 'PM',
    ])->assertUnprocessable()->assertJsonValidationErrors('slot_date');

    ScheduleOpenSlot::create([
        'slot_date' => '2026-09-10',
        'slot_time' => '14:30',
        'barber_user_id' => $firstBarber->id,
    ]);

    $this->postJson('/api/v1/schedule-open-slots', [
        'slot_date' => '2026-09-10',
        'barber_user_ids' => [$firstBarber->id, $secondBarber->id],
        'hour' => 2,
        'minute' => 30,
        'period' => 'PM',
    ])->assertUnprocessable()->assertJsonValidationErrors('slot_time');

    expect(ScheduleOpenSlot::where('barber_user_id', $secondBarber->id)->exists())->toBeFalse();
});
