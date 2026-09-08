<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class BookingScheduleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'open_day_from' => ['required', 'integer', 'between:1,7'],
            'open_day_to' => ['required', 'integer', 'between:1,7', 'gte:open_day_from'],
            'closed_weekday' => ['nullable', 'integer', 'between:1,7'],
            'opening_time' => ['required', 'date_format:H:i', 'regex:/^(?:[01]\d|2[0-3]):00$/'],
            'closing_time' => ['required', 'date_format:H:i', 'regex:/^(?:[01]\d|2[0-3]):00$/', 'gte:opening_time'],
            'custom_open_times' => ['required', 'array', 'min:1', 'max:24'],
            'custom_open_times.*' => [
                'required',
                'distinct',
                'date_format:H:i',
                'regex:/^(?:[01]\d|2[0-3]):(?:00|05|10|15|20|25|30|35|40|45|50|55)$/',
                'gte:opening_time',
                'lte:closing_time',
            ],
            'booking_days_ahead' => ['required', 'integer', 'between:1,30'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            $closedWeekday = $this->integer('closed_weekday');

            if ($this->filled('closed_weekday') && (
                $closedWeekday < $this->integer('open_day_from')
                || $closedWeekday > $this->integer('open_day_to')
            )) {
                $validator->errors()->add(
                    'closed_weekday',
                    'The closed day must be within the selected open-day range.',
                );
            }
        });
    }

    public function messages(): array
    {
        return [
            'open_day_to.gte' => 'The last open day cannot come before the first open day.',
            'closing_time.gte' => 'The closing time cannot be earlier than the opening time.',
            'custom_open_times.*.gte' => 'Each custom time must be within the working hours.',
            'custom_open_times.*.lte' => 'Each custom time must be within the working hours.',
            'custom_open_times.*.distinct' => 'Each custom time must be unique.',
            'booking_days_ahead.between' => 'Booking days in advance must be between 1 and 30.',
        ];
    }
}
