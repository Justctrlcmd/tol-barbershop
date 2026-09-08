<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Appointment extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'booking_customer_id',
        'service_id',
        'barber_user_id',
        'appointment_date',
        'appointment_time',
        'duration_minutes',
        'price',
        'status',
        'active_slot_key',
        'is_walkin',
        'booking_source',
        'walkin_customer_name',
        'walkin_customer_contact_number',
        'notes',
        'cancellation_reason',
        'confirmed_at',
        'completed_at',
        'cancelled_at',
        'rejected_at',
        'batch_id',
        'customer_name',
        'customer_name_snapshot',
        'customer_email_snapshot',
        'customer_contact_number_snapshot',
        'service_name_snapshot',
        'barber_name_snapshot',
        'archived_by_user_id',
    ];

    protected $casts = [
        'appointment_date' => 'date',
        'appointment_time' => 'string',
        'confirmed_at' => 'datetime',
        'completed_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'rejected_at' => 'datetime',
        'price' => 'decimal:2',
        'is_walkin' => 'boolean',
    ];

    public function customerDisplayName(): ?string
    {
        if (filled($this->customer_name)) {
            return $this->customer_name;
        }

        if (filled($this->customer_name_snapshot)) {
            return $this->customer_name_snapshot;
        }

        if ($this->is_walkin && filled($this->walkin_customer_name)) {
            return $this->walkin_customer_name;
        }

        return $this->bookingCustomer?->fullname;
    }

    /*
    |--------------------------------------------------------------------------
    | Relationships
    |--------------------------------------------------------------------------
    */
    public function bookingCustomer(): BelongsTo
    {
        return $this->belongsTo(BookingCustomer::class);
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class, 'service_id')->withTrashed();
    }

    public function addOns(): HasMany
    {
        return $this->hasMany(AppointmentAddOn::class)->orderBy('name_snapshot');
    }

    public function barber(): BelongsTo
    {
        return $this->belongsTo(User::class, 'barber_user_id')->withTrashed();
    }

    public function feedback(): HasOne
    {
        return $this->hasOne(AppointmentFeedback::class);
    }

    public function emailDeliveries(): HasMany
    {
        return $this->hasMany(BookingEmailDelivery::class);
    }
}
