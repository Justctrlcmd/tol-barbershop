<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ScheduleBlockedSlotActivity extends Model
{
    protected $fillable = [
        'schedule_blocked_slot_id',
        'action',
        'slot_date',
        'slot_time',
        'duration_minutes',
        'barber_user_id',
        'barber_name_snapshot',
        'reason',
        'actor_user_id',
        'actor_name_snapshot',
    ];

    protected $casts = [
        'slot_date' => 'date:Y-m-d',
        'duration_minutes' => 'integer',
    ];

    public function scheduleBlockedSlot(): BelongsTo
    {
        return $this->belongsTo(ScheduleBlockedSlot::class);
    }
}
