<?php

use App\Models\Appointment;
use App\Models\BookingCustomer;
use App\Models\BookingEmailDelivery;
use App\Models\Service;
use App\Models\User;
use App\Notifications\BookingMailNotification;
use App\Services\AppointmentNotificationService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    Carbon::setTestNow(Carbon::parse('2026-09-03 08:00:00', 'Asia/Manila'));
});

afterEach(function () {
    Carbon::setTestNow();
});

function assistedBookingResources(): array
{
    $manager = User::factory()->create(['role' => 'manager', 'is_active' => true]);
    $barber = User::factory()->create(['role' => 'barber', 'is_active' => true]);
    $service = Service::create([
        'name' => 'Assisted Haircut',
        'description' => 'Staff-assisted booking service',
        'duration' => 90,
        'price' => 350,
        'is_active' => true,
    ]);

    return [$manager, $barber, $service];
}

function assistedBookingPayload(User $barber, Service $service, array $overrides = []): array
{
    return array_replace([
        'customer_name' => 'Assisted Customer',
        'customer_email' => null,
        'customer_contact_number' => null,
        'service_id' => $service->id,
        'barber_user_id' => $barber->id,
        'appointment_date' => '2026-09-04',
        'appointment_time' => '09:00',
        'notes' => null,
    ], $overrides);
}

test('staff can reserve one assisted booking without contact details', function () {
    Notification::fake();
    [$manager, $barber, $service] = assistedBookingResources();
    Sanctum::actingAs($manager);

    $this->postJson('/api/v1/assisted-bookings', assistedBookingPayload($barber, $service))
        ->assertCreated()
        ->assertJsonPath('data.status', 'confirmed')
        ->assertJsonPath('data.booking_source', 'staff_assisted')
        ->assertJsonPath('data.customer.email', null)
        ->assertJsonPath('data.customer.contact_number', null);

    $customer = BookingCustomer::sole();
    $appointment = Appointment::sole();
    expect($customer->fullname)->toBe('Assisted Customer')
        ->and($customer->email)->toBeNull()
        ->and($customer->contact_number)->toBeNull()
        ->and($appointment->status)->toBe('confirmed')
        ->and($appointment->booking_source)->toBe('staff_assisted')
        ->and($appointment->duration_minutes)->toBe(90)
        ->and($appointment->active_slot_key)->toBe("{$barber->id}|2026-09-04|09:00")
        ->and(BookingEmailDelivery::count())->toBe(0);

    Notification::assertNothingSent();
});

test('assisted booking links an existing crm customer by normalized name', function () {
    Notification::fake();
    [$manager, $barber, $service] = assistedBookingResources();
    $customer = BookingCustomer::create([
        'fullname' => 'Name Match Customer',
        'email' => 'name-match@example.test',
        'contact_number' => '09170000002',
    ]);
    Sanctum::actingAs($manager);

    $this->postJson('/api/v1/assisted-bookings', assistedBookingPayload($barber, $service, [
        'customer_name' => '  NAME   MATCH CUSTOMER  ',
    ]))->assertCreated();

    expect(BookingCustomer::count())->toBe(1)
        ->and(Appointment::sole()->booking_customer_id)->toBe($customer->id)
        ->and(Appointment::sole()->customer_email_snapshot)->toBeNull()
        ->and(BookingCustomer::sole()->email)->toBe('name-match@example.test')
        ->and(BookingCustomer::sole()->contact_number)->toBe('09170000002');

    Notification::assertNothingSent();
});

test('assisted booking reuses the oldest crm customer when names are duplicated', function () {
    Notification::fake();
    [$manager, $barber, $service] = assistedBookingResources();
    $oldestCustomer = BookingCustomer::create([
        'fullname' => 'Duplicate Name',
        'email' => null,
        'contact_number' => null,
    ]);
    BookingCustomer::create([
        'fullname' => 'duplicate   name',
        'email' => null,
        'contact_number' => null,
    ]);
    Sanctum::actingAs($manager);

    $this->postJson('/api/v1/assisted-bookings', assistedBookingPayload($barber, $service, [
        'customer_name' => 'DUPLICATE NAME',
    ]))->assertCreated();

    expect(BookingCustomer::count())->toBe(2)
        ->and(Appointment::sole()->booking_customer_id)->toBe($oldestCustomer->id);

    Notification::assertNothingSent();
});

test('assisted booking prioritizes email and contact over name matching', function () {
    Notification::fake();
    [$manager, $barber, $service] = assistedBookingResources();
    $customer = BookingCustomer::create([
        'fullname' => 'Identifier Match Customer',
        'email' => 'identifier-match@example.test',
        'contact_number' => '09170000003',
    ]);
    BookingCustomer::create([
        'fullname' => 'Identifier Match Customer',
        'email' => 'other-customer@example.test',
        'contact_number' => '09170000004',
    ]);
    Sanctum::actingAs($manager);

    $this->postJson('/api/v1/assisted-bookings', assistedBookingPayload($barber, $service, [
        'customer_name' => 'identifier match customer',
        'customer_email' => 'identifier-match@example.test',
        'customer_contact_number' => '09170000003',
        'appointment_time' => '11:00',
    ]))->assertCreated();

    expect(BookingCustomer::count())->toBe(2)
        ->and($customer->refresh()->fullname)->toBe('identifier match customer')
        ->and(Appointment::sole()->booking_customer_id)->toBe($customer->id);
});

test('assisted booking reuses a matching crm customer and emails confirmation', function () {
    Notification::fake();
    [$manager, $barber, $service] = assistedBookingResources();
    $customer = BookingCustomer::create([
        'fullname' => 'Old Customer Name',
        'email' => 'returning@example.test',
        'contact_number' => '09171234567',
    ]);
    Sanctum::actingAs($manager);

    $this->postJson('/api/v1/assisted-bookings', assistedBookingPayload($barber, $service, [
        'customer_name' => 'Returning Customer',
        'customer_email' => 'RETURNING@EXAMPLE.TEST',
        'customer_contact_number' => '0917 123 4567',
    ]))->assertCreated();

    expect(BookingCustomer::count())->toBe(1)
        ->and($customer->refresh()->fullname)->toBe('Returning Customer')
        ->and(Appointment::sole()->booking_customer_id)->toBe($customer->id)
        ->and(BookingEmailDelivery::query()->where('type', 'confirmed')->where('status', 'sent')->count())->toBe(1);

    Notification::assertSentOnDemand(
        BookingMailNotification::class,
        fn (BookingMailNotification $notification): bool => $notification->content['heading'] === 'Booking Confirmed',
    );
});

test('matching by contact does not use a crm email omitted from the assisted booking', function () {
    Notification::fake();
    [$manager, $barber, $service] = assistedBookingResources();
    $customer = BookingCustomer::create([
        'fullname' => 'Phone Match Customer',
        'email' => 'stored@example.test',
        'contact_number' => '09171234567',
    ]);
    Sanctum::actingAs($manager);

    $this->postJson('/api/v1/assisted-bookings', assistedBookingPayload($barber, $service, [
        'customer_name' => 'Phone Match Customer',
        'customer_contact_number' => '09171234567',
    ]))->assertCreated();

    expect(BookingCustomer::count())->toBe(1)
        ->and(Appointment::sole()->booking_customer_id)->toBe($customer->id)
        ->and(Appointment::sole()->customer_email_snapshot)->toBeNull()
        ->and(BookingEmailDelivery::count())->toBe(0);
    Notification::assertNothingSent();
});

test('assisted booking uses duration conflicts and rejects an occupied time', function () {
    [$manager, $barber, $service] = assistedBookingResources();
    $existingCustomer = BookingCustomer::create([
        'fullname' => 'Existing Customer',
        'email' => 'existing@example.test',
        'contact_number' => '09170000000',
    ]);
    Appointment::create([
        'booking_customer_id' => $existingCustomer->id,
        'service_id' => $service->id,
        'barber_user_id' => $barber->id,
        'appointment_date' => '2026-09-04',
        'appointment_time' => '09:00',
        'duration_minutes' => 90,
        'price' => 350,
        'status' => 'confirmed',
        'active_slot_key' => "{$barber->id}|2026-09-04|09:00",
    ]);
    Sanctum::actingAs($manager);

    $this->postJson('/api/v1/assisted-bookings', assistedBookingPayload($barber, $service, [
        'appointment_time' => '10:00',
    ]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('appointment_time');

    expect(Appointment::count())->toBe(1)
        ->and(BookingCustomer::count())->toBe(1);
});

test('no show remains in the system without sending customer email', function () {
    Notification::fake();
    [, $barber, $service] = assistedBookingResources();
    $customer = BookingCustomer::create([
        'fullname' => 'No Show Customer',
        'email' => 'no-show@example.test',
        'contact_number' => '09170000001',
    ]);
    $appointment = Appointment::create([
        'booking_customer_id' => $customer->id,
        'service_id' => $service->id,
        'barber_user_id' => $barber->id,
        'appointment_date' => '2026-09-03',
        'appointment_time' => '09:00',
        'duration_minutes' => 90,
        'price' => 350,
        'status' => 'no_show',
        'customer_email_snapshot' => $customer->email,
    ]);

    $delivery = app(AppointmentNotificationService::class)
        ->notifyStatus($appointment, 'no_show');

    expect($delivery)->toBeNull()
        ->and(Appointment::whereKey($appointment->id)->where('status', 'no_show')->exists())->toBeTrue()
        ->and(BookingEmailDelivery::count())->toBe(0);
    Notification::assertNothingSent();
});
