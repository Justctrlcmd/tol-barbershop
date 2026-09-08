<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AnalyticsController;
use App\Http\Controllers\AppointmentAddOnController;
use App\Http\Controllers\AppointmentController;
use App\Http\Controllers\AppointmentFeedbackController;
use App\Http\Controllers\AssistedBookingController;
use App\Http\Controllers\BarberController;
use App\Http\Controllers\BookingEmailDeliveryController;
use App\Http\Controllers\ClosedDatesController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\EditUserController;
use App\Http\Controllers\EntityChangeController;
use App\Http\Controllers\ForgotPasswordController;
use App\Http\Controllers\GalleryImageController;
use App\Http\Controllers\LoginController;
use App\Http\Controllers\LogoutController;
use App\Http\Controllers\ModuleController;
use App\Http\Controllers\NavigationSummaryController;
use App\Http\Controllers\PublicBookingController;
use App\Http\Controllers\PublicBootstrapController;
use App\Http\Controllers\PushSubscriptionController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\ScheduleOpenSlotController;
use App\Http\Controllers\ServiceAddOnController;
use App\Http\Controllers\ServiceController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\WalkinController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('/login', [LoginController::class, 'unauthenticated'])->name('login');

    Route::post('/login', [LoginController::class, 'login'])->middleware('throttle:login');
    Route::post('/forgot-password', [ForgotPasswordController::class, 'sendResetLink'])->middleware('throttle:forgot-password');
    Route::post('/reset-password', [ForgotPasswordController::class, 'resetPassword'])->middleware('throttle:reset-password');
    Route::post('/reset-password/validate-token', [ForgotPasswordController::class, 'validateToken'])->middleware('throttle:validate-reset-token');
    Route::get('/public-services', [ServiceController::class, 'publicIndex'])->middleware('throttle:public-read');
    Route::get('/public-gallery-images', [GalleryImageController::class, 'publicIndex'])->middleware('throttle:public-read');
    Route::get('/public-feedback', [AppointmentFeedbackController::class, 'publicIndex'])->middleware('throttle:public-read');
    Route::get('/public-feedback-form', [AppointmentFeedbackController::class, 'publicStatus'])->middleware('throttle:public-feedback');
    Route::post('/public-feedback-form', [AppointmentFeedbackController::class, 'publicStore'])->middleware('throttle:public-feedback');
    Route::get('/featured-feedback', [AppointmentFeedbackController::class, 'featuredIndex'])->middleware('throttle:public-read');
    Route::get('/public-booking-settings', [SettingsController::class, 'publicBookingSettings'])->middleware('throttle:public-read');
    Route::get('/public-bootstrap', PublicBootstrapController::class)->middleware('throttle:public-read');
    Route::get('/public-booking/bootstrap', [PublicBookingController::class, 'bootstrap'])->middleware('throttle:public-read');
    Route::get('/public-booking/available-slots', [PublicBookingController::class, 'availableSlots'])->middleware('throttle:public-read');
    Route::post('/public-booking/request-otp', [PublicBookingController::class, 'requestOtp'])->middleware('throttle:public-booking-otp');
    Route::post('/public-booking/verify-otp', [PublicBookingController::class, 'verifyOtp'])->middleware('throttle:public-booking-verify');

    Route::middleware(['auth:sanctum', 'active'])->group(function () {
        Route::post('/logout', [LogoutController::class, 'logout'])->middleware('throttle:logout');
        Route::get('/user', [EditUserController::class, 'currentUser'])->middleware('throttle:authenticated-read');

        Route::post('/push/subscribe', [PushSubscriptionController::class, 'subscribe'])->middleware('throttle:authenticated-write');
        Route::post('/push/unsubscribe', [PushSubscriptionController::class, 'unsubscribe'])->middleware('throttle:authenticated-write');
        Route::post('/push/unsubscribe-all', [PushSubscriptionController::class, 'unsubscribeAll'])->middleware('throttle:authenticated-write');
        Route::get('/changes', [EntityChangeController::class, 'index'])->middleware('throttle:polling');
        Route::get('/navigation-summary', NavigationSummaryController::class)->middleware('throttle:authenticated-read');

        Route::middleware('role:admin,manager')->group(function () {
            Route::get('/appointments/pending-count', [AppointmentController::class, 'pendingCount'])->middleware(['module:appointment', 'throttle:polling']);
            Route::get('/appointments/overview/stats', [AppointmentController::class, 'overviewStats'])->middleware(['module:dashboard', 'throttle:authenticated-read']);
            Route::get('/appointments/overview/monthly-revenue', [AppointmentController::class, 'monthlyRevenue'])->middleware(['module:dashboard', 'throttle:authenticated-read']);
            Route::get('/appointments/overview/service-stats', [AppointmentController::class, 'serviceStats'])->middleware(['module:dashboard', 'throttle:authenticated-read']);
            Route::get('/appointments/overview/weekly-schedule', [AppointmentController::class, 'weeklySchedule'])->middleware(['module:dashboard', 'throttle:authenticated-read']);
            Route::get('/appointments/overview/time-slots', [AppointmentController::class, 'timeSlots'])->middleware(['module:dashboard', 'throttle:authenticated-read']);
            Route::get('/analytics/kpi', [AnalyticsController::class, 'kpi'])->middleware(['module:dashboard,reports', 'throttle:authenticated-read']);
            Route::get('/analytics/reports', [AnalyticsController::class, 'reports'])->middleware(['module:reports', 'throttle:authenticated-read']);
            Route::get('/analytics/revenue', [AnalyticsController::class, 'revenue'])->middleware(['module:reports', 'throttle:authenticated-read']);
            Route::get('/analytics/appointments', [AnalyticsController::class, 'appointments'])->middleware(['module:reports', 'throttle:authenticated-read']);
            Route::get('/analytics/services', [AnalyticsController::class, 'services'])->middleware(['module:reports', 'throttle:authenticated-read']);
            Route::get('/analytics/barbers', [AnalyticsController::class, 'barbers'])->middleware(['module:reports', 'throttle:authenticated-read']);
            Route::get('/analytics/ratings', [AnalyticsController::class, 'ratings'])->middleware(['module:reports', 'throttle:authenticated-read']);
            Route::get('/analytics/peak-hours', [AnalyticsController::class, 'peakHours'])->middleware(['module:reports', 'throttle:authenticated-read']);
            Route::get('/analytics/day-of-week', [AnalyticsController::class, 'dayOfWeek'])->middleware(['module:reports', 'throttle:authenticated-read']);
            Route::get('/feedback', [AppointmentFeedbackController::class, 'index'])->middleware(['module:feedback', 'throttle:authenticated-read']);
            Route::put('/feedback/{id}/toggle-feature', [AppointmentFeedbackController::class, 'toggleFeature'])->middleware(['module:feedback', 'throttle:authenticated-write']);
            Route::get('/customers', [CustomerController::class, 'index'])->middleware(['module:crm', 'throttle:authenticated-read']);
            Route::get('/customers/{id}', [CustomerController::class, 'show'])->middleware(['module:crm', 'throttle:authenticated-read']);
            Route::get('/walkins/stats', [WalkinController::class, 'stats'])->middleware(['module:walkin', 'throttle:authenticated-read']);
        });

        Route::apiResource('/services', ServiceController::class)
            ->middlewareFor(['index'], ['role:admin,manager', 'module:management,management-services,appointment,walkin', 'throttle:authenticated-read'])
            ->middlewareFor(['show'], ['role:admin,manager', 'module:management,management-services', 'throttle:authenticated-read'])
            ->middlewareFor(['store', 'update', 'destroy'], ['role:admin,manager', 'module:management', 'module:management-services', 'throttle:authenticated-write']);
        Route::apiResource('/service-add-ons', ServiceAddOnController::class)
            ->middlewareFor(['index'], ['role:admin,manager', 'module:management,management-services,appointment', 'throttle:authenticated-read'])
            ->middlewareFor(['show'], ['role:admin,manager', 'module:management,management-services,appointment', 'throttle:authenticated-read'])
            ->middlewareFor(['store', 'update', 'destroy'], ['role:admin,manager', 'module:management,management-services', 'throttle:authenticated-write']);
        Route::apiResource('/gallery-images', GalleryImageController::class)
            ->only(['index', 'store', 'update', 'destroy'])
            ->middleware(['role:admin,manager', 'module:management,management-gallery'])
            ->middlewareFor(['index'], 'throttle:authenticated-read')
            ->middlewareFor(['store', 'update', 'destroy'], 'throttle:authenticated-write');
        Route::apiResource('/admin', AdminController::class)
            ->middleware(['role:manager'])
            ->middlewareFor(['index', 'show'], 'throttle:authenticated-read')
            ->middlewareFor(['store', 'update', 'destroy'], 'throttle:authenticated-write');
        Route::apiResource('/roles', RoleController::class)
            ->middleware(['role:manager'])
            ->middlewareFor(['index', 'show'], 'throttle:authenticated-read')
            ->middlewareFor(['store', 'update', 'destroy'], 'throttle:authenticated-write');
        Route::get('/modules', [ModuleController::class, 'index'])->middleware(['role:manager', 'throttle:authenticated-read']);

        Route::apiResource('/barber', BarberController::class)
            ->middlewareFor(['index'], ['role:admin,manager', 'module:management,management-barbers,appointment,walkin', 'throttle:authenticated-read'])
            ->middlewareFor(['show'], ['role:admin,manager', 'module:management,management-barbers,appointment,walkin', 'throttle:authenticated-read'])
            ->middlewareFor(['store', 'update', 'destroy'], ['role:admin,manager', 'module:management,management-barbers', 'throttle:authenticated-write']);
        Route::get('/booking-schedule', [SettingsController::class, 'show'])
            ->middleware(['role:admin,manager', 'module:management,management-schedule', 'throttle:authenticated-read']);
        Route::get('/booking-schedule/day', [SettingsController::class, 'day'])
            ->middleware(['role:admin,manager', 'module:management,management-schedule,appointment,walkin', 'throttle:authenticated-read']);
        Route::put('/booking-schedule', [SettingsController::class, 'update'])
            ->middleware(['role:manager', 'throttle:authenticated-write']);
        Route::get('/schedule-open-slots', [ScheduleOpenSlotController::class, 'index'])
            ->middleware(['role:admin,manager', 'module:management,management-schedule', 'throttle:authenticated-read']);
        Route::post('/schedule-open-slots', [ScheduleOpenSlotController::class, 'store'])
            ->middleware(['role:admin,manager', 'module:management,management-schedule', 'throttle:authenticated-write']);
        Route::delete('/schedule-open-slots/{scheduleOpenSlot}', [ScheduleOpenSlotController::class, 'destroy'])
            ->whereNumber('scheduleOpenSlot')
            ->middleware(['role:admin,manager', 'module:management,management-schedule', 'throttle:authenticated-write']);
        Route::get('/closed-dates/activity', [ClosedDatesController::class, 'activity'])
            ->middleware(['role:admin,manager', 'module:management,management-schedule', 'throttle:authenticated-read']);
        Route::get('/closed-dates/check-conflicts', [ClosedDatesController::class, 'checkConflicts'])
            ->middleware(['role:admin,manager', 'module:management,management-schedule', 'throttle:authenticated-read']);
        Route::apiResource('/closed-dates', ClosedDatesController::class)
            ->only(['index', 'store', 'update'])
            ->middlewareFor('index', ['role:admin,manager', 'module:dashboard,management,management-schedule,appointment,walkin', 'throttle:authenticated-read'])
            ->middlewareFor('store', ['role:admin,manager', 'module:management,management-schedule', 'throttle:authenticated-write'])
            ->middlewareFor('update', ['role:admin,manager', 'module:management,management-schedule', 'throttle:authenticated-write']);
        Route::put('/appointments/batch/{batchId}/status', [AppointmentController::class, 'updateBatchStatus'])
            ->where('batchId', 'BATCH-[A-Za-z0-9-]+')
            ->middleware(['role:admin,manager', 'module:appointment', 'throttle:booking-action']);
        Route::post('/assisted-bookings', [AssistedBookingController::class, 'store'])
            ->middleware(['role:admin,manager', 'module:appointment', 'throttle:booking-action']);
        Route::get('/appointments/available-slots', [AppointmentController::class, 'availableSlots'])->middleware(['role:admin,manager', 'module:appointment', 'throttle:authenticated-read']);
        Route::get('/appointments/history', [AppointmentController::class, 'history'])->middleware(['role:admin,manager', 'module:history', 'throttle:authenticated-read']);
        Route::apiResource('/appointments', AppointmentController::class)
            ->middlewareFor('index', ['role:admin,manager', 'module:appointment', 'throttle:authenticated-read'])
            ->middlewareFor('store', ['role:admin,manager', 'module:appointment,walkin', 'throttle:booking-action'])
            ->middlewareFor('show', ['role:admin,manager', 'module:appointment', 'throttle:authenticated-read'])
            ->middlewareFor('update', ['role:admin,manager', 'module:appointment', 'throttle:booking-action'])
            ->middlewareFor('destroy', ['role:admin,manager', 'module:appointment', 'throttle:booking-action']);
        Route::post('/appointments/{appointment}/add-ons', [AppointmentAddOnController::class, 'store'])
            ->middleware(['role:admin,manager', 'module:appointment', 'throttle:booking-action'])
            ->whereNumber('appointment');
        Route::delete('/appointments/{appointment}/add-ons/{addOn}', [AppointmentAddOnController::class, 'destroy'])
            ->middleware(['role:admin,manager', 'module:appointment', 'throttle:booking-action'])
            ->whereNumber('appointment')
            ->whereNumber('addOn');
        Route::put('/change-password', [EditUserController::class, 'changePassword'])->middleware(['role:admin,manager', 'throttle:authenticated-write']);
        Route::put('/change-information', [EditUserController::class, 'changeInformation'])->middleware(['role:admin,manager', 'throttle:authenticated-write']);
        Route::post('/booking-email-deliveries/{delivery}/resend', [BookingEmailDeliveryController::class, 'resend'])
            ->middleware(['role:admin,manager', 'module:appointment', 'throttle:authenticated-write']);
    });
});
