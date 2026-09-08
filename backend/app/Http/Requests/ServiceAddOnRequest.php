<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\SanitizesInput;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ServiceAddOnRequest extends FormRequest
{
    use SanitizesInput;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->sanitizeStringFields(['name']);
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $addOnId = $this->route('service_add_on');

        return [
            'name' => [
                'required',
                'string',
                'min:1',
                'max:255',
                "regex:/^[A-Za-z0-9\\s&'().+\\-]+$/",
                Rule::unique('service_add_ons', 'name')
                    ->ignore($addOnId)
                    ->whereNull('deleted_at'),
            ],
            'price' => [
                'required',
                'integer',
                'min:0',
                'max:999999',
            ],
            'is_active' => [
                'required',
                'boolean',
            ],
        ];
    }
}
