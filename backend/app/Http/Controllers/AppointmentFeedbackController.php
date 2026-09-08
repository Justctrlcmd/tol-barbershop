<?php

namespace App\Http\Controllers;

use App\Http\Requests\FeedbackListRequest;
use App\Http\Requests\PublicFeedbackRequest;
use App\Http\Resources\AppointmentFeedbackResource;
use App\Models\Appointment;
use App\Models\AppointmentFeedback;
use App\Models\FeedbackToken;
use App\Support\DisplayId;
use App\Support\EntityChange;
use App\Traits\ApiResponseTrait;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AppointmentFeedbackController extends Controller
{
    use ApiResponseTrait;

    public function publicStatus(Request $request)
    {
        $validated = $request->validate([
            'token' => ['required', 'string', 'size:64'],
        ]);

        $token = FeedbackToken::query()
            ->where('token_hash', hash('sha256', $validated['token']))
            ->whereNull('used_at')
            ->where('expires_at', '>', now())
            ->with(['appointment.service', 'appointment.barber'])
            ->first();

        if (! $token) {
            return $this->error('This rating link is invalid, expired, or already used.', [], 422);
        }

        $appointment = $token->appointment
            ?? Appointment::query()->where('batch_id', $token->batch_id)->with(['service', 'barber'])->oldest('id')->first();

        return $this->success('Rating link is valid.', [
            'reference' => $token->batch_id
                ? DisplayId::group($appointment?->id)
                : DisplayId::booking($appointment?->id),
            'barber_name' => $appointment?->barber?->fullname,
            'service_name' => $token->batch_id ? 'Group booking' : $appointment?->service?->name,
        ]);
    }

    public function publicStore(PublicFeedbackRequest $request)
    {
        $validated = $request->validated();

        $result = DB::transaction(function () use ($validated): array {
            $token = FeedbackToken::query()
                ->where('token_hash', hash('sha256', $validated['token']))
                ->lockForUpdate()
                ->first();

            if (! $token || $token->used_at || $token->expires_at->isPast()) {
                return ['error' => 'This rating link is invalid, expired, or already used.'];
            }

            $appointment = $token->appointment()->first()
                ?? Appointment::query()->where('batch_id', $token->batch_id)->oldest('id')->first();
            if (! $appointment || $appointment->status !== 'completed') {
                return ['error' => 'Feedback can only be submitted for a completed booking.'];
            }

            $customer = $token->bookingCustomer()->firstOrFail();
            $feedback = AppointmentFeedback::create([
                'appointment_id' => $appointment->id,
                'batch_id' => $token->batch_id,
                'booking_customer_id' => $customer->id,
                'rating' => $validated['rating'],
                'comment' => filled($validated['comment'] ?? null) ? trim($validated['comment']) : null,
                'is_featured' => false,
                'customer_name_snapshot' => $customer->fullname,
            ]);

            $token->forceFill(['used_at' => now()])->save();

            return ['feedback' => $feedback];
        }, 3);

        if (isset($result['error'])) {
            return $this->error($result['error'], [], 422);
        }

        $result['feedback']->load(['bookingCustomer', 'appointment.service', 'appointment.barber']);
        EntityChange::dispatch('feedback');

        return $this->created('Thank you for your feedback.', new AppointmentFeedbackResource($result['feedback']));
    }

    public function toggleFeature(Request $request, $id)
    {
        $result = DB::transaction(function () use ($id): array {
            $featuredIds = AppointmentFeedback::where('is_featured', true)
                ->orderBy('id')
                ->lockForUpdate()
                ->pluck('id');
            $feedback = AppointmentFeedback::whereKey($id)
                ->lockForUpdate()
                ->first();

            if (! $feedback) {
                abort(404);
            }

            $featuredCount = $featuredIds->count();

            if ($feedback->is_featured && $featuredCount <= 1) {
                return ['error' => 'At least 1 feedback must remain featured.'];
            }

            if (! $feedback->is_featured && $featuredCount >= 5) {
                return ['error' => 'You can feature up to 5 items. Unfeature one first.'];
            }

            $feedback->update(['is_featured' => ! $feedback->is_featured]);

            return [
                'feedback' => $feedback,
                'message' => $feedback->is_featured
                    ? 'Feedback featured successfully.'
                    : 'Feedback removed from featured.',
            ];
        }, 3);

        if (isset($result['error'])) {
            return $this->error($result['error'], [], 422);
        }

        /** @var AppointmentFeedback $feedback */
        $feedback = $result['feedback'];

        $feedback->load(['bookingCustomer', 'appointment.service', 'appointment.barber']);
        EntityChange::dispatch('feedback');

        return $this->success($result['message'], new AppointmentFeedbackResource($feedback));
    }

    public function publicIndex(Request $request)
    {
        $feedback = AppointmentFeedback::with(['bookingCustomer:id,fullname', 'appointment.service:id,name', 'appointment.barber:id,fullname'])
            ->where('rating', 5)
            ->whereNotNull('comment')
            ->where('comment', '<>', '')
            ->latest()
            ->limit(10)
            ->get();

        return $this->success('Feedback retrieved successfully.', [
            'feedback' => AppointmentFeedbackResource::collection($feedback),
        ])->withHeaders([
            'Cache-Control' => 'no-store, max-age=0',
        ]);
    }

    public function featuredIndex(Request $request)
    {
        $feedback = AppointmentFeedback::with(['bookingCustomer:id,fullname', 'appointment.service:id,name', 'appointment.barber:id,fullname'])
            ->where('is_featured', true)
            ->latest()
            ->limit(5)
            ->get();

        return $this->success('Featured feedback retrieved successfully.', [
            'feedback' => AppointmentFeedbackResource::collection($feedback),
        ])->withHeaders([
            'Cache-Control' => 'no-store, max-age=0',
        ]);
    }

    public function index(FeedbackListRequest $request)
    {
        $validated = $request->validated();

        $query = AppointmentFeedback::with(['bookingCustomer:id,fullname', 'appointment.service:id,name', 'appointment.barber:id,fullname']);

        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $like = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $search).'%';
            $query->where(function ($q) use ($like) {
                $q->whereHas('bookingCustomer', fn ($uq) => $uq->whereRaw("fullname LIKE ? ESCAPE '!'", [$like]))
                    ->orWhereRaw("customer_name_snapshot LIKE ? ESCAPE '!'", [$like])
                    ->orWhereHas('appointment.barber', fn ($bq) => $bq->whereRaw("fullname LIKE ? ESCAPE '!'", [$like]))
                    ->orWhereHas('appointment.service', fn ($sq) => $sq->whereRaw("name LIKE ? ESCAPE '!'", [$like]))
                    ->orWhereRaw("comment LIKE ? ESCAPE '!'", [$like]);
            });
        }

        if (! empty($validated['rating'])) {
            $query->where('rating', $validated['rating']);
        }

        if (! empty($validated['featured'])) {
            if ($validated['featured'] === 'featured') {
                $query->where('is_featured', true);
            } elseif ($validated['featured'] === 'not_featured') {
                $query->where('is_featured', false);
            }
        }

        $sortField = $validated['sort'] ?? 'created_at';
        $sortDir = $validated['dir'] ?? 'desc';
        $perPage = $validated['per_page'] ?? 15;
        $feedback = $query
            ->orderBy($sortField, $sortDir)
            ->orderBy('id', $sortDir)
            ->paginate($perPage, ['*'], 'page', $validated['page'] ?? 1);

        return $this->success('Feedback retrieved successfully.', [
            'feedback' => AppointmentFeedbackResource::collection($feedback),
            'meta' => [
                'current_page' => $feedback->currentPage(),
                'last_page' => $feedback->lastPage(),
                'per_page' => $feedback->perPage(),
                'total' => $feedback->total(),
            ],
        ]);
    }
}
