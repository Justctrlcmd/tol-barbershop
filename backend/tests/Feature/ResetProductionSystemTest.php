<?php

use App\Models\Appointment;
use App\Models\AppointmentFeedback;
use App\Models\BookingCustomer;
use App\Models\User;

test('fresh start creates standalone featured feedback without customer records', function () {
    $comments = [
        'Ang linis ng fade, sakto yung haba at hindi minadali.',
        'Magaan kamay ng barber, comfortable buong gupit.',
        'Nagustuhan ko na sinusunod talaga yung style na gusto ko.',
        'Malinis yung shop at maayos kausap yung staff, good experience overall.',
        'First time ko dito pero satisfied ako, babalik ulit ako next haircut.',
    ];

    $this->artisan('system:fresh-start', ['--confirm-production' => true])
        ->expectsConfirmation(
            'This will erase the application database and all Gallery images from Cloudinary. Continue?',
            'yes',
        )
        ->expectsQuestion('Manager full name', 'Test Manager')
        ->expectsQuestion('Manager email', 'manager@example.test')
        ->expectsQuestion('Manager password', 'password123')
        ->expectsQuestion('Confirm manager password', 'password123')
        ->expectsQuestion('Manager contact number (optional; leave blank for none)', '')
        ->assertSuccessful();

    $feedback = AppointmentFeedback::query()->orderBy('id')->get();

    expect(User::query()->where('role', 'manager')->count())->toBe(1)
        ->and(BookingCustomer::query()->count())->toBe(0)
        ->and(Appointment::query()->count())->toBe(0)
        ->and($feedback)->toHaveCount(5)
        ->and($feedback->pluck('rating')->unique()->all())->toBe([5])
        ->and($feedback->pluck('is_featured')->unique()->all())->toBe([true])
        ->and($feedback->pluck('appointment_id')->filter()->count())->toBe(0)
        ->and($feedback->pluck('booking_customer_id')->filter()->count())->toBe(0)
        ->and($feedback->pluck('customer_name_snapshot')->filter()->unique()->count())->toBe(5)
        ->and($feedback->pluck('comment')->sort()->values()->all())->toBe(collect($comments)->sort()->values()->all());
});
