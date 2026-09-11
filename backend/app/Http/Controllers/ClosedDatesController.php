<?php

namespace App\Http\Controllers;

use App\Http\Requests\ClosedDatesRequest;
use App\Http\Requests\ReopenClosedDateRequest;
use App\Http\Resources\ClosedDatesResource;
use App\Models\Appointment;
use App\Models\ClosedDateActivity;
use App\Models\ClosedDates;
use App\Models\User;
use App\Support\EntityChange;
use App\Traits\ApiResponseTrait;
use Carbon\Carbon;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Throwable;

class ClosedDatesController extends Controller
{
    use ApiResponseTrait;

    public function index(Request $request)
    {
        if ($request->has('all')) {
            $showAll = filter_var($request->query('all'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

            if ($showAll === null) {
                throw ValidationException::withMessages(['all' => 'The all field must be true or false.']);
            }

            $request->merge(['all' => $showAll]);
        }

        $validated = $request->validate([
            'all' => ['sometimes', 'boolean'],
            'scope' => ['sometimes', Rule::in(['shop', 'all', 'availability'])],
            'barber_id' => [
                'required_if:scope,availability',
                'nullable',
                'integer',
                Rule::exists('users', 'id')->where(fn ($query) => $query
                    ->where('role', 'barber')
                    ->where('is_active', true)),
            ],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);
        $showAll = (bool) ($validated['all'] ?? false);
        $scope = $validated['scope'] ?? 'shop';
        $perPage = (int) ($validated['per_page'] ?? ($showAll ? 5 : 100));

        if (($showAll || $scope === 'all')
            && ! in_array($request->user()?->role, ['admin', 'manager'], true)) {
            abort(403, 'Forbidden.');
        }

        try {
            $query = ClosedDates::query()
                ->when(! $showAll, fn ($builder) => $builder->where('is_removed', false))
                ->when(
                    $scope === 'shop',
                    fn ($builder) => $builder->where('closure_scope', 'shop'),
                )
                ->when(
                    $scope === 'availability',
                    fn ($builder) => $builder->where(function ($scopeQuery) use ($validated): void {
                        $scopeQuery
                            ->where('closure_scope', 'shop')
                            ->orWhere(function ($barberQuery) use ($validated): void {
                                $barberQuery
                                    ->where('closure_scope', 'barber')
                                    ->where('barber_user_id', $validated['barber_id']);
                            });
                    }),
                );

            $closedDates = $showAll
                ? $query->orderByDesc('created_at')->paginate($perPage)
                : $query->orderBy('date_closed')->orderBy('closure_scope')->paginate($perPage);

            return $this->success('Closed dates fetched successfully', [
                'data' => ClosedDatesResource::collection($closedDates)->items(),
                'current_page' => $closedDates->currentPage(),
                'last_page' => $closedDates->lastPage(),
                'per_page' => $closedDates->perPage(),
                'total' => $closedDates->total(),
            ]);
        } catch (Throwable $exception) {
            report($exception);

            return $this->error('Could not fetch closed dates', [], 500);
        }
    }

    public function activity(Request $request)
    {
        $validated = $request->validate([
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);
        $perPage = (int) ($validated['per_page'] ?? 5);

        $closedDateActivities = DB::table('closed_date_activities')->select([
            'id',
            DB::raw("'closed_date' as activity_type"),
            'closed_date_id',
            DB::raw('NULL as schedule_open_slot_id'),
            'action',
            'closure_scope',
            'date_closed',
            DB::raw('NULL as slot_date'),
            DB::raw('NULL as slot_time'),
            'barber_user_id',
            'barber_name_snapshot',
            'reason',
            'actor_user_id',
            'actor_name_snapshot',
            'created_at',
        ]);
        $openSlotActivities = DB::table('schedule_open_slot_activities')->select([
            'id',
            DB::raw("'open_slot' as activity_type"),
            DB::raw('NULL as closed_date_id'),
            'schedule_open_slot_id',
            'action',
            DB::raw("'barber' as closure_scope"),
            DB::raw('NULL as date_closed'),
            'slot_date',
            'slot_time',
            'barber_user_id',
            'barber_name_snapshot',
            'reason',
            'actor_user_id',
            'actor_name_snapshot',
            'created_at',
        ]);
        $activities = DB::query()
            ->fromSub($closedDateActivities->unionAll($openSlotActivities), 'schedule_activities')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($perPage);

        return $this->success('Schedule activity fetched successfully', [
            'data' => collect($activities->items())->map(fn (object $activity): array => [
                'id' => (int) $activity->id,
                'activity_type' => $activity->activity_type,
                'closed_date_id' => $activity->closed_date_id,
                'schedule_open_slot_id' => $activity->schedule_open_slot_id,
                'action' => $activity->action,
                'closure_scope' => $activity->closure_scope,
                'date_closed' => $activity->date_closed
                    ? substr((string) $activity->date_closed, 0, 10)
                    : null,
                'slot_date' => $activity->slot_date
                    ? substr((string) $activity->slot_date, 0, 10)
                    : null,
                'slot_time' => $activity->slot_time
                    ? substr((string) $activity->slot_time, 0, 5)
                    : null,
                'barber_user_id' => $activity->barber_user_id,
                'barber_name' => $activity->barber_name_snapshot,
                'reason' => $activity->reason,
                'actor_name' => $activity->actor_name_snapshot,
                'created_at' => $activity->created_at,
            ])->values()->all(),
            'current_page' => $activities->currentPage(),
            'last_page' => $activities->lastPage(),
            'per_page' => $activities->perPage(),
            'total' => $activities->total(),
        ]);
    }

    public function store(ClosedDatesRequest $request)
    {
        $validated = $request->validated();
        $actor = $request->user();

        try {
            $closedDate = DB::transaction(function () use ($validated, $actor): ClosedDates {
                $scope = $validated['closure_scope'];
                $barber = null;

                if ($scope === 'barber') {
                    $barber = User::query()
                        ->whereKey($validated['barber_user_id'])
                        ->where('role', 'barber')
                        ->where('is_active', true)
                        ->lockForUpdate()
                        ->first();

                    if (! $barber) {
                        throw ValidationException::withMessages([
                            'barber_user_id' => 'The selected barber is not active.',
                        ]);
                    }
                } else {
                    User::query()
                        ->where('role', 'barber')
                        ->where('is_active', true)
                        ->orderBy('id')
                        ->lockForUpdate()
                        ->get(['id']);
                }

                $scopeKey = $scope === 'barber' ? 'barber:'.$barber->id : 'shop';

                if ($scope === 'barber') {
                    $shopClosureExists = ClosedDates::query()
                        ->where('date_closed', $validated['date_closed'])
                        ->where('closure_scope', 'shop')
                        ->where('is_removed', false)
                        ->lockForUpdate()
                        ->exists();

                    if ($shopClosureExists) {
                        throw ValidationException::withMessages([
                            'date_closed' => 'The shop is already closed on this date.',
                        ]);
                    }
                }

                $existingClosure = ClosedDates::query()
                    ->where('date_closed', $validated['date_closed'])
                    ->where('scope_key', $scopeKey)
                    ->lockForUpdate()
                    ->first();

                if ($existingClosure && ! $existingClosure->is_removed) {
                    throw ValidationException::withMessages([
                        'date_closed' => 'This schedule is already closed.',
                    ]);
                }

                $nextDate = Carbon::createFromFormat(
                    '!Y-m-d',
                    $validated['date_closed'],
                    (string) config('app.shop_timezone', 'Asia/Manila'),
                )->addDay()->toDateString();
                $conflictCount = Appointment::query()
                    ->where('appointment_date', '>=', $validated['date_closed'])
                    ->where('appointment_date', '<', $nextDate)
                    ->whereIn('status', ['pending', 'confirmed'])
                    ->when(
                        $scope === 'barber',
                        fn ($query) => $query->where('barber_user_id', $barber->id),
                    )
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get(['id'])
                    ->count();

                if ($conflictCount > 0) {
                    $subject = $scope === 'barber'
                        ? "Cannot close {$barber->fullname}'s schedule."
                        : 'Cannot close this date.';
                    $appointmentLabel = $conflictCount === 1 ? 'booking' : 'bookings';

                    throw ValidationException::withMessages([
                        'date_closed' => "{$subject} Resolve {$conflictCount} active {$appointmentLabel} first.",
                    ]);
                }

                $closureData = [
                    'date_closed' => $validated['date_closed'],
                    'closure_scope' => $scope,
                    'barber_user_id' => $barber?->id,
                    'barber_name_snapshot' => $barber?->fullname,
                    'scope_key' => $scopeKey,
                    'reason' => $validated['reason'],
                    'is_removed' => false,
                    'created_by_user_id' => $actor?->id,
                ];

                if ($existingClosure) {
                    $existingClosure->update($closureData);
                    $closedDate = $existingClosure;
                } else {
                    $closedDate = ClosedDates::create($closureData);
                }

                ClosedDateActivity::create([
                    'closed_date_id' => $closedDate->id,
                    'action' => 'closed',
                    'closure_scope' => $scope,
                    'date_closed' => $validated['date_closed'],
                    'barber_user_id' => $barber?->id,
                    'barber_name_snapshot' => $barber?->fullname,
                    'reason' => $validated['reason'],
                    'actor_user_id' => $actor?->id,
                    'actor_name_snapshot' => $actor?->fullname,
                ]);

                return $closedDate;
            }, 3);
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'date_closed' => 'This schedule is already closed.',
            ]);
        } catch (Throwable $exception) {
            report($exception);

            return $this->error('Could not create closed date', [], 500);
        }

        EntityChange::dispatch('closed_dates');

        return $this->created(
            'Closed date created successfully',
            new ClosedDatesResource($closedDate),
        );
    }

    public function update(ReopenClosedDateRequest $request, string $id)
    {
        $actor = $request->user();
        $closedDate = DB::transaction(function () use ($id, $actor): ClosedDates {
            $closedDate = ClosedDates::whereKey($id)->lockForUpdate()->firstOrFail();

            if ($closedDate->is_removed) {
                throw ValidationException::withMessages([
                    'closed_date' => 'This schedule is already open.',
                ]);
            }

            $closedDate->update(['is_removed' => true]);

            ClosedDateActivity::create([
                'closed_date_id' => $closedDate->id,
                'action' => 'reopened',
                'closure_scope' => $closedDate->closure_scope,
                'date_closed' => $closedDate->date_closed,
                'barber_user_id' => $closedDate->barber_user_id,
                'barber_name_snapshot' => $closedDate->barber_name_snapshot,
                'reason' => $closedDate->reason,
                'actor_user_id' => $actor?->id,
                'actor_name_snapshot' => $actor?->fullname,
            ]);

            return $closedDate;
        }, 3);

        EntityChange::dispatch('closed_dates');

        return $this->success(
            'Closed date reopened successfully',
            new ClosedDatesResource($closedDate),
        );
    }

    public function checkConflicts(Request $request)
    {
        $validated = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'closure_scope' => ['sometimes', Rule::in(['shop', 'barber'])],
            'barber_user_id' => [
                'required_if:closure_scope,barber',
                'nullable',
                'integer',
                Rule::exists('users', 'id')->where(fn ($query) => $query->where('role', 'barber')),
            ],
        ]);
        $scope = $validated['closure_scope'] ?? 'shop';
        $nextDate = Carbon::parse($validated['date'])->addDay()->toDateString();
        $count = Appointment::query()
            ->where('appointment_date', '>=', $validated['date'])
            ->where('appointment_date', '<', $nextDate)
            ->whereIn('status', ['pending', 'confirmed'])
            ->when(
                $scope === 'barber',
                fn ($query) => $query->where('barber_user_id', $validated['barber_user_id']),
            )
            ->count();

        return $this->success('Conflict check completed', ['count' => $count]);
    }
}
