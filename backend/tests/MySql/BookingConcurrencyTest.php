<?php

use App\Models\Appointment;
use App\Models\BookingCustomer;
use App\Models\Service;
use App\Models\User;
use App\Services\AppointmentBookingService;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

uses(TestCase::class);

test('simultaneous booking attempts reserve only exact start times', function (array $times, array $expectedExitCodes) {
    if (DB::getDriverName() !== 'mysql') {
        $this->markTestSkipped('This concurrency test requires MySQL.');
    }

    if (! function_exists('pcntl_fork')) {
        $this->markTestSkipped('This concurrency test requires the pcntl extension.');
    }

    Artisan::call('migrate:fresh', ['--force' => true]);

    $firstCustomer = BookingCustomer::create(['fullname' => 'First Customer', 'email' => 'first@example.test', 'contact_number' => '09170000000']);
    $secondCustomer = BookingCustomer::create(['fullname' => 'Second Customer', 'email' => 'second@example.test', 'contact_number' => '09170000001']);
    $barber = User::factory()->create(['role' => 'barber']);
    $service = Service::create([
        'name' => 'Concurrency Haircut',
        'description' => 'MySQL booking concurrency test',
        'duration' => 480,
        'price' => 300,
        'is_active' => true,
    ]);
    $appointmentDate = CarbonImmutable::now('Asia/Manila')->addDay();

    if ($appointmentDate->isSunday()) {
        $appointmentDate = $appointmentDate->addDay();
    }

    $date = $appointmentDate->toDateString();
    $startAt = microtime(true) + 0.5;
    $childPids = [];

    DB::disconnect();

    foreach ([$firstCustomer->id, $secondCustomer->id] as $index => $customerId) {
        $time = $times[$index];
        $pid = pcntl_fork();

        if ($pid === -1) {
            $this->fail('Unable to fork a booking process.');
        }

        if ($pid === 0) {
            DB::purge();
            DB::reconnect();

            while (microtime(true) < $startAt) {
                usleep(1000);
            }

            try {
                DB::transaction(function () use ($customerId, $barber, $service, $date, $time): void {
                    $bookingService = app(AppointmentBookingService::class);
                    $resources = $bookingService->validateAndLock(
                        $customerId,
                        $barber->id,
                        $date,
                        [[
                            'service_id' => $service->id,
                            'appointment_time' => $time,
                        ]],
                        1,
                    );

                    Appointment::create([
                        'booking_customer_id' => $customerId,
                        'service_id' => $service->id,
                        'barber_user_id' => $barber->id,
                        'appointment_date' => $date,
                        'appointment_time' => $time,
                        'duration_minutes' => $service->duration,
                        'price' => $service->price,
                        'status' => 'pending',
                        'active_slot_key' => $bookingService->activeSlotKey($barber->id, $date, $time),
                        'is_walkin' => false,
                        'customer_name_snapshot' => $resources['customer']?->fullname,
                        'service_name_snapshot' => $service->name,
                        'barber_name_snapshot' => $resources['barber']->fullname,
                    ]);
                }, 3);

                exit(0);
            } catch (ValidationException|UniqueConstraintViolationException) {
                exit(10);
            } catch (Throwable) {
                exit(11);
            }
        }

        $childPids[] = $pid;
    }

    $exitCodes = [];

    foreach ($childPids as $childPid) {
        pcntl_waitpid($childPid, $status);
        $exitCodes[] = pcntl_wexitstatus($status);
    }

    sort($exitCodes);
    DB::purge();
    DB::reconnect();

    expect($exitCodes)->toBe($expectedExitCodes);
    expect(Appointment::query()->count())->toBe(count(array_filter($expectedExitCodes, fn (int $code): bool => $code === 0)));
})->with([
    'same start time' => [['09:00', '09:00'], [0, 10]],
    'different start times within a service duration' => [['12:30', '13:00'], [0, 0]],
]);
