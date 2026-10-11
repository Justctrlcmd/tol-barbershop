<?php

use App\Models\Appointment;
use App\Models\BookingCustomer;
use App\Models\BookingVerification;
use App\Models\FeedbackToken;
use App\Models\Service;
use App\Models\User;
use App\Notifications\BookingMailNotification;
use App\Services\AppointmentNotificationService;
use Carbon\Carbon;
use Illuminate\Auth\Notifications\ResetPassword;
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

function publicBookingPayload(User $barber, Service $service, array $overrides = []): array
{
    return array_replace_recursive([
        'mode' => 'single',
        'fullname' => 'Jamie Dela Cruz',
        'email' => 'JAMIE@EXAMPLE.TEST',
        'email_confirmation' => 'jamie@example.test',
        'contact_number' => '09171234567',
        'terms_accepted' => true,
        'privacy_acknowledged' => true,
        'barber_user_id' => $barber->id,
        'appointment_date' => '2026-09-04',
        'notes' => 'Please keep the sides neat.',
        'appointments' => [[
            'customer_name' => null,
            'service_id' => $service->id,
            'appointment_time' => '09:00',
        ]],
    ], $overrides);
}

function bookingResources(): array
{
    $barber = User::factory()->create([
        'role' => 'barber',
        'is_active' => true,
    ]);
    $service = Service::create([
        'name' => 'Regular Haircut',
        'description' => 'Classic cut',
        'duration' => 30,
        'price' => 200,
        'is_active' => true,
    ]);

    return [$barber, $service];
}

it('creates a pending public booking only after the emailed otp is verified', function () {
    Notification::fake();
    [$barber, $service] = bookingResources();

    $otp = null;
    $request = $this->postJson('/api/v1/public-booking/request-otp', publicBookingPayload($barber, $service));

    $request->assertOk()
        ->assertJsonPath('data.expires_in_seconds', 1800)
        ->assertJsonPath('data.resend_after_seconds', 120);
    expect(Appointment::count())->toBe(0);

    Notification::assertSentOnDemand(
        BookingMailNotification::class,
        function (BookingMailNotification $notification) use (&$otp): bool {
            if ($notification->content['subject'] !== 'Your TOL Barbershop booking verification code') {
                return false;
            }
            $otp = $notification->content['highlight'];

            return true;
        },
    );

    $token = $request->json('data.request_token');
    $this->postJson('/api/v1/public-booking/verify-otp', [
        'request_token' => $token,
        'otp' => '000000',
    ])->assertUnprocessable();
    expect(BookingVerification::sole()->attempts)->toBe(1)
        ->and(Appointment::count())->toBe(0);

    $verified = $this->postJson('/api/v1/public-booking/verify-otp', [
        'request_token' => $token,
        'otp' => $otp,
    ]);

    $verified->assertCreated()
        ->assertJsonPath('data.status', 'pending')
        ->assertJsonPath('data.reference', fn (string $reference): bool => str_starts_with($reference, 'REF-'));

    $customer = BookingCustomer::sole();
    $appointment = Appointment::sole();
    expect($customer->email)->toBe('jamie@example.test')
        ->and($customer->fullname)->toBe('Jamie Dela Cruz')
        ->and($appointment->status)->toBe('pending')
        ->and($appointment->booking_customer_id)->toBe($customer->id)
        ->and($appointment->customer_email_snapshot)->toBe('jamie@example.test')
        ->and($appointment->emailDeliveries()->exists())->toBeFalse();

    $this->postJson('/api/v1/public-booking/verify-otp', [
        'request_token' => $token,
        'otp' => $otp,
    ])->assertUnprocessable();
});

it('reuses a phone-only crm customer when public booking adds a verified email', function () {
    Notification::fake();
    [$barber, $service] = bookingResources();
    $customer = BookingCustomer::create([
        'fullname' => 'Assisted First Visit',
        'email' => null,
        'contact_number' => '09171234567',
    ]);
    $otp = null;

    $request = $this->postJson(
        '/api/v1/public-booking/request-otp',
        publicBookingPayload($barber, $service),
    )->assertOk();

    Notification::assertSentOnDemand(
        BookingMailNotification::class,
        function (BookingMailNotification $notification) use (&$otp): bool {
            if ($notification->content['subject'] !== 'Your TOL Barbershop booking verification code') {
                return false;
            }
            $otp = $notification->content['highlight'];

            return true;
        },
    );

    $this->postJson('/api/v1/public-booking/verify-otp', [
        'request_token' => $request->json('data.request_token'),
        'otp' => $otp,
    ])->assertCreated();

    expect(BookingCustomer::count())->toBe(1)
        ->and($customer->refresh()->email)->toBe('jamie@example.test')
        ->and($customer->fullname)->toBe('Jamie Dela Cruz')
        ->and(Appointment::sole()->booking_customer_id)->toBe($customer->id)
        ->and(Appointment::sole()->booking_source)->toBe('public');
});

it('defers five-member group reservations until staff confirms the group', function () {
    Notification::fake();
    [$barber, $service] = bookingResources();
    $otp = null;
    $groupAppointments = collect(['09:00', '10:00', '11:00', '12:30', '13:00'])
        ->map(fn (string $time, int $index): array => [
            'customer_name' => $index === 0 ? null : 'Group Member '.['Two', 'Three', 'Four', 'Five'][$index - 1],
            'service_id' => $service->id,
            'appointment_time' => $time,
        ])
        ->all();

    $request = $this->postJson('/api/v1/public-booking/request-otp', publicBookingPayload($barber, $service, [
        'mode' => 'group',
        'appointments' => $groupAppointments,
    ]))->assertOk();

    Notification::assertSentOnDemand(
        BookingMailNotification::class,
        function (BookingMailNotification $notification) use (&$otp): bool {
            $otp = $notification->content['highlight'];

            return true;
        },
    );

    $verified = $this->postJson('/api/v1/public-booking/verify-otp', [
        'request_token' => $request->json('data.request_token'),
        'otp' => $otp,
    ])->assertCreated();

    $batchId = $verified->json('data.batch_id');
    $appointments = Appointment::where('batch_id', $batchId)->orderBy('id')->get();
    expect($appointments)->toHaveCount(5)
        ->and($appointments->every(fn (Appointment $appointment): bool => $appointment->status === 'pending'))
        ->toBeTrue()
        ->and($appointments->every(fn (Appointment $appointment): bool => $appointment->active_slot_key === null))
        ->toBeTrue();

    $this->getJson("/api/v1/public-booking/available-slots?barber_id={$barber->id}&date=2026-09-04")
        ->assertOk()
        ->assertJsonCount(0, 'data');

    $manager = User::factory()->create(['role' => 'manager', 'is_active' => true]);
    Sanctum::actingAs($manager);

    $this->putJson("/api/v1/appointments/batch/{$batchId}/status", ['status' => 'confirmed'])
        ->assertOk();

    $appointments = Appointment::where('batch_id', $batchId)->orderBy('id')->get();
    expect($appointments->every(fn (Appointment $appointment): bool => $appointment->status === 'confirmed'))
        ->toBeTrue()
        ->and($appointments->every(fn (Appointment $appointment): bool => $appointment->active_slot_key !== null))
        ->toBeTrue();

    $this->getJson("/api/v1/public-booking/available-slots?barber_id={$barber->id}&date=2026-09-04")
        ->assertOk()
        ->assertJsonCount(5, 'data');
});

it('reports a conflict when staff confirms a deferred group reservation', function () {
    Notification::fake();
    [$barber, $service] = bookingResources();
    $otp = null;
    $groupAppointments = collect(['09:00', '10:00', '11:00', '12:30', '13:00'])
        ->map(fn (string $time, int $index): array => [
            'customer_name' => $index === 0 ? null : 'Group Member '.['Two', 'Three', 'Four', 'Five'][$index - 1],
            'service_id' => $service->id,
            'appointment_time' => $time,
        ])
        ->all();

    $request = $this->postJson('/api/v1/public-booking/request-otp', publicBookingPayload($barber, $service, [
        'mode' => 'group',
        'appointments' => $groupAppointments,
    ]))->assertOk();

    Notification::assertSentOnDemand(
        BookingMailNotification::class,
        function (BookingMailNotification $notification) use (&$otp): bool {
            $otp = $notification->content['highlight'];

            return true;
        },
    );

    $verified = $this->postJson('/api/v1/public-booking/verify-otp', [
        'request_token' => $request->json('data.request_token'),
        'otp' => $otp,
    ])->assertCreated();

    $batchId = $verified->json('data.batch_id');
    $customer = BookingCustomer::sole();
    Appointment::create([
        'booking_customer_id' => $customer->id,
        'service_id' => $service->id,
        'barber_user_id' => $barber->id,
        'appointment_date' => '2026-09-04',
        'appointment_time' => '09:00',
        'duration_minutes' => $service->duration,
        'price' => $service->price,
        'status' => 'confirmed',
        'active_slot_key' => "{$barber->id}|2026-09-04|09:00",
        'confirmed_at' => now(),
    ]);

    $manager = User::factory()->create(['role' => 'manager', 'is_active' => true]);
    Sanctum::actingAs($manager);

    $this->putJson("/api/v1/appointments/batch/{$batchId}/status", ['status' => 'confirmed'])
        ->assertUnprocessable()
        ->assertJsonPath('message', 'Cannot process this group booking because one or more requested times conflict with an existing booking.');

    $appointments = Appointment::where('batch_id', $batchId)->get();
    expect($appointments->every(fn (Appointment $appointment): bool => $appointment->status === 'pending'))
        ->toBeTrue()
        ->and($appointments->every(fn (Appointment $appointment): bool => $appointment->active_slot_key === null))
        ->toBeTrue();
});

it('creates only one rating for a completed group booking', function () {
    Notification::fake();
    [$barber, $service] = bookingResources();
    $customer = BookingCustomer::create([
        'fullname' => 'Group Booker',
        'email' => 'group@example.test',
        'contact_number' => '09181234567',
    ]);

    $batchId = 'BATCH-GROUP-RATING';
    $appointments = collect(['09:00', '10:00'])->map(fn (string $time, int $index) => Appointment::create([
        'booking_customer_id' => $customer->id,
        'service_id' => $service->id,
        'barber_user_id' => $barber->id,
        'appointment_date' => '2026-09-03',
        'appointment_time' => $time,
        'duration_minutes' => 30,
        'price' => 200,
        'status' => 'completed',
        'batch_id' => $batchId,
        'customer_name' => $index === 0 ? null : 'Second Guest',
        'customer_name_snapshot' => $index === 0 ? $customer->fullname : 'Second Guest',
        'customer_email_snapshot' => $customer->email,
        'customer_contact_number_snapshot' => $customer->contact_number,
        'service_name_snapshot' => $service->name,
        'barber_name_snapshot' => $barber->fullname,
        'completed_at' => now(),
    ]));

    $serviceNotifier = app(AppointmentNotificationService::class);
    $serviceNotifier->notifyStatus($appointments[0], 'completed');
    $serviceNotifier->notifyStatus($appointments[1], 'completed');

    expect(FeedbackToken::where('batch_id', $batchId)->count())->toBe(1);
    $plainToken = null;
    Notification::assertSentOnDemand(
        BookingMailNotification::class,
        function (BookingMailNotification $notification) use (&$plainToken): bool {
            $url = $notification->content['actionUrl'] ?? null;
            if (! is_string($url) || ! str_contains($url, '/feedback?token=')) {
                return false;
            }
            $plainToken = str($url)->after('token=')->toString();

            return true;
        },
    );

    $this->postJson('/api/v1/public-feedback-form', [
        'token' => $plainToken,
        'rating' => 5,
        'comment' => 'Excellent group service.',
    ])->assertCreated();

    expect($appointments[0]->feedback()->count())->toBe(1)
        ->and($appointments[1]->feedback()->count())->toBe(0);

    $this->postJson('/api/v1/public-feedback-form', [
        'token' => $plainToken,
        'rating' => 4,
    ])->assertUnprocessable();
});

it('keeps login and password recovery staff only', function () {
    Notification::fake();
    $barberAccount = User::factory()->create([
        'role' => 'barber',
        'email' => 'barber-account@example.test',
        'password' => 'Password123!',
    ]);
    $manager = User::factory()->create([
        'role' => 'manager',
        'email' => 'manager@example.test',
        'password' => 'Password123!',
    ]);

    $this->postJson('/api/v1/login', [
        'email' => $barberAccount->email,
        'password' => 'Password123!',
    ])->assertForbidden();

    $this->postJson('/api/v1/forgot-password', ['email' => $barberAccount->email])->assertOk();
    Notification::assertNotSentTo($barberAccount, ResetPassword::class);

    $this->postJson('/api/v1/forgot-password', ['email' => $manager->email])->assertOk();
    Notification::assertSentTo($manager, ResetPassword::class);
});
