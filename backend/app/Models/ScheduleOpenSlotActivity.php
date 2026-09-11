<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ScheduleOpenSlotActivity extends Model
{
    protected $fillable = [
        'schedule_open_slot_id',
        'action',
        'slot_date',
        'slot_time',
        'barber_user_id',
        'barber_name_snapshot',
        'reason',
        'actor_user_id',
        'actor_name_snapshot',
    ];

    protected $casts = [
        'slot_date' => 'date:Y-m-d',
    ];

    public function scheduleOpenSlot(): BelongsTo
    {
        return $this->belongsTo(ScheduleOpenSlot::class);
    }
}
