<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\SanitizesInput;
use App\Services\BookingScheduleService;
use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AppointmentRequest extends FormRequest
{
    use SanitizesInput;

    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->sanitizeStringFields(['walkin_customer_name']);
        $this->sanitizeTextFields(['notes', 'cancellation_reason']);
        $this->normalizePhoneFields(['walkin_customer_contact_number']);
    }

    /**
     * Get the validation rules that apply to the request.
     */
    public function rules(): array
    {
        $isWalkin = (bool) $this->boolean('is_walkin');

        return [
            'booking_customer_id' => [
                'required_without:is_walkin',
                Rule::exists('booking_customers', 'id')->whereNull('merged_into_id'),
            ],

            'service_id' => [
                'required',
                'exists:services,id',
            ],

            'barber_user_id' => [
                'required',
                Rule::exists('users', 'id')->where(function ($query) {
                    $query->where('role', 'barber');
                }),
            ],

            'appointment_date' => [
                'required',
                'date',
                function ($attribute, $value, $fail) use ($isWalkin) {
                    if (! $isWalkin) {
                        return;
                    }

                    $shopTimezone = (string) config('app.shop_timezone', 'Asia/Manila');
                    $todayStr = Carbon::now($shopTimezone)->format('Y-m-d');

                    if ($value > $todayStr) {
                        $fail('Walk-in date cannot be in the future.');

                        return;
                    }

                    $barberUserId = (int) $this->input('barber_user_id');
                    if (app(BookingScheduleService::class)->startTimesFor($value, $barberUserId) === []) {
                        $fail('The selected barber is unavailable on this date.');
                    }
                },
            ],

            'appointment_time' => [
                'required',
                'date_format:H:i',
                function ($attribute, $value, $fail) use ($isWalkin) {
                    if (! $isWalkin) {
                        return;
                    }

                    $date = (string) $this->input('appointment_date');
                    $barberUserId = (int) $this->input('barber_user_id');

                    if ($date === '' || $barberUserId < 1) {
                        return;
                    }

                    if (! app(BookingScheduleService::class)->isStartTimeAllowed($date, $barberUserId, $value)) {
                        $fail('The selected start time is not available.');
                    }
                },
            ],

            'duration_minutes' => [
                'nullable',
                'integer',
                'min:1',
            ],

            'price' => [
                'required',
                'integer',
                'min:0',
                'max:999999',
            ],

            'status' => [
                'nullable',
                Rule::in([
                    'pending',
                    'confirmed',
                    'completed',
                    'cancelled',
                    'no_show',
                    'rejected',
                ]),
            ],

            'is_walkin' => [
                'nullable',
                'boolean',
            ],

            'walkin_customer_name' => [
                'required_if:is_walkin,true',
                'string',
                'min:2',
                'max:255',
                'regex:/^[A-Za-z\s]+$/',
            ],

            'walkin_customer_contact_number' => [
                'nullable',
                'string',
                'max:11',
                'regex:/^09\d{9}$/',
            ],

            'notes' => [
                'nullable',
                'string',
                'max:500',
            ],

            'cancellation_reason' => [
                'required_if:status,cancelled,rejected',
                'nullable',
                'string',
                'max:500',
            ],
        ];
    }

    public function attributes(): array
    {
        return [
            'appointment_date' => 'booking date',
            'appointment_time' => 'booking time',
        ];
    }
}
