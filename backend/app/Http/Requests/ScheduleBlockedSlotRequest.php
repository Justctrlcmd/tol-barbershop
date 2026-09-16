<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\SanitizesInput;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ScheduleBlockedSlotRequest extends FormRequest
{
    use SanitizesInput;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->sanitizeTextFields(['reason']);
    }

    public function rules(): array
    {
        $today = CarbonImmutable::today((string) config('app.shop_timezone', 'Asia/Manila'));

        return [
            'slot_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:'.$today->toDateString()],
            'barber_user_id' => [
                'required',
                'integer',
                Rule::exists('users', 'id')->where(fn ($query) => $query
                    ->where('role', 'barber')
                    ->where('is_active', true)),
            ],
            'slot_times' => ['required', 'array', 'min:1', 'max:24'],
            'slot_times.*' => [
                'required',
                'string',
                'distinct',
                'regex:/^(?:[01]\d|2[0-3]):[0-5]\d$/',
            ],
            'reason' => ['required', 'string', 'max:255'],
        ];
    }
}
