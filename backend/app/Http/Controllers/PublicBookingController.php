<?php

namespace App\Http\Controllers;

use App\Http\Requests\PublicBookingRequest;
use App\Http\Requests\VerifyBookingOtpRequest;
use App\Models\Appointment;
use App\Models\BookingVerification;
use App\Models\ClosedDates;
use App\Models\Notification as StaffNotification;
use App\Models\Service;
use App\Models\User;
use App\Notifications\BookingMailNotification;
use App\Services\AppointmentBookingService;
use App\Services\BookingCustomerService;
use App\Services\BookingScheduleService;
use App\Services\PushNotificationService;
use App\Support\DisplayId;
use App\Support\EntityChange;
use App\Traits\ApiResponseTrait;
use Carbon\Carbon;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Throwable;

class PublicBookingController extends Controller
{
    use ApiResponseTrait;

    public function __construct(
        private readonly AppointmentBookingService $bookingService,
        private readonly BookingCustomerService $customerService,
        private readonly BookingScheduleService $scheduleService,
    ) {}

    public function bootstrap(): JsonResponse
    {
        $schedule = $this->scheduleService->current();
        $latest = $this->scheduleService->today()
            ->addDays($schedule->booking_days_ahead)
            ->toDateString();

        return $this->success('Booking information retrieved.', [
            'barbers' => User::query()
                ->where('role', 'barber')
                ->where('is_active', true)
                ->orderBy('fullname')
                ->get(['id', 'fullname', 'image']),
            'services' => Service::query()
                ->where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'name', 'description', 'duration', 'price', 'is_active']),
            'closed_dates' => ClosedDates::query()
                ->where('is_removed', false)
                ->whereBetween('date_closed', [now()->toDateString(), $latest])
                ->get(['date_closed', 'closure_scope', 'barber_user_id']),
            'settings' => [
                ...$this->scheduleService->settingsPayload($schedule),
                'open_slots' => $this->scheduleService->publicOpenSlots($schedule)->all(),
            ],
        ]);
    }

    public function availableSlots(Request $request): JsonResponse
    {
        $today = Carbon::today((string) config('app.shop_timezone', 'Asia/Manila'));
        $validated = $request->validate([
            'barber_id' => [
                'required',
                'integer',
                Rule::exists('users', 'id')->where(fn ($query) => $query
                    ->where('role', 'barber')
                    ->where('is_active', true)),
            ],
            'date' => [
                'required',
                'date_format:Y-m-d',
                'after_or_equal:'.$today->toDateString(),
                'before_or_equal:'.$today->copy()->addDays($this->scheduleService->bookingDaysAhead())->toDateString(),
            ],
        ]);

        $timeSlots = $this->scheduleService->startTimesFor(
            $validated['date'],
            (int) $validated['barber_id'],
        );

        if ($timeSlots === []) {
            throw ValidationException::withMessages(['date' => 'The selected date is not available for booking.']);
        }

        $slots = Appointment::with('service:id,duration')
            ->where('barber_user_id', $validated['barber_id'])
            ->whereDate('appointment_date', $validated['date'])
            ->whereIn('status', AppointmentBookingService::ACTIVE_STATUSES)
            ->whereNotNull('active_slot_key')
            ->get(['id', 'service_id', 'appointment_time', 'duration_minutes'])
            ->map(fn (Appointment $appointment): array => [
                'appointment_time' => substr((string) $appointment->appointment_time, 0, 5),
                'duration_minutes' => max(1, (int) ($appointment->duration_minutes ?? $appointment->service?->duration ?? 60)),
            ])
            ->values();

        return response()->json([
            'success' => true,
            'message' => 'Availability retrieved.',
            'data' => $slots,
            'time_slots' => $timeSlots,
            'open_slot_times' => $this->scheduleService->openSlotTimesFor(
                $validated['date'],
                (int) $validated['barber_id'],
            ),
        ]);
    }

    public function requestOtp(PublicBookingRequest $request): JsonResponse
    {
        $validated = $request->validated();

        DB::transaction(function () use ($validated): void {
            $this->bookingService->validateAndLock(
                null,
                (int) $validated['barber_user_id'],
                $validated['appointment_date'],
                $validated['appointments'],
            );
        }, 3);

        $otp = (string) random_int(100000, 999999);
        $requestToken = Str::random(64);

        BookingVerification::query()
            ->where('email', $validated['email'])
            ->whereNull('verified_at')
            ->delete();

        BookingVerification::create([
            'request_token_hash' => hash('sha256', $requestToken),
            'email' => $validated['email'],
            'otp_hash' => Hash::make($otp),
            'payload' => $validated,
            'expires_at' => now()->addMinutes(10),
            'resend_available_at' => now()->addMinute(),
        ]);

        Notification::route('mail', $validated['email'])->notify(new BookingMailNotification([
            'subject' => 'Your TOL Barbershop booking verification code',
            'heading' => 'Verify Your Booking Email',
            'customerName' => $validated['fullname'],
            'intro' => 'Enter this six-digit code on the booking page. The code expires in 10 minutes.',
            'highlight' => $otp,
            'details' => [],
            'footer' => "If you didn't request this booking, you can ignore this email.",
        ]));

        return $this->success('Verification code sent.', [
            'request_token' => $requestToken,
            'expires_in_seconds' => 600,
            'resend_after_seconds' => 60,
        ]);
    }

    public function verifyOtp(VerifyBookingOtpRequest $request): JsonResponse
    {
        $validated = $request->validated();

        try {
            $result = DB::transaction(function () use ($validated): array {
                $verification = BookingVerification::query()
                    ->where('request_token_hash', hash('sha256', $validated['request_token']))
                    ->lockForUpdate()
                    ->first();

                if (! $verification || $verification->verified_at || $verification->expires_at->isPast()) {
                    throw ValidationException::withMessages(['otp' => 'This verification code is invalid or expired.']);
                }

                if ($verification->attempts >= 5) {
                    throw ValidationException::withMessages(['otp' => 'Too many verification attempts. Request a new code.']);
                }

                $verification->increment('attempts');

                if (! Hash::check($validated['otp'], $verification->otp_hash)) {
                    return ['otp_error' => 'The verification code is incorrect.'];
                }

                $payload = $verification->payload;
                $customer = $this->customerService->findOrCreate(
                    $payload['fullname'],
                    $verification->email,
                    $payload['contact_number'],
                );

                $resources = $this->bookingService->validateAndLock(
                    null,
                    (int) $payload['barber_user_id'],
                    $payload['appointment_date'],
                    $payload['appointments'],
                );

                $pendingCount = Appointment::query()
                    ->where('booking_customer_id', $customer->id)
                    ->where('status', 'pending')
                    ->count();
                if ($pendingCount + count($payload['appointments']) > AppointmentBookingService::MAX_PENDING_APPOINTMENTS_PER_CUSTOMER) {
                    throw ValidationException::withMessages([
                        'appointments' => 'A customer may have at most 11 pending bookings.',
                    ]);
                }

                $batchId = count($payload['appointments']) > 1
                    ? 'BATCH-'.Str::upper(Str::random(24))
                    : null;
                $requiresStaffReview = $this->bookingService->requiresStaffReviewBeforeReservation(
                    $payload['appointments'],
                );
                $appointments = [];

                foreach ($payload['appointments'] as $index => $slot) {
                    $service = $resources['services']->get((int) $slot['service_id']);
                    $memberName = $index === 0 ? null : ($slot['customer_name'] ?? null);

                    $appointments[] = Appointment::create([
                        'booking_customer_id' => $customer->id,
                        'service_id' => $service->id,
                        'barber_user_id' => $resources['barber']->id,
                        'appointment_date' => $payload['appointment_date'],
                        'appointment_time' => $slot['appointment_time'],
                        'duration_minutes' => $service->duration,
                        'price' => $service->price,
                        'status' => 'pending',
                        'booking_source' => 'public',
                        'active_slot_key' => $requiresStaffReview
                            ? null
                            : $this->bookingService->activeSlotKey(
                                $resources['barber']->id,
                                $payload['appointment_date'],
                                $slot['appointment_time'],
                            ),
                        'batch_id' => $batchId,
                        'customer_name' => $memberName,
                        'customer_name_snapshot' => $memberName ?: $customer->fullname,
                        'customer_email_snapshot' => $customer->email,
                        'customer_contact_number_snapshot' => $customer->contact_number,
                        'service_name_snapshot' => $service->name,
                        'barber_name_snapshot' => $resources['barber']->fullname,
                        'notes' => $payload['notes'] ?? null,
                    ]);
                }

                $verification->forceFill(['verified_at' => now()])->save();

                return [
                    'appointments' => $appointments,
                    'batch_id' => $batchId,
                    'customer' => $customer,
                ];
            }, 3);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'appointment_time' => 'One or more selected time slots were just booked. Please choose another time.',
            ]);
        }

        if (isset($result['otp_error'])) {
            throw ValidationException::withMessages(['otp' => $result['otp_error']]);
        }

        $appointments = collect($result['appointments']);
        $first = $appointments->firstOrFail();
        $first->load(['bookingCustomer', 'barber', 'service']);
        $reference = $appointments->count() > 1
            ? DisplayId::group($first->id)
            : DisplayId::booking($first->id);

        $this->notifyStaff($appointments->all(), $reference);
        EntityChange::dispatch('appointments');

        return $this->created('Booking request submitted.', [
            'reference' => $reference,
            'status' => 'pending',
            'appointment_ids' => $appointments->pluck('id')->all(),
            'batch_id' => $result['batch_id'],
        ]);
    }

    private function notifyStaff(array $appointments, string $reference): void
    {
        $first = $appointments[0];
        $first->loadMissing(['bookingCustomer', 'barber', 'service']);
        $count = count($appointments);
        $staff = User::activeStaffForModule('appointment')->get();

        foreach ($staff as $user) {
            StaffNotification::create([
                'user_id' => $user->id,
                'type' => 'new_pending_appointment',
                'title' => $count > 1 ? 'New Group Booking Request' : 'New Booking Request',
                'message' => "New pending booking {$reference} from {$first->bookingCustomer?->fullname}.",
                'appointment_id' => $first->id,
                'service_name' => $first->service?->name,
                'barber_name' => $first->barber?->fullname,
                'appointment_date' => $first->appointment_date,
                'appointment_time' => $first->appointment_time,
                'price' => collect($appointments)->sum('price'),
                'payload' => [
                    'appointment_id' => $first->id,
                    'batch_id' => $first->batch_id,
                    'reference' => $reference,
                    'customer_name' => $first->bookingCustomer?->fullname,
                    'customer_email' => $first->bookingCustomer?->email,
                    'appointment_count' => $count,
                ],
            ]);

            try {
                (new PushNotificationService)->send($user, [
                    'title' => $count > 1 ? 'New Group Booking Request' : 'New Booking Request',
                    'body' => "New pending booking {$reference}.",
                    'icon' => '/Tol-Logo-White-Bg.png',
                    'badge' => '/Tol-Logo-White-Bg.png',
                    'data' => ['url' => '/'.$user->role.'/appointment'],
                ]);
            } catch (Throwable $exception) {
                report($exception);
            }
        }
    }
}
