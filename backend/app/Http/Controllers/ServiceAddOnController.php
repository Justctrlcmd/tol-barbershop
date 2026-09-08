<?php

namespace App\Http\Controllers;

use App\Http\Requests\ServiceAddOnRequest;
use App\Http\Resources\ServiceAddOnResource;
use App\Models\ServiceAddOn;
use App\Support\EntityChange;
use App\Traits\ApiResponseTrait;
use Illuminate\Http\Request;
use Throwable;

class ServiceAddOnController extends Controller
{
    use ApiResponseTrait;

    public function index(Request $request)
    {
        $query = ServiceAddOn::query()->orderBy('name');

        if (! $request->user()?->canAccessModule('management')) {
            $query->where('is_active', true);
        }

        return $this->success('Service add-ons retrieved successfully', [
            'add_ons' => ServiceAddOnResource::collection($query->get()),
        ]);
    }

    public function store(ServiceAddOnRequest $request)
    {
        try {
            $addOn = ServiceAddOn::create($request->validated());
            EntityChange::dispatch('services');

            return $this->created(
                'Service add-on created successfully',
                new ServiceAddOnResource($addOn),
            );
        } catch (Throwable $exception) {
            report($exception);

            return $this->error('Could not create service add-on', [], 500);
        }
    }

    public function show(string $id)
    {
        $addOn = ServiceAddOn::find($id);

        if (! $addOn) {
            return $this->error('Service add-on not found', [], 404);
        }

        return $this->success(
            'Service add-on retrieved successfully',
            new ServiceAddOnResource($addOn),
        );
    }

    public function update(ServiceAddOnRequest $request, string $id)
    {
        try {
            $addOn = ServiceAddOn::find($id);

            if (! $addOn) {
                return $this->error('Service add-on not found', [], 404);
            }

            $addOn->update($request->validated());
            EntityChange::dispatch('services');

            return $this->success(
                'Service add-on updated successfully',
                new ServiceAddOnResource($addOn->refresh()),
            );
        } catch (Throwable $exception) {
            report($exception);

            return $this->error('Could not update service add-on', [], 500);
        }
    }

    public function destroy(string $id)
    {
        try {
            $addOn = ServiceAddOn::find($id);

            if (! $addOn) {
                return $this->error('Service add-on not found', [], 404);
            }

            $addOn->delete();
            EntityChange::dispatch('services');

            return $this->success('Service add-on deleted successfully');
        } catch (Throwable $exception) {
            report($exception);

            return $this->error('Could not delete service add-on', [], 500);
        }
    }
}
