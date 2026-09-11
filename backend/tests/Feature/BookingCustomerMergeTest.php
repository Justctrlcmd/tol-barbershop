<?php

use App\Models\Appointment;
use App\Models\BookingCustomer;
use App\Models\Scopes\ActiveBookingCustomerScope;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

test('crm merge command dry run does not change customer data', function () {
    $canonical = BookingCustomer::create([
        'fullname' => 'Merge Customer',
        'email' => 'merge@example.test',
        'contact_number' => '09170000001',
    ]);
    $duplicate = BookingCustomer::create([
        'fullname' => 'merge customer',
        'email' => 'merge@example.test.duplicate',
        'contact_number' => '0917 000 0001',
    ]);

    $this->artisan('crm:merge-booking-customers')
        ->assertExitCode(0);

    expect(BookingCustomer::withoutGlobalScope(ActiveBookingCustomerScope::class)->count())->toBe(2)
        ->and($canonical->refresh()->merged_into_id)->toBeNull()
        ->and($duplicate->refresh()->merged_into_id)->toBeNull()
        ->and(DB::table('booking_customer_merges')->count())->toBe(0);
});

test('crm merge command preserves source rows and relinks booking history', function () {
    $barber = User::factory()->create(['role' => 'barber', 'is_active' => true]);
    $service = Service::create([
        'name' => 'Merge Test Service',
        'description' => 'Merge test service',
        'duration' => 60,
        'price' => 300,
        'is_active' => true,
    ]);
    $canonical = BookingCustomer::create([
        'fullname' => 'Merge Customer',
        'email' => 'merge@example.test',
        'contact_number' => '09170000001',
    ]);
    $duplicate = BookingCustomer::create([
        'fullname' => 'MERGE CUSTOMER',
        'email' => 'merge@example.test.duplicate',
        'contact_number' => '0917 000 0001',
    ]);
    $appointment = Appointment::create([
        'booking_customer_id' => $duplicate->id,
        'service_id' => $service->id,
        'barber_user_id' => $barber->id,
        'appointment_date' => '2026-09-20',
        'appointment_time' => '09:00',
        'duration_minutes' => 60,
        'price' => 300,
        'status' => 'confirmed',
        'is_walkin' => false,
        'booking_source' => 'public',
    ]);

    $this->artisan('crm:merge-booking-customers', ['--apply' => true, '--force' => true])
        ->assertExitCode(0);

    expect(BookingCustomer::query()->count())->toBe(1)
        ->and(BookingCustomer::withoutGlobalScope(ActiveBookingCustomerScope::class)->count())->toBe(2)
        ->and($duplicate->refresh()->merged_into_id)->toBe($canonical->id)
        ->and($appointment->refresh()->booking_customer_id)->toBe($canonical->id)
        ->and(DB::table('booking_customer_merges')->where('merged_customer_id', $duplicate->id)->exists())->toBeTrue();
});
