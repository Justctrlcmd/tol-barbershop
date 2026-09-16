<?php

use App\Models\BookingCustomer;
use App\Models\ScheduleBlockedSlot;
use App\Models\ScheduleBlockedSlotActivity;
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

function blockedSlotUser(string $role): User
{
    return User::factory()->create(['role' => $role, 'is_active' => true]);
}

test('staff can block multiple barber times and availability exposes the interval', function () {
    $manager = blockedSlotUser('manager');
    $barber = blockedSlotUser('barber');
    Sanctum::actingAs($manager);

    $this->postJson('/api/v1/schedule-blocked-slots', [
        'slot_date' => '2026-09-08',
        'barber_user_id' => $barber->id,
        'slot_times' => ['09:00', '10:00'],
        'reason' => 'Personal appointment',
    ])->assertCreated()
        ->assertJsonCount(2, 'data');

    expect(ScheduleBlockedSlot::count())->toBe(2)
        ->and(ScheduleBlockedSlotActivity::where('action', 'blocked')->count())->toBe(2);

    $availability = $this->getJson(
        "/api/v1/public-booking/available-slots?barber_id={$barber->id}&date=2026-09-08",
    )->assertOk();
    expect($availability->json('time_slots'))
        ->not->toContain('09:00')
        ->not->toContain('10:00')
        ->and($availability->json('blocked_slots.0.appointment_time'))->toBe('09:00');

    $this->getJson('/api/v1/closed-dates/activity')
        ->assertOk()
        ->assertJsonFragment(['activity_type' => 'blocked_slot'])
        ->assertJsonFragment(['action' => 'blocked']);
});

test('blocked barber start time stays independent from longer bookings and can be unblocked', function () {
    $manager = blockedSlotUser('manager');
    $barber = blockedSlotUser('barber');
    $customer = BookingCustomer::create([
        'fullname' => 'Blocked Slot Customer',
        'email' => 'blocked-slot@example.com',
        'contact_number' => '09123456789',
    ]);
    $service = Service::create([
        'name' => 'Long Blocked Service',
        'description' => 'Service for blocked slot test',
        'duration' => 120,
        'price' => 200,
        'is_active' => true,
    ]);
    Sanctum::actingAs($manager);

    $this->postJson('/api/v1/schedule-blocked-slots', [
        'slot_date' => '2026-09-08',
        'barber_user_id' => $barber->id,
        'slot_times' => ['10:00'],
        'reason' => 'Blocked time',
    ])->assertCreated();

    $this->postJson('/api/v1/appointments', [
        'booking_customer_id' => $customer->id,
        'service_id' => $service->id,
        'barber_user_id' => $barber->id,
        'appointment_date' => '2026-09-08',
        'appointment_time' => '09:00',
        'price' => 200,
        'status' => 'confirmed',
    ])->assertCreated();

    $slotId = ScheduleBlockedSlot::value('id');
    $this->deleteJson("/api/v1/schedule-blocked-slots/{$slotId}")->assertOk();

    expect(ScheduleBlockedSlot::count())->toBe(0)
        ->and(ScheduleBlockedSlotActivity::where('action', 'unblocked')->count())->toBe(1);
});

test('custom and regular barber times can be blocked independently', function () {
    $manager = blockedSlotUser('manager');
    $barber = blockedSlotUser('barber');
    Sanctum::actingAs($manager);

    $this->postJson('/api/v1/schedule-blocked-slots', [
        'slot_date' => '2026-09-08',
        'barber_user_id' => $barber->id,
        'slot_times' => ['12:30', '13:00'],
        'reason' => 'Independent slots',
    ])->assertCreated()->assertJsonCount(2, 'data');

    $options = $this->getJson(
        "/api/v1/schedule-blocked-slots/options?slot_date=2026-09-09&barber_user_id={$barber->id}",
    )->assertOk();
    expect($options->json('data.time_slots'))->toContain('12:00', '12:30', '13:00');

    expect(ScheduleBlockedSlot::where('barber_user_id', $barber->id)->pluck('slot_time')->map(
        fn (string $time): string => substr($time, 0, 5),
    )->all())->toBe(['12:30', '13:00']);
});

test('blocked barber start time cannot match a custom open slot', function () {
    $manager = blockedSlotUser('manager');
    $barber = blockedSlotUser('barber');
    ScheduleOpenSlot::create([
        'slot_date' => '2026-09-08',
        'slot_time' => '09:00',
        'barber_user_id' => $barber->id,
        'created_by_user_id' => $manager->id,
    ]);
    Sanctum::actingAs($manager);

    $this->postJson('/api/v1/schedule-blocked-slots', [
        'slot_date' => '2026-09-08',
        'barber_user_id' => $barber->id,
        'slot_times' => ['09:00'],
        'reason' => 'Blocked time',
    ])->assertUnprocessable()->assertJsonValidationErrors('slot_times');

    expect(ScheduleBlockedSlot::count())->toBe(0);
});
