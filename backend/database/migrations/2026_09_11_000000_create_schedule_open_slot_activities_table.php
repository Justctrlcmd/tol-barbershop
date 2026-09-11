<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('schedule_open_slot_activities', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('schedule_open_slot_id')
                ->nullable()
                ->constrained('schedule_open_slots')
                ->nullOnDelete();
            $table->string('action', 20);
            $table->date('slot_date');
            $table->time('slot_time');
            $table->unsignedBigInteger('barber_user_id')->nullable();
            $table->string('barber_name_snapshot')->nullable();
            $table->string('reason')->nullable();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('actor_name_snapshot')->nullable();
            $table->timestamps();

            $table->index(['created_at', 'id']);
            $table->index(['slot_date', 'barber_user_id']);
        });

        DB::table('schedule_open_slots')
            ->orderBy('id')
            ->chunkById(500, function ($slots): void {
                $barberNames = DB::table('users')
                    ->whereIn('id', $slots->pluck('barber_user_id')->filter()->unique())
                    ->pluck('fullname', 'id');
                $actorNames = DB::table('users')
                    ->whereIn('id', $slots->pluck('created_by_user_id')->filter()->unique())
                    ->pluck('fullname', 'id');

                $activities = $slots->map(fn ($slot): array => [
                    'schedule_open_slot_id' => $slot->id,
                    'action' => 'added',
                    'slot_date' => $slot->slot_date,
                    'slot_time' => $slot->slot_time,
                    'barber_user_id' => $slot->barber_user_id,
                    'barber_name_snapshot' => $barberNames->get($slot->barber_user_id),
                    'reason' => 'Open slot added',
                    'actor_user_id' => $slot->created_by_user_id,
                    'actor_name_snapshot' => $actorNames->get($slot->created_by_user_id),
                    'created_at' => $slot->created_at,
                    'updated_at' => $slot->created_at,
                ])->all();

                if ($activities !== []) {
                    DB::table('schedule_open_slot_activities')->insert($activities);
                }
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('schedule_open_slot_activities');
    }
};
