<?php

use App\Models\Appointment;
use App\Models\BookingCustomer;
use App\Models\ClosedDates;
use App\Models\Service;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    Carbon::setTestNow('2026-07-16 12:00:00');
});

afterEach(function () {
    Carbon::setTestNow();
});

function createAppointmentIntegrityUser(string $role, array $attributes = []): User
{
    return User::factory()->create(array_merge([
        'role' => $role,
        'is_active' => true,
    ], $attributes));
}

function createAppointmentIntegrityService(array $attributes = []): Service
{
    return Service::create(array_merge([
        'name' => 'Integrity Haircut',
        'description' => 'Service used by appointment integrity tests',
        'duration' => 60,
        'price' => 300,
        'is_active' => true,
    ], $attributes));
}

function createAppointmentIntegrityCustomer(array $attributes = []): BookingCustomer
{
    return BookingCustomer::create(array_merge([
        'fullname' => fake()->name(),
        'email' => fake()->unique()->safeEmail(),
        'contact_number' => '09'.fake()->numerify('#########'),
    ], $attributes));
}

function appointmentIntegrityPayload(
    BookingCustomer $customer,
    User $barber,
    Service $service,
    string $date = '2026-07-17',
    string $time = '09:00',
    string $status = 'pending',
): array {
    return [
        'booking_customer_id' => $customer->id,
        'service_id' => $service->id,
        'barber_user_id' => $barber->id,
        'appointment_date' => $date,
        'appointment_time' => $time,
        'duration_minutes' => $service->duration,
        'price' => (int) $service->price,
        'status' => $status,
        'notes' => null,
    ];
}

test('scheduled bookings enforce active resources and all business date boundaries', function () {
    $customer = createAppointmentIntegrityCustomer();
    $manager = createAppointmentIntegrityUser('manager');
    $barber = createAppointmentIntegrityUser('barber');
    $service = createAppointmentIntegrityService();
    Sanctum::actingAs($manager);

    $service->update(['is_active' => false]);
    $this->postJson('/api/v1/appointments', appointmentIntegrityPayload($customer, $barber, $service))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('service_id');

    $service->update(['is_active' => true]);
    $barber->update(['is_active' => false]);
    $this->postJson('/api/v1/appointments', appointmentIntegrityPayload($customer, $barber, $service))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('barber_user_id');

    $barber->update(['is_active' => true]);
    ClosedDates::create([
        'date_closed' => '2026-07-17',
        'reason' => 'Private event',
        'is_removed' => false,
    ]);
    $this->postJson('/api/v1/appointments', appointmentIntegrityPayload($customer, $barber, $service))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('appointment_date');

    $invalidSchedules = [
        ['2026-07-15', '09:00', 'appointment_date'],
        ['2026-07-19', '09:00', 'appointment_date'],
        ['2026-07-24', '09:00', 'appointment_date'],
        ['2026-07-18', '09:30', 'appointment_time'],
        ['2026-07-18', '20:00', 'appointment_time'],
    ];

    foreach ($invalidSchedules as [$date, $time, $errorKey]) {
        $this->postJson(
            '/api/v1/appointments',
            appointmentIntegrityPayload($customer, $barber, $service, $date, $time),
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors($errorKey);
    }

    $this->getJson("/api/v1/appointments/available-slots?barber_id={$barber->id}&date=2026-07-23")
        ->assertOk();
    $this->getJson("/api/v1/appointments/available-slots?barber_id={$barber->id}&date=2026-07-24")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('date');
    expect(Appointment::count())->toBe(0);
});

test('create and reschedule reserve exact start times regardless of duration', function () {
    $firstCustomer = createAppointmentIntegrityCustomer();
    $secondCustomer = createAppointmentIntegrityCustomer();
    $manager = createAppointmentIntegrityUser('manager');
    $barber = createAppointmentIntegrityUser('barber');
    $otherBarber = createAppointmentIntegrityUser('barber');
    $longService = createAppointmentIntegrityService(['duration' => 180]);
    $shortService = createAppointmentIntegrityService([
        'name' => 'Short Haircut',
        'duration' => 30,
    ]);
    Sanctum::actingAs($manager);

    $this->postJson('/api/v1/appointments', [
        ...appointmentIntegrityPayload($firstCustomer, $barber, $longService, time: '12:30'),
        'duration_minutes' => 1,
    ])->assertCreated()->assertJsonPath('data.duration_minutes', 180);

    $this->postJson(
        '/api/v1/appointments',
        appointmentIntegrityPayload($secondCustomer, $barber, $shortService, time: '13:00'),
    )->assertCreated();

    $this->postJson(
        '/api/v1/appointments',
        appointmentIntegrityPayload($secondCustomer, $barber, $longService, time: '11:00'),
    )->assertCreated();

    $this->postJson(
        '/api/v1/appointments',
        appointmentIntegrityPayload($secondCustomer, $barber, $shortService, time: '12:30'),
    )->assertUnprocessable()->assertJsonValidationErrors('appointment_time');

    $created = $this->postJson(
        '/api/v1/appointments',
        appointmentIntegrityPayload($secondCustomer, $otherBarber, $shortService, time: '12:30', status: 'confirmed'),
    )->assertCreated();
    $rescheduled = Appointment::findOrFail($created->json('data.id'));

    $this->putJson(
        "/api/v1/appointments/{$rescheduled->id}",
        appointmentIntegrityPayload($secondCustomer, $barber, $shortService, time: '13:00', status: 'confirmed'),
    )->assertUnprocessable()->assertJsonValidationErrors('appointment_time');
    expect($rescheduled->fresh()->barber_user_id)->toBe($otherBarber->id);

    $updated = appointmentIntegrityPayload($secondCustomer, $barber, $longService, time: '14:00', status: 'confirmed');
    $this->putJson("/api/v1/appointments/{$rescheduled->id}", $updated)
        ->assertOk()->assertJsonPath('data.duration_minutes', 180);
    $this->putJson("/api/v1/appointments/{$rescheduled->id}", $updated)->assertOk();

    expect($rescheduled->fresh()->barber_user_id)->toBe($barber->id)
        ->and(substr($rescheduled->fresh()->appointment_time, 0, 5))->toBe('14:00')
        ->and(Appointment::count())->toBe(4);
});

test('status transitions are one way and future appointments cannot be completed or marked no show', function () {
    $customer = createAppointmentIntegrityCustomer();
    $manager = createAppointmentIntegrityUser('manager');
    $barber = createAppointmentIntegrityUser('barber');
    $service = createAppointmentIntegrityService();
    $pending = Appointment::create([
        'booking_customer_id' => $customer->id,
        'service_id' => $service->id,
        'barber_user_id' => $barber->id,
        'appointment_date' => '2026-07-17',
        'appointment_time' => '09:00',
        'duration_minutes' => 60,
        'price' => 300,
        'status' => 'pending',
        'active_slot_key' => "{$barber->id}|2026-07-17|09:00",
    ]);
    Sanctum::actingAs($manager);

    $this->putJson(
        "/api/v1/appointments/{$pending->id}",
        appointmentIntegrityPayload($customer, $barber, $service, status: 'completed'),
    )
        ->assertUnprocessable()
        ->assertJsonValidationErrors('status');

    $pending->update(['status' => 'confirmed']);
    foreach (['completed', 'no_show'] as $terminalStatus) {
        $this->putJson(
            "/api/v1/appointments/{$pending->id}",
            appointmentIntegrityPayload($customer, $barber, $service, status: $terminalStatus),
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');
    }

    expect($pending->fresh()->status)->toBe('confirmed');
});

test('a past confirmed appointment can complete and terminal appointments cannot be reopened', function () {
    $customer = createAppointmentIntegrityCustomer();
    $manager = createAppointmentIntegrityUser('manager');
    $barber = createAppointmentIntegrityUser('barber');
    $service = createAppointmentIntegrityService();
    $appointment = Appointment::create([
        'booking_customer_id' => $customer->id,
        'service_id' => $service->id,
        'barber_user_id' => $barber->id,
        'appointment_date' => '2026-07-16',
        'appointment_time' => '10:00',
        'duration_minutes' => 60,
        'price' => 300,
        'status' => 'confirmed',
        'active_slot_key' => "{$barber->id}|2026-07-16|10:00",
    ]);
    Sanctum::actingAs($manager);

    $this->putJson(
        "/api/v1/appointments/{$appointment->id}",
        appointmentIntegrityPayload($customer, $barber, $service, '2026-07-16', '10:00', 'completed'),
    )->assertOk();

    expect($appointment->fresh()->status)->toBe('completed');
    expect($appointment->fresh()->completed_at)->not->toBeNull();
    expect($appointment->fresh()->active_slot_key)->toBeNull();

    $this->putJson(
        "/api/v1/appointments/{$appointment->id}",
        appointmentIntegrityPayload($customer, $barber, $service, status: 'confirmed'),
    )
        ->assertUnprocessable()
        ->assertJsonValidationErrors('status');
});

test('a past-due confirmed appointment cannot be rescheduled', function () {
    $customer = createAppointmentIntegrityCustomer();
    $manager = createAppointmentIntegrityUser('manager');
    $barber = createAppointmentIntegrityUser('barber');
    $service = createAppointmentIntegrityService();
    $appointment = Appointment::create([
        'booking_customer_id' => $customer->id,
        'service_id' => $service->id,
        'barber_user_id' => $barber->id,
        'appointment_date' => '2026-07-15',
        'appointment_time' => '10:00',
        'duration_minutes' => 60,
        'price' => 300,
        'status' => 'confirmed',
        'active_slot_key' => "{$barber->id}|2026-07-15|10:00",
    ]);
    Sanctum::actingAs($manager);

    $this->putJson(
        "/api/v1/appointments/{$appointment->id}",
        appointmentIntegrityPayload($customer, $barber, $service, '2026-07-17', '10:00', 'confirmed'),
    )
        ->assertUnprocessable()
        ->assertJsonValidationErrors('appointment');

    expect($appointment->fresh()->appointment_date->toDateString())->toBe('2026-07-15')
        ->and(substr($appointment->fresh()->appointment_time, 0, 5))->toBe('10:00');
});

test('only terminal appointments can be soft archived with the acting staff recorded', function () {
    $customer = createAppointmentIntegrityCustomer();
    $manager = createAppointmentIntegrityUser('manager');
    $barber = createAppointmentIntegrityUser('barber');
    $service = createAppointmentIntegrityService();
    $pending = Appointment::create([
        'booking_customer_id' => $customer->id,
        'service_id' => $service->id,
        'barber_user_id' => $barber->id,
        'appointment_date' => '2026-07-17',
        'appointment_time' => '09:00',
        'duration_minutes' => 60,
        'price' => 300,
        'status' => 'pending',
        'active_slot_key' => "{$barber->id}|2026-07-17|09:00",
    ]);
    $completed = Appointment::create([
        'booking_customer_id' => $customer->id,
        'service_id' => $service->id,
        'barber_user_id' => $barber->id,
        'appointment_date' => '2026-07-15',
        'appointment_time' => '10:00',
        'duration_minutes' => 60,
        'price' => 300,
        'status' => 'completed',
        'completed_at' => now(),
    ]);
    Sanctum::actingAs($manager);

    $this->deleteJson("/api/v1/appointments/{$pending->id}")->assertUnprocessable();
    expect($pending->fresh())->not->toBeNull();

    $this->deleteJson("/api/v1/appointments/{$completed->id}")
        ->assertOk()
        ->assertJsonPath('message', 'Booking archived successfully.');

    expect(Appointment::find($completed->id))->toBeNull();
    $archived = Appointment::withTrashed()->findOrFail($completed->id);
    expect($archived->deleted_at)->not->toBeNull();
    expect($archived->archived_by_user_id)->toBe($manager->id);
});

test('database constraint rejects duplicate active start keys', function () {
    $customer = createAppointmentIntegrityCustomer();
    $barber = createAppointmentIntegrityUser('barber');
    $service = createAppointmentIntegrityService();
    $attributes = [
        'booking_customer_id' => $customer->id,
        'service_id' => $service->id,
        'barber_user_id' => $barber->id,
        'appointment_date' => '2026-07-17',
        'appointment_time' => '09:00',
        'duration_minutes' => 60,
        'price' => 300,
        'status' => 'pending',
        'active_slot_key' => "{$barber->id}|2026-07-17|09:00",
    ];

    Appointment::create($attributes);

    expect(fn () => Appointment::create($attributes))
        ->toThrow(UniqueConstraintViolationException::class);
});

test('group status updates are atomic', function () {
    $customer = createAppointmentIntegrityCustomer();
    $manager = createAppointmentIntegrityUser('manager');
    $barber = createAppointmentIntegrityUser('barber');
    $service = createAppointmentIntegrityService(['duration' => 30]);
    $batchId = 'BATCH-'.str_repeat('A', 24);

    foreach (['09:00', '10:00'] as $time) {
        Appointment::create([
            'booking_customer_id' => $customer->id,
            'service_id' => $service->id,
            'barber_user_id' => $barber->id,
            'appointment_date' => '2026-07-17',
            'appointment_time' => $time,
            'duration_minutes' => 30,
            'price' => 300,
            'status' => 'pending',
            'active_slot_key' => "{$barber->id}|2026-07-17|{$time}",
            'batch_id' => $batchId,
        ]);
    }

    Sanctum::actingAs($manager);
    $this->putJson("/api/v1/appointments/batch/{$batchId}/status", [
        'status' => 'confirmed',
    ])->assertOk();
    expect(Appointment::where('batch_id', $batchId)->where('status', 'confirmed')->count())->toBe(2);

    Appointment::where('batch_id', $batchId)->latest('id')->firstOrFail()->update(['status' => 'pending']);
    $this->putJson("/api/v1/appointments/batch/{$batchId}/status", [
        'status' => 'rejected',
        'cancellation_reason' => 'Unavailable',
    ])->assertConflict();

    expect(Appointment::where('batch_id', $batchId)->where('status', 'confirmed')->count())->toBe(1)
        ->and(Appointment::where('batch_id', $batchId)->where('status', 'pending')->count())->toBe(1);
});
