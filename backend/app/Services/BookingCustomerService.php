<?php

namespace App\Services;

use App\Models\BookingCustomer;
use App\Models\Scopes\ActiveBookingCustomerScope;
use Illuminate\Validation\ValidationException;

class BookingCustomerService
{
    public function findOrCreate(
        string $fullname,
        ?string $email,
        ?string $contact,
        string $contactField = 'contact_number',
        bool $matchByName = false,
    ): BookingCustomer {
        $normalizedName = $this->normalizeName($fullname);

        if (! $email && ! $contact && ! $matchByName) {
            return BookingCustomer::create([
                'fullname' => $fullname,
                'email' => null,
                'contact_number' => null,
            ]);
        }

        $matches = BookingCustomer::withoutGlobalScope(ActiveBookingCustomerScope::class)
            ->where(function ($query) use ($email, $contact, $matchByName, $normalizedName): void {
                if ($email) {
                    $query->where('email', $email);
                }
                if ($contact) {
                    $email
                        ? $query->orWhere('contact_number', $contact)
                        : $query->where('contact_number', $contact);
                }
                if ($matchByName && ! $email && ! $contact) {
                    $query->whereRaw('LOWER(fullname) = ?', [$normalizedName]);
                }
            })
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        $emailMatch = $email
            ? $matches
                ->filter(fn (BookingCustomer $customer): bool => $customer->email === $email)
                ->map(fn (BookingCustomer $customer): BookingCustomer => $customer->canonical())
                ->unique('id')
                ->first()
            : null;
        $contactMatches = $contact
            ? $matches
                ->where('contact_number', $contact)
                ->map(fn (BookingCustomer $customer): BookingCustomer => $customer->canonical())
                ->unique('id')
                ->values()
            : collect();
        $nameMatches = $matchByName && ! $email && ! $contact
            ? $matches
                ->filter(fn (BookingCustomer $customer): bool => $this->normalizeName($customer->fullname) === $normalizedName)
                ->map(fn (BookingCustomer $customer): BookingCustomer => $customer->canonical())
                ->unique('id')
                ->values()
            : collect();

        if ($emailMatch && $contactMatches->contains(fn (BookingCustomer $customer): bool => $customer->id !== $emailMatch->id)) {
            throw ValidationException::withMessages([
                $contactField => 'The email and contact number belong to different customer records.',
            ]);
        }

        if ($contactMatches->count() > 1) {
            throw ValidationException::withMessages([
                $contactField => 'Multiple customers use this contact number. Add the customer email to identify the correct record.',
            ]);
        }

        $identifierMatches = collect([$emailMatch, $contactMatches->first()])
            ->filter()
            ->unique('id')
            ->values();

        if ($identifierMatches->count() > 1) {
            throw ValidationException::withMessages([
                $contactField => 'The provided customer identifiers belong to different customer records.',
            ]);
        }

        $customer = $identifierMatches->first();
        if ($customer && $nameMatches->contains(fn (BookingCustomer $match): bool => $match->id !== $customer->id)) {
            throw ValidationException::withMessages([
                'customer_name' => 'The customer name and contact details belong to different customer records.',
            ]);
        }

        $customer ??= $nameMatches->first();
        $attributes = ['fullname' => $fullname];
        if ($email) {
            $attributes['email'] = $email;
        }
        if ($contact) {
            $attributes['contact_number'] = $contact;
        }

        if ($customer) {
            $customer->update($attributes);

            return $customer->refresh();
        }

        return BookingCustomer::create([
            ...$attributes,
            'email' => $email,
            'contact_number' => $contact,
        ]);
    }

    private function normalizeName(string $fullname): string
    {
        return preg_replace('/\s+/u', ' ', mb_strtolower(trim($fullname))) ?? mb_strtolower(trim($fullname));
    }
}
