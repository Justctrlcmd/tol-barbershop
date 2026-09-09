<?php

use App\Models\Appointment;
use App\Models\AppointmentFeedback;
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
    config()->set('app.shop_timezone', 'Asia/Manila');
    Carbon::setTestNow(Carbon::parse('2026-07-20 08:00:00', 'Asia/Manila'));
});

afterEach(function () {
    Carbon::setTestNow();
});

test('weekly schedule returns monday through sunday barber capacity', function () {
    $manager = User::factory()->create(['role' => 'manager']);
    User::factory()->count(2)->create(['role' => 'barber', 'is_active' => true]);
    User::factory()->create(['role' => 'barber', 'is_active' => false]);
    Sanctum::actingAs($manager);

    $response = $this->getJson(
        '/api/v1/appointments/overview/weekly-schedule?date=2026-07-22',
    )->assertOk();

    expect($response->json('week_start'))->toBe('2026-07-20')
        ->and($response->json('week_end'))->toBe('2026-07-26')
        ->and($response->json('opening_time'))->toBe('09:00')
        ->and($response->json('closing_time'))->toBe('19:00')
        ->and($response->json('active_barbers'))->toBe(2)
        ->and($response->json('days'))->toHaveCount(7)
        ->and($response->json('days.0.day'))->toBe('MON')
        ->and($response->json('days.0.total_slots'))->toBe(22)
        ->and($response->json('days.0.available_slots'))->toBe(22)
        ->and($response->json('days.6.day'))->toBe('SUN')
        ->and($response->json('days.6.is_closed'))->toBeTrue()
        ->and($response->json('days.6.total_slots'))->toBe(0)
        ->and($response->json('weekly_stats.completed_appointments'))->toBe(0)
        ->and($response->json('weekly_stats.average_rating'))->toBe(0);
});

test('weekly schedule identifies configured recurring closed days instead of assuming sunday', function () {
    $manager = User::factory()->create(['role' => 'manager']);
    User::factory()->create(['role' => 'barber', 'is_active' => true]);
    BookingSchedule::query()->firstOrFail()->update([
        'closed_weekday' => 3,
        'closed_weekdays' => [3],
    ]);
    Sanctum::actingAs($manager);

    $response = $this->getJson(
        '/api/v1/appointments/overview/weekly-schedule?date=2026-07-20',
    )->assertOk();

    expect($response->json('days.2.day'))->toBe('WED')
        ->and($response->json('days.2.is_recurring_closed'))->toBeTrue()
        ->and($response->json('days.6.day'))->toBe('SUN')
        ->and($response->json('days.6.is_recurring_closed'))->toBeFalse()
        ->and($response->json('days.6.is_closed'))->toBeFalse();
});

test('weekly schedule includes a date-specific open slot on a recurring closed day', function () {
    $manager = User::factory()->create(['role' => 'manager']);
    $barber = User::factory()->create(['role' => 'barber', 'is_active' => true]);
    ScheduleOpenSlot::create([
        'slot_date' => '2026-07-26',
        'slot_time' => '20:30',
        'barber_user_id' => $barber->id,
        'created_by_user_id' => $manager->id,
    ]);
    Sanctum::actingAs($manager);

    $response = $this->getJson(
        '/api/v1/appointments/overview/weekly-schedule?date=2026-07-26',
    )->assertOk();

    expect($response->json('days.6.is_recurring_closed'))->toBeFalse()
        ->and($response->json('days.6.is_closed'))->toBeFalse()
        ->and($response->json('days.6.available_slots'))->toBe(1)
        ->and($response->json('time_slots'))->toHaveCount(1)
        ->and($response->json('time_slots.0.time'))->toBe('8:30 PM');
});

test('weekly schedule accounts for duration overlaps and closed dates', function () {
    $manager = User::factory()->create(['role' => 'manager']);
    $customer = BookingCustomer::create(['fullname' => 'Dashboard Customer', 'email' => 'dashboard-one@example.test', 'contact_number' => '09170000000']);
    $firstBarber = User::factory()->create(['role' => 'barber', 'is_active' => true]);
    User::factory()->create(['role' => 'barber', 'is_active' => true]);
    $service = Service::create([
        'name' => 'Long Dashboard Service',
        'description' => 'Duration-aware dashboard test service',
        'duration' => 90,
        'price' => 500,
        'is_active' => true,
    ]);
    Appointment::create([
        'booking_customer_id' => $customer->id,
        'service_id' => $service->id,
        'barber_user_id' => $firstBarber->id,
        'appointment_date' => '2026-07-21',
        'appointment_time' => '09:00',
        'duration_minutes' => 90,
        'price' => 500,
        'status' => 'confirmed',
        'active_slot_key' => "{$firstBarber->id}|2026-07-21|09:00",
    ]);
    ClosedDates::create([
        'date_closed' => '2026-07-23',
        'reason' => 'Private event',
        'is_removed' => false,
    ]);
    Sanctum::actingAs($manager);

    $response = $this->getJson(
        '/api/v1/appointments/overview/weekly-schedule?date=2026-07-21',
    )->assertOk();

    expect($response->json('days.1.available_slots'))->toBe(20)
        ->and($response->json('days.3.is_closed'))->toBeTrue()
        ->and($response->json('days.3.available_slots'))->toBe(0)
        ->and($response->json('weekly_stats.confirmed_appointments'))->toBe(1)
        ->and($response->json('time_slots.0.available_barbers'))->toBe(1)
        ->and($response->json('time_slots.1.available_barbers'))->toBe(1)
        ->and($response->json('time_slots.2.available_barbers'))->toBe(2)
        ->and($response->json('time_slots.0.appointments.0.id'))->toBe(
            Appointment::query()->value('id'),
        );
});

test('weekly schedule marks an open day with no remaining barber capacity as fully booked', function () {
    $manager = User::factory()->create(['role' => 'manager']);
    $customer = BookingCustomer::create(['fullname' => 'Capacity Customer', 'email' => 'dashboard-capacity@example.test', 'contact_number' => '09170000001']);
    $barber = User::factory()->create(['role' => 'barber', 'is_active' => true]);
    $service = Service::create([
        'name' => 'Capacity Test Service',
        'description' => 'Service used to fill dashboard capacity',
        'duration' => 30,
        'price' => 300,
        'is_active' => true,
    ]);
    $times = [
        '09:00',
        '10:00',
        '11:00',
        '12:30',
        '13:00',
        '14:00',
        '15:00',
        '16:00',
        '17:00',
        '18:00',
        '19:00',
    ];

    foreach ($times as $time) {
        Appointment::create([
            'booking_customer_id' => $customer->id,
            'service_id' => $service->id,
            'barber_user_id' => $barber->id,
            'appointment_date' => '2026-07-20',
            'appointment_time' => $time,
            'duration_minutes' => 30,
            'price' => 300,
            'status' => 'confirmed',
            'active_slot_key' => "{$barber->id}|2026-07-20|{$time}",
        ]);
    }
    Sanctum::actingAs($manager);

    $response = $this->getJson(
        '/api/v1/appointments/overview/weekly-schedule?date=2026-07-20',
    )->assertOk();

    expect($response->json('days.0.available_slots'))->toBe(0)
        ->and($response->json('days.0.total_slots'))->toBe(11)
        ->and($response->json('days.0.is_fully_booked'))->toBeTrue()
        ->and($response->json('time_slots.0.is_fully_booked'))->toBeTrue();
});

test('weekly schedule KPI records follow the selected monday through sunday week', function () {
    $manager = User::factory()->create(['role' => 'manager']);
    $customer = BookingCustomer::create(['fullname' => 'KPI Customer', 'email' => 'dashboard-kpi@example.test', 'contact_number' => '09170000002']);
    $barber = User::factory()->create(['role' => 'barber', 'is_active' => true]);
    $service = Service::create([
        'name' => 'Weekly KPI Service',
        'description' => 'Service used to verify weekly dashboard records',
        'duration' => 30,
        'price' => 300,
        'is_active' => true,
    ]);

    $appointments = collect([
        ['date' => '2026-07-21', 'time' => '09:00', 'status' => 'completed'],
        ['date' => '2026-07-22', 'time' => '10:00', 'status' => 'completed'],
        ['date' => '2026-07-23', 'time' => '11:00', 'status' => 'pending'],
        ['date' => '2026-07-27', 'time' => '12:30', 'status' => 'completed'],
    ])->map(fn (array $data) => Appointment::create([
        'booking_customer_id' => $customer->id,
        'service_id' => $service->id,
        'barber_user_id' => $barber->id,
        'appointment_date' => $data['date'],
        'appointment_time' => $data['time'],
        'duration_minutes' => 30,
        'price' => 300,
        'status' => $data['status'],
        'active_slot_key' => $data['status'] === 'completed'
            ? null
            : "{$barber->id}|{$data['date']}|{$data['time']}",
    ]));

    AppointmentFeedback::create([
        'appointment_id' => $appointments[0]->id,
        'booking_customer_id' => $customer->id,
        'rating' => 5,
    ]);
    AppointmentFeedback::create([
        'appointment_id' => $appointments[1]->id,
        'booking_customer_id' => $customer->id,
        'rating' => 3,
    ]);
    AppointmentFeedback::create([
        'appointment_id' => $appointments[3]->id,
        'booking_customer_id' => $customer->id,
        'rating' => 1,
    ]);
    Sanctum::actingAs($manager);

    $response = $this->getJson(
        '/api/v1/appointments/overview/weekly-schedule?date=2026-07-22',
    )->assertOk();

    expect($response->json('weekly_stats.completed_appointments'))->toBe(2)
        ->and($response->json('weekly_stats.confirmed_appointments'))->toBe(0)
        ->and($response->json('weekly_stats.pending_appointments'))->toBe(1)
        ->and($response->json('weekly_stats.average_rating'))->toBe(4);
});

test('weekly schedule rejects invalid dates', function () {
    Sanctum::actingAs(User::factory()->create(['role' => 'manager']));

    $this->getJson('/api/v1/appointments/overview/weekly-schedule?date=07-20-2026')
        ->assertUnprocessable()
        ->assertJsonValidationErrors('date');
});
