<?php

namespace App\Http\Requests;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ScheduleOpenSlotRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('period'))) {
            $this->merge(['period' => strtoupper(trim($this->input('period')))]);
        }
    }

    public function rules(): array
    {
        $today = CarbonImmutable::today((string) config('app.shop_timezone', 'Asia/Manila'));

        return [
            'slot_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:'.$today->toDateString()],
            'barber_user_ids' => ['required', 'array', 'min:1'],
            'barber_user_ids.*' => [
                'required',
                'integer',
                'distinct',
                Rule::exists('users', 'id')->where(fn ($query) => $query
                    ->where('role', 'barber')
                    ->where('is_active', true)),
            ],
            'hour' => ['required', 'integer', 'between:1,12'],
            'minute' => ['required', 'integer', 'between:0,55', 'multiple_of:5'],
            'period' => ['required', Rule::in(['AM', 'PM'])],
        ];
    }
}
