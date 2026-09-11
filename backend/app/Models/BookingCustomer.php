<?php

namespace App\Models;

use App\Models\Scopes\ActiveBookingCustomerScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BookingCustomer extends Model
{
    protected $fillable = [
        'fullname',
        'email',
        'contact_number',
    ];

    protected static function booted(): void
    {
        static::addGlobalScope(new ActiveBookingCustomerScope);
    }

    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class);
    }

    public function feedback(): HasMany
    {
        return $this->hasMany(AppointmentFeedback::class);
    }

    public function mergedInto(): BelongsTo
    {
        return $this->belongsTo(self::class, 'merged_into_id');
    }

    public function mergedCustomers(): HasMany
    {
        return $this->hasMany(self::class, 'merged_into_id')
            ->withoutGlobalScope(ActiveBookingCustomerScope::class);
    }

    public function canonical(): self
    {
        $customer = $this;
        $seen = [];

        while ($customer->merged_into_id && ! isset($seen[$customer->id])) {
            $seen[$customer->id] = true;
            $next = self::withoutGlobalScope(ActiveBookingCustomerScope::class)
                ->find($customer->merged_into_id);

            if (! $next) {
                break;
            }

            $customer = $next;
        }

        return $customer;
    }
}
