<?php

namespace App\Http\Controllers;

use App\Http\Requests\AppointmentHistoryRequest;
use App\Http\Requests\AppointmentRequest;
use App\Http\Requests\BatchAppointmentStatusRequest;
use App\Http\Requests\DashboardScheduleRequest;
use App\Http\Resources\AppointmentResource;
use App\Models\Appointment;
use App\Models\BookingCustomer;
use App\Models\ClosedDates;
use App\Models\Service;
use App\Models\User;
use App\Services\AppointmentBookingService;
use App\Services\AppointmentNotificationService;
use App\Services\BookingScheduleService;
use App\Support\EntityChange;
use App\Traits\ApiResponseTrait;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AppointmentController extends Controller
{
    use ApiResponseTrait;

    private const DASHBOARD_SLOT_STATUSES = ['completed', 'confirmed', 'pending', 'no_show'];

    private array $scheduleTimesCache = [];

    public function __construct(
        private readonly AppointmentBookingService $bookingService,
        private readonly AppointmentNotificationService $appointmentNotificationService,
        private readonly BookingScheduleService $scheduleService,
    ) {}

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $query = Appointment::with([
            'bookingCustomer',
            'barber',
            'service',
            'addOns',
            'feedback',
            'emailDeliveries',
        ])->latest();

        $user = $request->user();
        if (in_array($user?->role, ['admin', 'manager'], true)) {
            $query->whereIn('status', AppointmentBookingService::ACTIVE_STATUSES);
        } else {
            abort(403, 'Forbidden.');
        }

        $appointments = $query->get();

        return AppointmentResource::collection($appointments);
    }

    public function history(AppointmentHistoryRequest $request)
    {
        $validated = $request->validated();
        $query = Appointment::with([
            'bookingCustomer:id,fullname,email,contact_number',
            'barber:id,fullname,email,contact_number',
            'service:id,name',
            'addOns',
            'feedback:id,appointment_id,rating,comment,created_at',
            'emailDeliveries',
        ])->whereIn('status', AppointmentBookingService::HISTORY_STATUSES);

        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        if (array_key_exists('is_walkin', $validated)) {
            $query->where('is_walkin', (bool) $validated['is_walkin']);
        }

        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $like = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $search).'%';

            $query->where(function ($searchQuery) use ($search, $like) {
                if (ctype_digit($search)) {
                    $searchQuery->orWhere('id', (int) $search);
                }

                if (preg_match('/^REF-(\d{5})$/i', $search, $matches) === 1) {
                    $searchQuery->orWhereRaw('((id * 12345 + 67890) % 90000) + 10000 = ?', [(int) $matches[1]]);
                }

                $searchQuery
                    ->orWhereRaw("customer_name LIKE ? ESCAPE '!'", [$like])
                    ->orWhereRaw("customer_name_snapshot LIKE ? ESCAPE '!'", [$like])
                    ->orWhereRaw("walkin_customer_name LIKE ? ESCAPE '!'", [$like])
                    ->orWhereRaw("service_name_snapshot LIKE ? ESCAPE '!'", [$like])
                    ->orWhereRaw("barber_name_snapshot LIKE ? ESCAPE '!'", [$like])
                    ->orWhereHas('bookingCustomer', fn ($customerQuery) => $customerQuery
                        ->whereRaw("fullname LIKE ? ESCAPE '!'", [$like])
                        ->orWhereRaw("email LIKE ? ESCAPE '!'", [$like])
                        ->orWhereRaw("contact_number LIKE ? ESCAPE '!'", [$like]))
                    ->orWhereHas('service', fn ($serviceQuery) => $serviceQuery->whereRaw("name LIKE ? ESCAPE '!'", [$like]))
                    ->orWhereHas('barber', fn ($barberQuery) => $barberQuery->whereRaw("fullname LIKE ? ESCAPE '!'", [$like]))
                    ->orWhereHas('addOns', fn ($addOnQuery) => $addOnQuery->whereRaw("name_snapshot LIKE ? ESCAPE '!'", [$like]));
            });
        }

        $perPage = $validated['per_page'] ?? 15;
        $appointments = $query
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->paginate($perPage, ['*'], 'page', $validated['page'] ?? 1);

        return $this->success('Booking history retrieved successfully.', [
            'appointments' => AppointmentResource::collection($appointments),
            'meta' => [
                'current_page' => $appointments->currentPage(),
                'last_page' => $appointments->lastPage(),
                'per_page' => $appointments->perPage(),
                'total' => $appointments->total(),
            ],
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(AppointmentRequest $request)
    {
        $validated = $request->validated();
        $isWalkin = (bool) ($validated['is_walkin'] ?? false);
        $authUser = $request->user();
        $canManage = in_array($authUser?->role, ['admin', 'manager'], true);

        if (! $canManage) {
            abort(403, 'Only staff may create bookings from this endpoint.');
        }

        $this->assertStaffCanCreateType($authUser, $isWalkin ? 'walkin' : 'appointment');

        if ($isWalkin) {
            $appointment = DB::transaction(function () use ($validated): Appointment {
                $resources = $this->bookingService->lockActiveResources(
                    null,
                    (int) $validated['barber_user_id'],
                    [(int) $validated['service_id']],
                );
                $this->bookingService->assertDateAvailableAndLock(
                    (int) $resources['barber']->id,
                    $validated['appointment_date'],
                );
                $service = $resources['services']->get((int) $validated['service_id']);
                $now = Carbon::now();

                return Appointment::create([
                    'service_id' => $service->id,
                    'barber_user_id' => $resources['barber']->id,
                    'appointment_date' => $validated['appointment_date'],
                    'appointment_time' => $validated['appointment_time'],
                    'duration_minutes' => $service->duration,
                    'price' => $service->price,
                    'status' => 'completed',
                    'is_walkin' => true,
                    'booking_source' => 'walkin',
                    'walkin_customer_name' => $validated['walkin_customer_name'] ?? null,
                    'walkin_customer_contact_number' => $validated['walkin_customer_contact_number'] ?? null,
                    'notes' => $validated['notes'] ?? null,
                    'completed_at' => $now,
                    'customer_name_snapshot' => $validated['walkin_customer_name'] ?? null,
                    'service_name_snapshot' => $service->name,
                    'barber_name_snapshot' => $resources['barber']->fullname,
                ]);
            }, 3);

            $appointment->load(['barber', 'service']);
            EntityChange::dispatch('appointments');

            return new AppointmentResource($appointment);
        }

        $status = $validated['status'] ?? 'pending';
        $this->bookingService->assertCreatableStatus($status);

        try {
            $appointment = DB::transaction(function () use ($validated, $status): Appointment {
                $resources = $this->bookingService->validateAndLock(
                    (int) $validated['booking_customer_id'],
                    (int) $validated['barber_user_id'],
                    $validated['appointment_date'],
                    [[
                        'service_id' => (int) $validated['service_id'],
                        'appointment_time' => $validated['appointment_time'],
                    ]],
                    $status === 'pending' ? 1 : 0,
                );
                $service = $resources['services']->get((int) $validated['service_id']);

                return Appointment::create([
                    'booking_customer_id' => $validated['booking_customer_id'],
                    'service_id' => $service->id,
                    'barber_user_id' => $resources['barber']->id,
                    'appointment_date' => $validated['appointment_date'],
                    'appointment_time' => $validated['appointment_time'],
                    'duration_minutes' => $service->duration,
                    'price' => $service->price,
                    'status' => $status,
                    'active_slot_key' => $this->bookingService->activeSlotKey(
                        $resources['barber']->id,
                        $validated['appointment_date'],
                        $validated['appointment_time'],
                    ),
                    'is_walkin' => false,
                    'notes' => $validated['notes'] ?? null,
                    'customer_name_snapshot' => $resources['customer']?->fullname,
                    'customer_email_snapshot' => $resources['customer']?->email,
                    'customer_contact_number_snapshot' => $resources['customer']?->contact_number,
                    'service_name_snapshot' => $service->name,
                    'barber_name_snapshot' => $resources['barber']->fullname,
                    'confirmed_at' => $status === 'confirmed' ? Carbon::now() : null,
                ]);
            }, 3);
        } catch (UniqueConstraintViolationException) {
            return response()->json([
                'message' => 'Selected barber already has a booking at this time.',
            ], 422);
        }

        $appointment->load([
            'bookingCustomer',
            'barber',
            'service',
            'addOns',
            'emailDeliveries',
        ]);

        EntityChange::dispatch('appointments');

        return new AppointmentResource($appointment);
    }

    public function updateBatchStatus(BatchAppointmentStatusRequest $request, string $batchId)
    {
        $validated = $request->validated();
        $status = $validated['status'];
        $snapshot = Appointment::where('batch_id', $batchId)
            ->orderBy('id')
            ->get();

        if ($snapshot->isEmpty()) {
            abort(404);
        }

        $isHomogeneousBatch = $snapshot->count() >= 2
            && $snapshot->count() <= 11
            && $snapshot->pluck('booking_customer_id')->filter()->unique()->count() === 1
            && $snapshot->pluck('booking_customer_id')->filter()->count() === $snapshot->count()
            && $snapshot->pluck('barber_user_id')->unique()->count() === 1
            && $snapshot->map(fn (Appointment $appointment): string => $appointment->appointment_date->toDateString())->unique()->count() === 1
            && ! $snapshot->contains(fn (Appointment $appointment): bool => $appointment->is_walkin);

        if (! $isHomogeneousBatch) {
            return $this->error('This group of bookings cannot be updated together. Please manage them individually.', [], 409);
        }

        try {
            $result = DB::transaction(function () use ($batchId, $snapshot, $status, $validated): array {
                if ($status === 'confirmed') {
                    $first = $snapshot->first();
                    $this->bookingService->validateAndLock(
                        (int) $first->booking_customer_id,
                        (int) $first->barber_user_id,
                        $first->appointment_date->toDateString(),
                        $snapshot->map(fn (Appointment $appointment): array => [
                            'service_id' => (int) $appointment->service_id,
                            'appointment_time' => substr((string) $appointment->appointment_time, 0, 5),
                        ])->all(),
                        0,
                        $snapshot->modelKeys(),
                    );
                }

                $appointments = Appointment::where('batch_id', $batchId)
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get();

                if ($appointments->count() !== $snapshot->count()
                    || $appointments->contains(fn (Appointment $appointment): bool => $appointment->status !== 'pending')) {
                    return ['error' => 'The group changed while it was being updated. Refresh and try again.'];
                }

                $now = Carbon::now();
                foreach ($appointments as $appointment) {
                    $appointment->update([
                        'status' => $status,
                        'active_slot_key' => $status === 'confirmed'
                            ? $this->bookingService->activeSlotKey(
                                (int) $appointment->barber_user_id,
                                $appointment->appointment_date->toDateString(),
                                (string) $appointment->appointment_time,
                            )
                            : null,
                        'confirmed_at' => $status === 'confirmed' ? $now : null,
                        'rejected_at' => $status === 'rejected' ? $now : null,
                        'cancellation_reason' => $status === 'rejected'
                            ? ($validated['cancellation_reason'] ?? null)
                            : null,
                    ]);
                }

                return ['appointments' => $appointments];
            }, 3);
        } catch (ValidationException $exception) {
            $hasTimeConflict = collect($exception->errors())
                ->flatten()
                ->contains(fn (string $message): bool => str_contains($message, 'overlaps another booking'));

            if ($status === 'confirmed' && $hasTimeConflict) {
                return $this->error(
                    'Cannot process this group booking because one or more requested times conflict with an existing booking.',
                    $exception->errors(),
                    422,
                );
            }

            throw $exception;
        } catch (UniqueConstraintViolationException) {
            return $this->error(
                'Cannot process this group booking because one or more requested times conflict with an existing booking.',
                [],
                422,
            );
        }

        if (isset($result['error'])) {
            return $this->error($result['error'], [], 409);
        }

        /** @var Collection<int, Appointment> $appointments */
        $appointments = $result['appointments'];
        $appointments->load(['bookingCustomer', 'barber', 'service', 'addOns', 'emailDeliveries']);

        foreach ($appointments->groupBy('booking_customer_id') as $userAppointments) {
            $this->appointmentNotificationService->notifyGroupStatus(
                $userAppointments,
                $status,
                $request->user()?->id,
            );
        }

        EntityChange::dispatch('appointments');
        EntityChange::dispatch('notifications');

        return AppointmentResource::collection($appointments);
    }

    /**
     * Display the specified resource.
     */
    public function show(Request $request, string $id)
    {
        $query = Appointment::with([
            'bookingCustomer',
            'barber',
            'service',
            'addOns',
            'emailDeliveries',
        ]);

        $user = $request->user();
        if (! in_array($user?->role, ['admin', 'manager'], true)) {
            abort(403, 'Forbidden.');
        }

        $appointment = $query->findOrFail($id);

        return new AppointmentResource($appointment);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(AppointmentRequest $request, string $id)
    {
        if (! in_array($request->user()?->role, ['admin', 'manager'], true)) {
            abort(403, 'Forbidden.');
        }

        $validated = $request->validated();
        $snapshot = Appointment::findOrFail($id);

        try {
            [$appointment, $originalStatus, $nextStatus, $detailsChanged] = DB::transaction(function () use ($id, $validated, $snapshot): array {
                $this->bookingService->lockUsers([
                    $snapshot->barber_user_id,
                    $validated['barber_user_id'],
                ]);

                $appointment = Appointment::whereKey($id)->lockForUpdate()->firstOrFail();
                if ((int) $appointment->barber_user_id !== (int) $snapshot->barber_user_id) {
                    throw ValidationException::withMessages([
                        'appointment' => 'The booking changed while it was being updated. Please retry.',
                    ]);
                }

                $originalStatus = (string) $appointment->status;
                $nextStatus = (string) ($validated['status'] ?? $originalStatus);
                $this->bookingService->assertValidStatusTransition($originalStatus, $nextStatus);

                if ((int) ($validated['booking_customer_id'] ?? 0) !== (int) $appointment->booking_customer_id) {
                    throw ValidationException::withMessages([
                        'booking_customer_id' => 'A booking cannot be transferred to another customer.',
                    ]);
                }

                if (array_key_exists('is_walkin', $validated)
                    && (bool) $validated['is_walkin'] !== (bool) $appointment->is_walkin) {
                    throw ValidationException::withMessages([
                        'is_walkin' => 'The booking type cannot be changed.',
                    ]);
                }

                $originalDate = $appointment->appointment_date->toDateString();
                $originalTime = substr((string) $appointment->appointment_time, 0, 5);
                $detailsChanged = (int) $validated['service_id'] !== (int) $appointment->service_id
                    || (int) $validated['barber_user_id'] !== (int) $appointment->barber_user_id
                    || $validated['appointment_date'] !== $originalDate
                    || $validated['appointment_time'] !== $originalTime;

                $today = Carbon::now((string) config('app.shop_timezone', 'Asia/Manila'))
                    ->toDateString();
                if ($detailsChanged && $originalStatus === 'confirmed' && $originalDate < $today) {
                    throw ValidationException::withMessages([
                        'appointment' => 'Past-due bookings cannot be rescheduled.',
                    ]);
                }

                if ($detailsChanged && ! in_array($nextStatus, AppointmentBookingService::ACTIVE_STATUSES, true)) {
                    throw ValidationException::withMessages([
                        'appointment' => 'Completed or cancelled bookings cannot be rescheduled.',
                    ]);
                }

                if (in_array($nextStatus, AppointmentBookingService::ACTIVE_STATUSES, true)) {
                    $resources = $this->bookingService->validateAndLock(
                        (int) $appointment->booking_customer_id,
                        (int) $validated['barber_user_id'],
                        $validated['appointment_date'],
                        [[
                            'service_id' => (int) $validated['service_id'],
                            'appointment_time' => $validated['appointment_time'],
                        ]],
                        0,
                        [(int) $appointment->id],
                    );
                    $service = $resources['services']->get((int) $validated['service_id']);
                    $barber = $resources['barber'];
                    $customer = $resources['customer'];
                } else {
                    $service = Service::withTrashed()->findOrFail($appointment->service_id);
                    $barber = User::withTrashed()->findOrFail($appointment->barber_user_id);
                    $customer = $appointment->bookingCustomer()->first();
                }

                if ($nextStatus !== $originalStatus) {
                    $this->bookingService->assertNotFutureTerminal(
                        $validated['appointment_date'],
                        $validated['appointment_time'],
                        $nextStatus,
                    );
                }

                $reason = $validated['cancellation_reason'] ?? null;
                $updates = [
                    'service_id' => $service->id,
                    'barber_user_id' => $barber->id,
                    'appointment_date' => $validated['appointment_date'],
                    'appointment_time' => $validated['appointment_time'],
                    'duration_minutes' => $service->duration,
                    'price' => round(
                        (float) $service->price + (float) $appointment->addOns()->sum('price'),
                        2,
                    ),
                    'status' => $nextStatus,
                    'active_slot_key' => in_array($nextStatus, AppointmentBookingService::ACTIVE_STATUSES, true)
                        ? $this->bookingService->activeSlotKey(
                            $barber->id,
                            $validated['appointment_date'],
                            $validated['appointment_time'],
                        )
                        : null,
                    'notes' => $validated['notes'] ?? null,
                    'cancellation_reason' => in_array($nextStatus, ['cancelled', 'rejected'], true)
                        && is_string($reason) && trim($reason) !== ''
                            ? trim($reason)
                            : null,
                    'customer_name_snapshot' => $appointment->is_walkin
                        ? ($appointment->walkin_customer_name ?? $validated['walkin_customer_name'] ?? null)
                        : (filled($appointment->customer_name)
                            ? $appointment->customer_name
                            : $customer?->fullname),
                    'service_name_snapshot' => $service->name,
                    'barber_name_snapshot' => $barber->fullname,
                ];

                if ($nextStatus !== $originalStatus) {
                    $timestampColumn = match ($nextStatus) {
                        'confirmed' => 'confirmed_at',
                        'completed' => 'completed_at',
                        'cancelled' => 'cancelled_at',
                        'rejected' => 'rejected_at',
                        default => null,
                    };

                    if ($timestampColumn) {
                        $updates[$timestampColumn] = Carbon::now();
                    }
                }

                $appointment->update($updates);

                return [$appointment, $originalStatus, $nextStatus, $detailsChanged];
            }, 3);
        } catch (UniqueConstraintViolationException) {
            return response()->json([
                'message' => 'Selected barber already has a booking at this time.',
            ], 422);
        }

        $appointment->loadMissing(['bookingCustomer', 'barber', 'service', 'addOns', 'emailDeliveries']);

        $customerNotification = null;
        if ($nextStatus && $nextStatus !== $originalStatus) {
            $customerNotification = $this->appointmentNotificationService->notifyStatus(
                $appointment,
                $nextStatus,
                $request->user()?->id,
            );
        } elseif ($detailsChanged) {
            $customerNotification = $this->appointmentNotificationService->notifyRescheduled(
                $appointment,
                $request->user()?->id,
            );
        }

        if ($customerNotification) {
            EntityChange::dispatch('notifications');
        }

        $appointment->load([
            'bookingCustomer',
            'barber',
            'service',
            'addOns',
            'emailDeliveries',
        ]);

        EntityChange::dispatch('appointments');

        return new AppointmentResource($appointment);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, string $id)
    {
        $result = DB::transaction(function () use ($id, $request): array {
            $appointment = Appointment::whereKey($id)->lockForUpdate()->firstOrFail();

            if (in_array($appointment->status, AppointmentBookingService::ACTIVE_STATUSES, true)) {
                return ['archived' => false];
            }

            $appointment->update([
                'active_slot_key' => null,
                'archived_by_user_id' => $request->user()?->id,
            ]);
            $appointment->delete();

            return ['archived' => true];
        }, 3);

        if (! $result['archived']) {
            return response()->json([
                'message' => 'Pending or confirmed bookings must be cancelled or rejected before archiving.',
            ], 422);
        }

        EntityChange::dispatch('appointments');

        return response()->json([
            'message' => 'Booking archived successfully.',
        ]);
    }

    public function overviewStats()
    {
        $from = Carbon::now()->subYear()->toDateString();
        $to = Carbon::today()->addDay()->toDateString();

        $stats = Appointment::withTrashed()
            ->where('appointment_date', '>=', $from)
            ->where('appointment_date', '<', $to)
            ->selectRaw("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_appointments, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_appointments, SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_appointments, SUM(CASE WHEN status = 'completed' THEN price ELSE 0 END) as total_revenue")
            ->first();

        $totalCustomers = BookingCustomer::query()->count();

        return response()->json([
            'completed_appointments' => (int) ($stats->completed_appointments ?? 0),
            'pending_appointments' => (int) ($stats->pending_appointments ?? 0),
            'confirmed_appointments' => (int) ($stats->confirmed_appointments ?? 0),
            'total_customers' => $totalCustomers,
            'total_revenue' => (float) ($stats->total_revenue ?? 0),
        ]);
    }

    public function pendingCount()
    {
        $count = Appointment::where('status', 'pending')->count();

        return response()->json([
            'success' => true,
            'data' => [
                'count' => $count,
            ],
        ]);
    }

    public function monthlyRevenue()
    {
        $startDate = Carbon::today()->subDays(29);
        $endDate = Carbon::today();

        $rows = Appointment::withTrashed()->select([
            DB::raw("DATE_FORMAT(appointment_date, '%Y-%m-%d') as date"),
            DB::raw('SUM(price) as revenue'),
        ])
            ->where('status', 'completed')
            ->whereBetween('appointment_date', [$startDate->toDateString(), $endDate->toDateString()])
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        $revenuesByDate = $rows->mapWithKeys(function ($row) {
            return [$row->date => (float) $row->revenue];
        });

        $dailyData = [];
        $cursor = $startDate->copy();

        while ($cursor->lte($endDate)) {
            $key = $cursor->toDateString();
            $dailyData[] = [
                'date' => $key,
                'revenue' => (float) ($revenuesByDate[$key] ?? 0),
            ];
            $cursor->addDay();
        }

        return response()->json($dailyData);
    }

    public function serviceStats()
    {
        $from = Carbon::now()->subYear()->toDateString();
        $to = Carbon::today()->addDay()->toDateString();
        $serviceName = "COALESCE(appointments.service_name_snapshot, services.name, 'Unknown')";
        $rows = Appointment::withTrashed()
            ->leftJoin('services', 'services.id', '=', 'appointments.service_id')
            ->where('status', 'completed')
            ->where('appointments.appointment_date', '>=', $from)
            ->where('appointments.appointment_date', '<', $to)
            ->selectRaw("{$serviceName} as service_name, COUNT(*) as completed_count")
            ->groupBy(DB::raw($serviceName))
            ->orderByDesc('completed_count')
            ->get()
            ->map(function ($row) {
                return [
                    'service_name' => $row->service_name,
                    'completed_count' => (int) $row->completed_count,
                ];
            })
            ->values();

        return response()->json($rows);
    }

    public function weeklySchedule(DashboardScheduleRequest $request)
    {
        $validated = $request->validated();
        $timezone = (string) config('app.shop_timezone', 'Asia/Manila');
        $selectedDate = Carbon::createFromFormat('!Y-m-d', $validated['date'], $timezone);
        $weekStart = $selectedDate->copy()->startOfWeek(Carbon::MONDAY);
        $weekEnd = $weekStart->copy()->addDays(6);
        $now = Carbon::now($timezone);
        $today = $now->copy()->startOfDay();

        $activeBarberIds = User::query()
            ->where('role', 'barber')
            ->where('is_active', true)
            ->pluck('id')
            ->map(fn ($id): int => (int) $id)
            ->all();

        $activeAppointments = Appointment::with('service:id,duration')
            ->whereBetween('appointment_date', [
                $weekStart->toDateString(),
                $weekEnd->toDateString(),
            ])
            ->whereIn('status', AppointmentBookingService::ACTIVE_STATUSES)
            ->whereNotNull('active_slot_key')
            ->whereIn('barber_user_id', $activeBarberIds)
            ->get([
                'id',
                'service_id',
                'barber_user_id',
                'appointment_date',
                'appointment_time',
                'duration_minutes',
            ]);

        $activeAppointmentsByDate = $activeAppointments->groupBy(
            fn (Appointment $appointment): string => $appointment->appointment_date->toDateString(),
        );

        $weeklyAppointmentStats = Appointment::withTrashed()
            ->whereBetween('appointment_date', [
                $weekStart->toDateString(),
                $weekEnd->toDateString(),
            ])
            ->selectRaw("
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_appointments,
                SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_appointments,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_appointments
            ")
            ->first();

        $averageRating = DB::table('appointment_feedback')
            ->join('appointments', 'appointments.id', '=', 'appointment_feedback.appointment_id')
            ->whereBetween('appointments.appointment_date', [
                $weekStart->toDateString(),
                $weekEnd->toDateString(),
            ])
            ->avg('appointment_feedback.rating');

        $closures = ClosedDates::query()
            ->where('is_removed', false)
            ->whereBetween('date_closed', [
                $weekStart->toDateString(),
                $weekEnd->toDateString(),
            ])
            ->get(['date_closed', 'closure_scope', 'barber_user_id']);
        $shopClosedDateMap = $closures
            ->where('closure_scope', 'shop')
            ->mapWithKeys(fn (ClosedDates $closure): array => [(string) $closure->date_closed => true])
            ->all();
        $barberClosedDateMap = $closures
            ->where('closure_scope', 'barber')
            ->groupBy(fn (ClosedDates $closure): string => (string) $closure->date_closed)
            ->map(fn (Collection $dateClosures): array => $dateClosures
                ->pluck('barber_user_id')
                ->map(fn ($barberId): int => (int) $barberId)
                ->all())
            ->all();

        $days = [];
        for ($offset = 0; $offset < 7; $offset++) {
            $date = $weekStart->copy()->addDays($offset);
            $dateKey = $date->toDateString();
            $availableBarberIds = array_values(array_diff(
                $activeBarberIds,
                $barberClosedDateMap[$dateKey] ?? [],
            ));
            $dateSlots = $this->dashboardSlotsForDate($dateKey, $availableBarberIds);
            $isRecurringClosed = ! $this->scheduleService->isRecurringOpenDate($date)
                && $dateSlots === [];
            $isClosed = isset($shopClosedDateMap[$dateKey])
                || $availableBarberIds === []
                || $dateSlots === [];
            $isPast = $date->lt($today);
            $dayAppointments = $activeAppointmentsByDate->get($dateKey, new Collection);
            $occupiedIntervals = $this->dashboardOccupiedIntervals($dayAppointments);
            $totalSlots = 0;
            $availableSlots = 0;

            if (! $isClosed && ! $isPast) {
                foreach ($dateSlots as $slot) {
                    $slotMinutes = $this->dashboardTimeToMinutes($slot['value']);
                    if ($this->dashboardSlotIsPast($date, $slotMinutes, $now)) {
                        continue;
                    }

                    $eligibleBarberIds = $this->dashboardEligibleBarberIds(
                        $dateKey,
                        $slot['value'],
                        $availableBarberIds,
                    );
                    $totalSlots += count($eligibleBarberIds);
                    $availableSlots += $this->dashboardAvailableBarberCount(
                        $eligibleBarberIds,
                        $occupiedIntervals,
                        $slotMinutes,
                    );
                }
            }

            $days[] = [
                'date' => $dateKey,
                'day' => strtoupper($date->format('D')),
                'day_number' => (int) $date->format('j'),
                'available_slots' => $availableSlots,
                'total_slots' => $totalSlots,
                'is_today' => $date->isSameDay($today),
                'is_past' => $isPast,
                'is_closed' => $isClosed,
                'is_recurring_closed' => $isRecurringClosed,
                'is_fully_booked' => ! $isClosed
                    && ! $isPast
                    && $totalSlots > 0
                    && $availableSlots === 0,
            ];
        }

        $selectedDateKey = $selectedDate->toDateString();
        $selectedSchedule = $this->scheduleService->forDate($selectedDate);
        $selectedAppointments = Appointment::with([
            'bookingCustomer:id,fullname,email,contact_number',
            'barber:id,fullname',
            'service:id,name',
        ])
            ->whereDate('appointment_date', $selectedDateKey)
            ->whereIn('status', self::DASHBOARD_SLOT_STATUSES)
            ->get();
        $selectedActiveAppointments = $activeAppointmentsByDate->get(
            $selectedDateKey,
            new Collection,
        );
        $selectedAvailableBarberIds = array_values(array_diff(
            $activeBarberIds,
            $barberClosedDateMap[$selectedDateKey] ?? [],
        ));
        $selectedDateIsClosed = isset($shopClosedDateMap[$selectedDateKey])
            || $selectedAvailableBarberIds === []
            || $this->dashboardSlotsForDate($selectedDateKey, $selectedAvailableBarberIds) === [];

        return response()->json([
            'selected_date' => $selectedDateKey,
            'week_start' => $weekStart->toDateString(),
            'week_end' => $weekEnd->toDateString(),
            'opening_time' => substr((string) $selectedSchedule->opening_time, 0, 5),
            'closing_time' => substr((string) $selectedSchedule->closing_time, 0, 5),
            'active_barbers' => count($activeBarberIds),
            'weekly_stats' => [
                'completed_appointments' => (int) ($weeklyAppointmentStats?->completed_appointments ?? 0),
                'confirmed_appointments' => (int) ($weeklyAppointmentStats?->confirmed_appointments ?? 0),
                'pending_appointments' => (int) ($weeklyAppointmentStats?->pending_appointments ?? 0),
                'average_rating' => $averageRating ? round((float) $averageRating, 1) : 0,
            ],
            'days' => $days,
            'time_slots' => $this->buildDashboardTimeSlots(
                $selectedDate,
                $selectedAppointments,
                $selectedActiveAppointments,
                $selectedAvailableBarberIds,
                $selectedDateIsClosed,
                $now,
            ),
        ]);
    }

    public function timeSlots(Request $request)
    {
        $validated = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
        ]);

        $date = $validated['date'];

        $appointments = Appointment::with(['bookingCustomer:id,fullname,email,contact_number', 'barber:id,fullname', 'service:id,name'])
            ->whereDate('appointment_date', $date)
            ->whereIn('status', self::DASHBOARD_SLOT_STATUSES)
            ->get();

        $slotMap = [];
        foreach ($appointments as $appointment) {
            $time24 = substr((string) $appointment->appointment_time, 0, 5);
            $time12 = Carbon::createFromFormat('H:i', $time24)->format('g:i A');

            $slotMap[$time12][] = [
                'id' => $appointment->id,
                'customer' => $appointment->customerDisplayName(),
                'customer_email' => $appointment->customer_email_snapshot ?? $appointment->bookingCustomer?->email,
                'customer_contact' => $appointment->customer_contact_number_snapshot ?? $appointment->bookingCustomer?->contact_number,
                'service' => $appointment->service?->name,
                'barber' => $appointment->barber?->fullname,
                'price' => (float) $appointment->price,
                'notes' => $appointment->notes,
                'appointment_date' => $appointment->appointment_date,
                'appointment_time' => $appointment->appointment_time,
                'status' => $appointment->status,
            ];
        }

        $slots = [];
        $activeBarberIds = User::query()
            ->where('role', 'barber')
            ->where('is_active', true)
            ->pluck('id')
            ->map(fn ($id): int => (int) $id)
            ->all();
        foreach ($this->dashboardSlotsForDate($date, $activeBarberIds) as $slot) {
            $appts = $slotMap[$slot['label']] ?? [];
            $slots[] = [
                'time' => $slot['label'],
                'appointments' => $appts,
                'status' => count($appts) > 0 ? 'booked' : 'available',
            ];
        }

        return response()->json($slots);
    }

    public function availableSlots(Request $request)
    {
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
                'after_or_equal:'.Carbon::today((string) config('app.shop_timezone', 'Asia/Manila'))->toDateString(),
                'before_or_equal:'.Carbon::today((string) config('app.shop_timezone', 'Asia/Manila'))->addDays($this->scheduleService->bookingDaysAhead())->toDateString(),
            ],
            'ignore_appointment_id' => ['sometimes', 'integer', 'exists:appointments,id'],
        ]);

        if (isset($validated['ignore_appointment_id'])
            && ! in_array($request->user()?->role, ['admin', 'manager'], true)) {
            abort(403, 'Only staff may exclude a booking while checking a reschedule.');
        }

        $timeSlots = $this->scheduleService->startTimesFor(
            $validated['date'],
            (int) $validated['barber_id'],
        );

        if ($timeSlots === []) {
            throw ValidationException::withMessages([
                'date' => 'The selected date is not available for booking.',
            ]);
        }

        $nextDate = Carbon::parse($validated['date'])->addDay()->toDateString();
        $slots = Appointment::with('service:id,duration')
            ->where('barber_user_id', $validated['barber_id'])
            ->where('appointment_date', '>=', $validated['date'])
            ->where('appointment_date', '<', $nextDate)
            ->whereIn('status', ['pending', 'confirmed'])
            ->whereNotNull('active_slot_key')
            ->when(
                isset($validated['ignore_appointment_id']),
                fn ($query) => $query->whereKeyNot($validated['ignore_appointment_id']),
            )
            ->get(['id', 'service_id', 'appointment_time', 'duration_minutes'])
            ->map(fn (Appointment $appointment): array => [
                'appointment_time' => substr((string) $appointment->appointment_time, 0, 5),
                'duration_minutes' => max(
                    1,
                    (int) ($appointment->duration_minutes ?? $appointment->service?->duration ?? 60),
                ),
            ])
            ->values();

        return response()->json([
            'data' => $slots,
            'time_slots' => $timeSlots,
        ]);
    }

    private function buildDashboardTimeSlots(
        Carbon $date,
        Collection $appointments,
        Collection $activeAppointments,
        array $activeBarberIds,
        bool $isClosed,
        Carbon $now,
    ): array {
        $appointmentsByTime = $appointments->groupBy(
            fn (Appointment $appointment): string => substr((string) $appointment->appointment_time, 0, 5),
        );
        $occupiedIntervals = $this->dashboardOccupiedIntervals($activeAppointments);
        $isPastDate = $date->copy()->startOfDay()->lt($now->copy()->startOfDay());

        return collect($this->dashboardSlotsForDate($date->toDateString(), $activeBarberIds))->map(function (array $slot) use (
            $activeBarberIds,
            $appointmentsByTime,
            $date,
            $isClosed,
            $isPastDate,
            $now,
            $occupiedIntervals,
        ): array {
            $slotMinutes = $this->dashboardTimeToMinutes($slot['value']);
            $isPast = $isPastDate || $this->dashboardSlotIsPast($date, $slotMinutes, $now);
            $eligibleBarberIds = $this->dashboardEligibleBarberIds(
                $date->toDateString(),
                $slot['value'],
                $activeBarberIds,
            );
            $availableBarbers = $isClosed || $isPast
                ? 0
                : $this->dashboardAvailableBarberCount(
                    $eligibleBarberIds,
                    $occupiedIntervals,
                    $slotMinutes,
                );
            $slotAppointments = $appointmentsByTime->get($slot['value'], new Collection);

            return [
                'time' => $slot['label'],
                'appointments' => $slotAppointments
                    ->map(fn (Appointment $appointment): array => [
                        'id' => $appointment->id,
                        'customer' => $appointment->customerDisplayName(),
                        'customer_email' => $appointment->customer_email_snapshot ?? $appointment->bookingCustomer?->email,
                        'customer_contact' => $appointment->customer_contact_number_snapshot ?? $appointment->bookingCustomer?->contact_number,
                        'service' => $appointment->service?->name,
                        'barber' => $appointment->barber?->fullname,
                        'price' => (float) $appointment->price,
                        'notes' => $appointment->notes,
                        'appointment_date' => $appointment->appointment_date,
                        'appointment_time' => $appointment->appointment_time,
                        'status' => $appointment->status,
                    ])
                    ->values()
                    ->all(),
                'status' => $slotAppointments->isNotEmpty() ? 'booked' : 'available',
                'available_barbers' => $availableBarbers,
                'total_barbers' => count($eligibleBarberIds),
                'is_past' => $isPast,
                'is_closed' => $isClosed,
                'is_fully_booked' => ! $isClosed
                    && ! $isPast
                    && count($eligibleBarberIds) > 0
                    && $availableBarbers === 0,
            ];
        })->all();
    }

    private function dashboardSlotsForDate(string $date, array $barberIds): array
    {
        return collect($barberIds)
            ->flatMap(fn (int $barberId): array => $this->scheduleTimesFor($date, $barberId))
            ->unique()
            ->sortBy(fn (string $time): int => $this->scheduleService->timeToMinutes($time))
            ->map(fn (string $time): array => [
                'value' => $time,
                'label' => Carbon::createFromFormat('H:i', $time)->format('g:i A'),
            ])
            ->values()
            ->all();
    }

    private function dashboardEligibleBarberIds(string $date, string $time, array $barberIds): array
    {
        return array_values(array_filter(
            $barberIds,
            fn (int $barberId): bool => in_array($time, $this->scheduleTimesFor($date, $barberId), true),
        ));
    }

    private function scheduleTimesFor(string $date, int $barberId): array
    {
        $key = $date.'|'.$barberId;

        return $this->scheduleTimesCache[$key]
            ??= $this->scheduleService->startTimesFor($date, $barberId);
    }

    private function dashboardOccupiedIntervals(iterable $appointments): array
    {
        $intervals = [];

        foreach ($appointments as $appointment) {
            $start = $this->dashboardTimeToMinutes(
                substr((string) $appointment->appointment_time, 0, 5),
            );
            $duration = max(
                1,
                (int) ($appointment->duration_minutes ?? $appointment->service?->duration ?? 60),
            );
            $intervals[(int) $appointment->barber_user_id][] = [
                'start' => $start,
                'end' => $start + $duration,
            ];
        }

        return $intervals;
    }

    private function dashboardAvailableBarberCount(
        array $activeBarberIds,
        array $occupiedIntervals,
        int $slotMinutes,
    ): int {
        $available = 0;

        foreach ($activeBarberIds as $barberId) {
            $isOccupied = false;
            foreach ($occupiedIntervals[$barberId] ?? [] as $interval) {
                if ($slotMinutes >= $interval['start'] && $slotMinutes < $interval['end']) {
                    $isOccupied = true;
                    break;
                }
            }

            if (! $isOccupied) {
                $available++;
            }
        }

        return $available;
    }

    private function dashboardSlotIsPast(
        Carbon $date,
        int $slotMinutes,
        Carbon $now,
    ): bool {
        return $date->copy()
            ->setTime(intdiv($slotMinutes, 60), $slotMinutes % 60)
            ->addMinutes(15)
            ->lt($now);
    }

    private function dashboardTimeToMinutes(string $time): int
    {
        [$hours, $minutes] = array_map('intval', explode(':', $time));

        return ($hours * 60) + $minutes;
    }

    private function assertStaffCanCreateType(User $user, string $moduleKey): void
    {
        if ($user->role !== 'admin') {
            return;
        }

        if (! $user->canAccessModule($moduleKey)) {
            abort(403, "Forbidden: the {$moduleKey} module is required.");
        }
    }
}
