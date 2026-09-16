<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ScheduleBlockedSlot extends Model
{
    protected $fillable = [
        'slot_date',
        'slot_time',
        'duration_minutes',
        'barber_user_id',
        'reason',
        'created_by_user_id',
    ];

    protected $casts = [
        'slot_date' => 'date:Y-m-d',
        'duration_minutes' => 'integer',
    ];

    public function barber(): BelongsTo
    {
        return $this->belongsTo(User::class, 'barber_user_id')->withTrashed();
    }
}
