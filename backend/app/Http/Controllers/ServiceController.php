<?php

namespace App\Http\Controllers;

use App\Http\Requests\ServiceRequest;
use App\Http\Resources\ServiceResource;
use App\Models\Service;
use App\Support\EntityChange;
use App\Traits\ApiResponseTrait;
use Illuminate\Http\Request;
use Throwable;

class ServiceController extends Controller
{
    use ApiResponseTrait;

    public function publicIndex()
    {
        try {
            $services = Service::where('is_active', true)->get();

            $data = [
                'services' => ServiceResource::collection($services),
            ];

            return $this->success('Public services retrieved successfully', $data)
                ->withHeaders([
                    'Cache-Control' => 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
                ]);
        } catch (Throwable $exception) {
            report($exception);

            return $this->error('Could not fetch public services', [], 500);
        }
    }

    public function index(Request $request)
    {
        try {
            $query = Service::query();

            if (! $request->user()?->canAccessModule('management')) {
                $query->where('is_active', true);
            }

            $services = $query->get();

            $data = [
                'services' => ServiceResource::collection($services),
            ];

            return $this->success('Services retrieved successfully', $data);

        } catch (Throwable $exception) {
            report($exception);

            return $this->error('Could not fetch services', [], 500);
        }
    }

    public function store(ServiceRequest $request)
    {
        try {
            $validated = $request->validated();

            Service::create($validated);
            EntityChange::dispatch('services');

            return $this->created('Service created successfully');

        } catch (Throwable $exception) {
            report($exception);

            return $this->error('Could not create service', [], 500);
        }
    }

    /**
     * Display the specified resource.
     */
    public function show(string $id)
    {
        $service = Service::find($id);

        if (! $service) {
            return $this->error('Service not found', [], 404);
        }

        return $this->success('Service retrieved successfully', new ServiceResource($service));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(ServiceRequest $request, string $id)
    {
        try {
            $service = Service::find($id);

            if (! $service) {
                return $this->error('Service not found', [], 404);
            }

            $service->update($request->validated());
            EntityChange::dispatch('services');

            return $this->created('Service updated successfully');

        } catch (Throwable $exception) {
            report($exception);

            return $this->error('Could not update service', [], 500);
        }
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id)
    {
        try {
            $service = Service::find($id);

            if (! $service) {
                return $this->error('Service not found', [], 404);
            }

            $service->delete();
            EntityChange::dispatch('services');

            return $this->success('Service deleted successfully');

        } catch (Throwable $exception) {
            report($exception);

            return $this->error('Could not delete service', [], 500);
        }
    }
}
