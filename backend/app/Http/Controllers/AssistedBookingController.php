<?php

namespace App\Http\Controllers;

use App\Http\Requests\AssistedBookingRequest;
use App\Http\Resources\AppointmentResource;
use App\Models\Appointment;
use App\Services\AppointmentBookingService;
use App\Services\AppointmentNotificationService;
use App\Services\BookingCustomerService;
use App\Support\EntityChange;
use Carbon\Carbon;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AssistedBookingController extends Controller
{
    public function __construct(
        private readonly AppointmentBookingService $bookingService,
        private readonly AppointmentNotificationService $notificationService,
        private readonly BookingCustomerService $customerService,
    ) {}

    public function store(AssistedBookingRequest $request)
    {
        $validated = $request->validated();

        try {
            $appointment = DB::transaction(function () use ($validated): Appointment {
                $customer = $this->customerService->findOrCreate(
                    $validated['customer_name'],
                    $validated['customer_email'] ?? null,
                    $validated['customer_contact_number'] ?? null,
                    'customer_contact_number',
                    true,
                );
                $resources = $this->bookingService->validateAndLock(
                    $customer->id,
                    (int) $validated['barber_user_id'],
                    $validated['appointment_date'],
                    [[
                        'service_id' => (int) $validated['service_id'],
                        'appointment_time' => $validated['appointment_time'],
                    ]],
                );
                $service = $resources['services']->get((int) $validated['service_id']);

                return Appointment::create([
                    'booking_customer_id' => $customer->id,
                    'service_id' => $service->id,
                    'barber_user_id' => $resources['barber']->id,
                    'appointment_date' => $validated['appointment_date'],
                    'appointment_time' => $validated['appointment_time'],
                    'duration_minutes' => $service->duration,
                    'price' => $service->price,
                    'status' => 'confirmed',
                    'active_slot_key' => $this->bookingService->activeSlotKey(
                        $resources['barber']->id,
                        $validated['appointment_date'],
                        $validated['appointment_time'],
                    ),
                    'is_walkin' => false,
                    'booking_source' => 'staff_assisted',
                    'notes' => $validated['notes'] ?? null,
                    'confirmed_at' => Carbon::now(),
                    'customer_name_snapshot' => $customer->fullname,
                    'customer_email_snapshot' => $validated['customer_email'] ?? null,
                    'customer_contact_number_snapshot' => $customer->contact_number,
                    'service_name_snapshot' => $service->name,
                    'barber_name_snapshot' => $resources['barber']->fullname,
                ]);
            }, 3);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'appointment_time' => 'The selected time slot was just booked. Please choose another time.',
            ]);
        }

        $appointment->load(['bookingCustomer', 'barber', 'service', 'addOns', 'emailDeliveries']);
        $delivery = $this->notificationService->notifyStatus(
            $appointment,
            'confirmed',
            $request->user()?->id,
        );

        EntityChange::dispatch('appointments');
        if ($delivery) {
            EntityChange::dispatch('notifications');
            $appointment->load('emailDeliveries');
        }

        return (new AppointmentResource($appointment))
            ->response()
            ->setStatusCode(201);
    }
}
