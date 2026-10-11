<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\SanitizesInput;
use App\Services\BookingScheduleService;
use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PublicBookingRequest extends FormRequest
{
    use SanitizesInput;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->sanitizeStringFields(['fullname']);
        $this->normalizeEmailFields(['email', 'email_confirmation']);
        $this->normalizePhoneFields(['contact_number']);
        $this->sanitizeTextFields(['notes']);

        $appointments = $this->input('appointments', []);
        if (is_array($appointments)) {
            foreach ($appointments as &$appointment) {
                if (is_array($appointment) && isset($appointment['customer_name']) && is_string($appointment['customer_name'])) {
                    $appointment['customer_name'] = strip_tags(trim($appointment['customer_name']));
                }
            }
            unset($appointment);
            $this->merge(['appointments' => $appointments]);
        }
    }

    public function rules(): array
    {
        $today = Carbon::today((string) config('app.shop_timezone', 'Asia/Manila'));

        return [
            'mode' => ['required', Rule::in(['single', 'group'])],
            'fullname' => ['required', 'string', 'min:2', 'max:255', 'regex:/^[\pL\s.\'-]+$/u'],
            'email' => ['required', 'string', 'email:rfc', 'max:255', 'confirmed'],
            'email_confirmation' => ['required', 'string', 'email:rfc', 'max:255'],
            'contact_number' => ['required', 'string', 'regex:/^09\d{9}$/'],
            'terms_accepted' => ['required', 'accepted'],
            'privacy_acknowledged' => ['required', 'accepted'],
            'barber_user_id' => [
                'required',
                'integer',
                Rule::exists('users', 'id')->where(fn ($query) => $query
                    ->where('role', 'barber')
                    ->where('is_active', true)),
            ],
            'appointment_date' => [
                'required',
                'date_format:Y-m-d',
                'after_or_equal:'.$today->toDateString(),
                'before_or_equal:'.$today->copy()->addDays(app(BookingScheduleService::class)->bookingDaysAhead())->toDateString(),
            ],
            'notes' => ['nullable', 'string', 'max:500'],
            'appointments' => ['required', 'array', 'min:1', 'max:11'],
            'appointments.*.customer_name' => ['nullable', 'string', 'max:255', 'regex:/^[\pL\s.\'-]+$/u'],
            'appointments.*.service_id' => ['required', 'integer', Rule::exists('services', 'id')->where('is_active', true)],
            'appointments.*.appointment_time' => ['required', 'date_format:H:i'],
            'appointments.*.add_on_ids' => ['sometimes', 'array', 'max:50'],
            'appointments.*.add_on_ids.*' => [
                'integer', 'min:1',
                Rule::exists('service_add_ons', 'id')->where('is_active', true)->whereNull('deleted_at'),
            ],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            $mode = $this->input('mode');
            $appointments = $this->input('appointments', []);
            $count = is_array($appointments) ? count($appointments) : 0;

            if (is_array($appointments)) {
                foreach ($appointments as $index => $appointment) {
                    $ids = $appointment['add_on_ids'] ?? [];
                    if (is_array($ids) && count($ids) !== count(array_unique($ids, SORT_REGULAR))) {
                        $validator->errors()->add("appointments.{$index}.add_on_ids", 'Select each add-on once.');
                    }
                }
            }

            if ($mode === 'single' && $count !== 1) {
                $validator->errors()->add('appointments', 'A single booking must contain exactly one scheduled service.');
            }

            if ($mode === 'group' && ($count < 2 || $count > 11)) {
                $validator->errors()->add('appointments', 'A group booking must contain between 2 and 11 scheduled services.');
            }

            if ($mode === 'group' && is_array($appointments)) {
                foreach ($appointments as $index => $appointment) {
                    if ($index > 0 && blank($appointment['customer_name'] ?? null)) {
                        $validator->errors()->add("appointments.{$index}.customer_name", 'Each additional group member requires a name.');
                    }
                }
            }
        });
    }

    public function attributes(): array
    {
        return [
            'appointment_date' => 'booking date',
            'appointments' => 'bookings',
            'appointments.*.appointment_time' => 'booking time',
        ];
    }
}
