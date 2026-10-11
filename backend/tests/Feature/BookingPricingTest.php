<?php

use App\Models\Appointment;
use App\Models\BookingCustomer;
use App\Models\BookingVerification;
use App\Models\Service;
use App\Models\ServiceAddOn;
use App\Models\User;
use App\Notifications\BookingMailNotification;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    Carbon::setTestNow(Carbon::parse('2026-10-12 08:00:00', 'Asia/Manila'));
    Notification::fake();
});

afterEach(function () {
    Carbon::setTestNow();
});

function pricingResources(): array
{
    $manager = User::factory()->create(['role' => 'manager', 'is_active' => true]);
    $barber = User::factory()->create(['role' => 'barber', 'is_active' => true]);
    $service = Service::create(['name' => 'Test Haircut', 'description' => 'Haircut', 'price' => 200, 'duration' => 30, 'is_active' => true]);
    Sanctum::actingAs($manager);

    return [$manager, $barber, $service];
}

function pricingCompletionPayload(Appointment $appointment, float $discount): array
{
    return [
        'booking_customer_id' => $appointment->booking_customer_id,
        'barber_user_id' => $appointment->barber_user_id,
        'service_id' => $appointment->service_id,
        'appointment_date' => $appointment->appointment_date->toDateString(),
        'appointment_time' => substr($appointment->appointment_time, 0, 5),
        'price' => (int) $appointment->price,
        'status' => 'completed',
        'discount_amount' => $discount,
    ];
}

function pricingConfirmedBooking(User $barber, Service $service): Appointment
{
    $customer = BookingCustomer::create(['fullname' => 'Reward Customer', 'email' => null, 'contact_number' => null]);

    return Appointment::create([
        'booking_customer_id' => $customer->id,
        'barber_user_id' => $barber->id,
        'service_id' => $service->id,
        'appointment_date' => '2026-10-12',
        'appointment_time' => '09:00',
        'price' => 250,
        'status' => 'confirmed',
        'booking_source' => 'staff_assisted',
        'active_slot_key' => $barber->id.'|2026-10-12|09:00',
        'duration_minutes' => 30,
    ]);
}

test('completion records a custom discount once and reports the net booking revenue', function (float $amount) {
    [$manager, $barber, $service] = pricingResources();
    $appointment = pricingConfirmedBooking($barber, $service);
    $addOn = ServiceAddOn::create(['name' => 'Test Add-on', 'price' => 50, 'is_active' => true]);
    $appointment->addOns()->create(['service_add_on_id' => $addOn->id, 'name_snapshot' => $addOn->name, 'price' => 50]);
    $payload = pricingCompletionPayload($appointment, $amount);
    $service->update(['price' => 500]);

    $this->putJson("/api/v1/appointments/{$appointment->id}", $payload)->assertOk()
        ->assertJsonPath('data.subtotal', '250.00')
        ->assertJsonPath('data.discount_amount', number_format($amount, 2, '.', ''))
        ->assertJsonPath('data.price', number_format(250 - $amount, 2, '.', ''))
        ->assertJsonPath('data.discount_applied_by_user_id', $amount > 0 ? $manager->id : null);

    $this->putJson("/api/v1/appointments/{$appointment->id}", $payload)->assertOk()
        ->assertJsonPath('data.price', number_format(250 - $amount, 2, '.', ''));
    $this->getJson('/api/v1/appointments/history')->assertOk()
        ->assertJsonPath('data.appointments.0.discount_type', $amount > 0 ? 'custom' : null);
    expect((float) Appointment::where('status', 'completed')->sum('price'))->toBe((float) (250 - $amount))
        ->and((float) $appointment->addOns()->sum('price'))->toBe(50.0);
})->with([0, 37.5, 75, 250]);

test('completion rejects stale totals and discounts exceeding the booking total', function () {
    [, $barber, $service] = pricingResources();
    $appointment = pricingConfirmedBooking($barber, $service);
    $stale = pricingCompletionPayload($appointment, 50);
    $appointment->update(['price' => 300]);
    $this->putJson("/api/v1/appointments/{$appointment->id}", $stale)
        ->assertUnprocessable()->assertJsonValidationErrors('price');

    $appointment->update(['price' => 100]);
    $addOn = ServiceAddOn::create(['name' => 'Add-on', 'price' => 75, 'is_active' => true]);
    $appointment->addOns()->create(['service_add_on_id' => $addOn->id, 'name_snapshot' => $addOn->name, 'price' => 75]);
    $this->putJson("/api/v1/appointments/{$appointment->id}", pricingCompletionPayload($appointment, 101))
        ->assertUnprocessable()->assertJsonValidationErrors('discount_amount');
    expect($appointment->refresh()->status)->toBe('confirmed')->and($appointment->discount_type)->toBeNull();
});

test('completion validates custom monetary discount amounts', function ($amount) {
    [, $barber, $service] = pricingResources();
    $appointment = pricingConfirmedBooking($barber, $service);
    $payload = [...pricingCompletionPayload($appointment, 0), 'discount_amount' => $amount];
    $this->putJson("/api/v1/appointments/{$appointment->id}", $payload)
        ->assertUnprocessable()->assertJsonValidationErrors('discount_amount');
    expect($appointment->refresh()->status)->toBe('confirmed')->and((float) $appointment->discount_amount)->toBe(0.0);
})->with([-1, 10.123, 'invalid', null, 1000000]);

test('discounts cannot be applied before completion or edited afterward', function () {
    [, $barber, $service] = pricingResources();
    $appointment = pricingConfirmedBooking($barber, $service);
    $payload = pricingCompletionPayload($appointment, 50);
    $this->putJson("/api/v1/appointments/{$appointment->id}", [...$payload, 'status' => 'confirmed'])
        ->assertUnprocessable()->assertJsonValidationErrors('discount_amount');
    $this->putJson("/api/v1/appointments/{$appointment->id}", $payload)->assertOk();
    $this->putJson("/api/v1/appointments/{$appointment->id}", [...$payload, 'discount_amount' => 100])
        ->assertUnprocessable()->assertJsonValidationErrors('discount_amount');
    $this->putJson("/api/v1/appointments/{$appointment->id}", [...$payload, 'discount_amount' => 0])
        ->assertUnprocessable()->assertJsonValidationErrors('discount_amount');
    expect($appointment->refresh()->price)->toBe('200.00');
});

test('walk-in completion supports custom discounts and stores the applying staff member', function () {
    [$manager, $barber, $service] = pricingResources();
    $this->postJson('/api/v1/appointments', [
        'barber_user_id' => $barber->id,
        'service_id' => $service->id,
        'appointment_date' => '2026-10-12',
        'appointment_time' => '09:00',
        'price' => 200,
        'is_walkin' => true,
        'walkin_customer_name' => 'Walkin Reward',
        'status' => 'completed',
        'discount_amount' => 62.5,
    ])->assertCreated()->assertJsonPath('data.price', '137.50')
        ->assertJsonPath('data.discount_type', 'custom')
        ->assertJsonPath('data.discount_applied_by_user_id', $manager->id);
});

function pricingPublicPayload(User $barber, Service $service, array $ids): array
{
    return [
        'mode' => 'single',
        'fullname' => 'Public Addon Customer',
        'email' => 'public-addon@example.test',
        'email_confirmation' => 'public-addon@example.test',
        'contact_number' => '09123456789',
        'terms_accepted' => true,
        'privacy_acknowledged' => true,
        'barber_user_id' => $barber->id,
        'appointment_date' => '2026-10-12',
        'appointments' => [['customer_name' => null, 'service_id' => $service->id, 'appointment_time' => '09:00', 'add_on_ids' => $ids]],
    ];
}

function pricingOtp(): string
{
    $otp = '';
    Notification::assertSentOnDemand(BookingMailNotification::class, function ($notification) use (&$otp): bool {
        $otp = $notification->content['highlight'];

        return true;
    });

    return $otp;
}

test('public add-ons persist per member through verification with server-calculated totals', function () {
    [, $barber, $service] = pricingResources();
    $addOn = ServiceAddOn::create(['name' => 'Public Add-on', 'price' => 50, 'is_active' => true]);
    ServiceAddOn::create(['name' => 'Inactive Add-on', 'price' => 100, 'is_active' => false]);
    $this->getJson('/api/v1/public-booking/bootstrap')->assertOk()->assertJsonCount(1, 'data.add_ons');
    $payload = pricingPublicPayload($barber, $service, [$addOn->id]);
    $payload['mode'] = 'group';
    $payload['appointments'][] = [...$payload['appointments'][0], 'customer_name' => 'Second Person', 'appointment_time' => '10:00'];
    $payload['appointments'][] = [...$payload['appointments'][0], 'customer_name' => 'Third Person', 'appointment_time' => '11:00', 'add_on_ids' => []];
    $payload['price'] = 1;
    $payload['discount_amount'] = 100;
    $request = $this->postJson('/api/v1/public-booking/request-otp', $payload)->assertOk();
    expect(Appointment::count())->toBe(0);
    $this->postJson('/api/v1/public-booking/verify-otp', ['request_token' => $request->json('data.request_token'), 'otp' => pricingOtp()])->assertCreated();
    $appointments = Appointment::with('addOns')->orderBy('id')->get();
    expect($appointments->pluck('price')->all())->toBe(['250.00', '250.00', '200.00'])
        ->and($appointments->map(fn ($item) => $item->addOns->count())->all())->toBe([1, 1, 0])
        ->and($appointments[0]->addOns[0]->name_snapshot)->toBe('Public Add-on')
        ->and($appointments->pluck('discount_type')->filter()->count())->toBe(0);
});

test('public booking rejects duplicate and unavailable add-on selections', function (string $state) {
    [, $barber, $service] = pricingResources();
    $addOn = ServiceAddOn::create(['name' => 'Unavailable Add-on', 'price' => 50, 'is_active' => true]);
    if ($state === 'inactive') {
        $addOn->update(['is_active' => false]);
    } elseif ($state === 'deleted') {
        $addOn->delete();
    }
    $ids = $state === 'duplicate' ? [$addOn->id, $addOn->id] : [$addOn->id];
    $this->postJson('/api/v1/public-booking/request-otp', pricingPublicPayload($barber, $service, $ids))
        ->assertUnprocessable()->assertJsonValidationErrors($state === 'duplicate' ? 'appointments.0.add_on_ids' : 'appointments.0.add_on_ids.0');
})->with(['duplicate', 'inactive', 'deleted']);

test('add-ons are rechecked during verification and failure leaves no partial bookings', function () {
    [, $barber, $service] = pricingResources();
    $addOn = ServiceAddOn::create(['name' => 'Changed Add-on', 'price' => 50, 'is_active' => true]);
    $request = $this->postJson('/api/v1/public-booking/request-otp', pricingPublicPayload($barber, $service, [$addOn->id]))->assertOk();
    $addOn->update(['is_active' => false]);
    $this->postJson('/api/v1/public-booking/verify-otp', ['request_token' => $request->json('data.request_token'), 'otp' => pricingOtp()])
        ->assertUnprocessable()->assertJsonValidationErrors('appointments.0.add_on_ids');
    expect(Appointment::count())->toBe(0)->and(BookingCustomer::count())->toBe(0)
        ->and(BookingVerification::sole()->verified_at)->toBeNull();
});
