<?php

use App\Models\Appointment;
use App\Models\AppointmentAddOn;
use App\Models\BookingCustomer;
use App\Models\BookingEmailDelivery;
use App\Models\Service;
use App\Models\ServiceAddOn;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

test('staff can manage add-ons and apply them to confirmed appointments', function () {
    $manager = User::factory()->create([
        'role' => 'manager',
        'is_active' => true,
    ]);
    $barber = User::factory()->create([
        'role' => 'barber',
        'is_active' => true,
    ]);
    $customer = BookingCustomer::create([
        'fullname' => 'Add-on Customer',
        'email' => 'add-on@example.test',
        'contact_number' => '09123456789',
    ]);
    $service = Service::create([
        'name' => 'Classic Haircut',
        'description' => 'A classic haircut',
        'duration' => 60,
        'price' => 300,
        'is_active' => true,
    ]);
    $appointment = Appointment::create([
        'booking_customer_id' => $customer->id,
        'service_id' => $service->id,
        'barber_user_id' => $barber->id,
        'appointment_date' => '2026-07-17',
        'appointment_time' => '09:00',
        'duration_minutes' => 60,
        'price' => 300,
        'status' => 'confirmed',
        'active_slot_key' => 'test-addon-slot',
        'confirmed_at' => now(),
        'customer_name_snapshot' => $customer->fullname,
        'customer_email_snapshot' => $customer->email,
        'customer_contact_number_snapshot' => $customer->contact_number,
        'service_name_snapshot' => $service->name,
        'barber_name_snapshot' => $barber->fullname,
    ]);

    Sanctum::actingAs($manager);

    $createResponse = $this->postJson('/api/v1/service-add-ons', [
        'name' => 'Beard Trim',
        'price' => 50,
        'is_active' => true,
    ])->assertCreated();

    $addOn = ServiceAddOn::query()->firstOrFail();
    $createResponse->assertJsonPath('data.id', $addOn->id);
    $this->getJson('/api/v1/service-add-ons')
        ->assertOk()
        ->assertJsonPath('data.add_ons.0.name', 'Beard Trim');

    $this->postJson("/api/v1/appointments/{$appointment->id}/add-ons", [
        'add_on_id' => $addOn->id,
    ])
        ->assertOk()
        ->assertJsonPath('data.price', '350.00')
        ->assertJsonPath('data.add_ons.0.name', 'Beard Trim');

    expect($appointment->refresh()->price)->toBe('350.00')
        ->and(AppointmentAddOn::query()->where('appointment_id', $appointment->id)->count())->toBe(1)
        ->and(BookingEmailDelivery::query()->where('appointment_id', $appointment->id)->count())->toBe(0);

    $this->postJson("/api/v1/appointments/{$appointment->id}/add-ons", [
        'add_on_id' => $addOn->id,
    ])
        ->assertOk()
        ->assertJsonPath('data.price', '400.00');

    expect($appointment->refresh()->price)->toBe('400.00')
        ->and(AppointmentAddOn::query()->where('appointment_id', $appointment->id)->count())->toBe(2);

    $line = AppointmentAddOn::query()
        ->where('appointment_id', $appointment->id)
        ->oldest('id')
        ->firstOrFail();
    $this->deleteJson("/api/v1/appointments/{$appointment->id}/add-ons/{$line->id}")
        ->assertOk()
        ->assertJsonPath('data.price', '350.00');

    $remainingLine = AppointmentAddOn::query()
        ->where('appointment_id', $appointment->id)
        ->firstOrFail();
    $this->deleteJson("/api/v1/appointments/{$appointment->id}/add-ons/{$remainingLine->id}")
        ->assertOk()
        ->assertJsonPath('data.price', '300.00');

    expect(BookingEmailDelivery::query()->where('appointment_id', $appointment->id)->count())->toBe(0);

    $appointment->update(['status' => 'completed']);
    $this->postJson("/api/v1/appointments/{$appointment->id}/add-ons", [
        'add_on_id' => $addOn->id,
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('appointment');
});

test('deleting an add-on preserves existing booking add-on records', function () {
    $manager = User::factory()->create([
        'role' => 'manager',
        'is_active' => true,
    ]);
    $barber = User::factory()->create([
        'role' => 'barber',
        'is_active' => true,
    ]);
    $customer = BookingCustomer::create([
        'fullname' => 'Archived Add-on Customer',
        'email' => 'archived-addon@example.test',
        'contact_number' => '09123456789',
    ]);
    $service = Service::create([
        'name' => 'Haircut with Add-on',
        'description' => 'A haircut with an add-on',
        'duration' => 60,
        'price' => 300,
        'is_active' => true,
    ]);
    $appointment = Appointment::create([
        'booking_customer_id' => $customer->id,
        'service_id' => $service->id,
        'barber_user_id' => $barber->id,
        'appointment_date' => '2026-07-18',
        'appointment_time' => '09:00',
        'duration_minutes' => 60,
        'price' => 350,
        'status' => 'confirmed',
        'active_slot_key' => 'archived-addon-slot',
        'confirmed_at' => now(),
        'customer_name_snapshot' => $customer->fullname,
        'customer_email_snapshot' => $customer->email,
        'customer_contact_number_snapshot' => $customer->contact_number,
        'service_name_snapshot' => $service->name,
        'barber_name_snapshot' => $barber->fullname,
    ]);
    $addOn = ServiceAddOn::create([
        'name' => 'Hot Towel',
        'price' => 50,
        'is_active' => true,
    ]);
    $appointmentAddOn = AppointmentAddOn::create([
        'appointment_id' => $appointment->id,
        'service_add_on_id' => $addOn->id,
        'name_snapshot' => $addOn->name,
        'price' => $addOn->price,
    ]);

    Sanctum::actingAs($manager);

    $this->deleteJson("/api/v1/service-add-ons/{$addOn->id}")
        ->assertOk();

    $this->assertSoftDeleted('service_add_ons', ['id' => $addOn->id]);
    expect(AppointmentAddOn::query()->find($appointmentAddOn->id))->not->toBeNull();

    $this->getJson('/api/v1/service-add-ons')
        ->assertOk()
        ->assertJsonCount(0, 'data.add_ons');
});
