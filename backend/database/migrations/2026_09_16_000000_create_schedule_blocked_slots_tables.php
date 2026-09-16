<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('schedule_blocked_slots')) {
            Schema::create('schedule_blocked_slots', function (Blueprint $table): void {
                $table->id();
                $table->date('slot_date');
                $table->time('slot_time');
                $table->unsignedSmallInteger('duration_minutes')->default(60);
                $table->foreignId('barber_user_id')->constrained('users')->restrictOnDelete();
                $table->string('reason');
                $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->unique(['slot_date', 'slot_time', 'barber_user_id']);
                $table->index(['slot_date', 'barber_user_id']);
            });
        }

        if (! Schema::hasTable('schedule_blocked_slot_activities')) {
            Schema::create('schedule_blocked_slot_activities', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('schedule_blocked_slot_id')->nullable();
                $table->string('action', 20);
                $table->date('slot_date');
                $table->time('slot_time');
                $table->unsignedSmallInteger('duration_minutes')->default(60);
                $table->unsignedBigInteger('barber_user_id')->nullable();
                $table->string('barber_name_snapshot')->nullable();
                $table->string('reason')->nullable();
                $table->unsignedBigInteger('actor_user_id')->nullable();
                $table->string('actor_name_snapshot')->nullable();
                $table->timestamps();

                $table->index(['created_at', 'id']);
                $table->index(['slot_date', 'barber_user_id']);
            });
        }

        $constraints = DB::getDriverName() === 'mysql'
            ? collect(DB::select(
                'SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ?',
                ['schedule_blocked_slot_activities'],
            ))->pluck('CONSTRAINT_NAME')
            : collect();

        Schema::table('schedule_blocked_slot_activities', function (Blueprint $table) use ($constraints): void {
            if (! $constraints->contains('blocked_slot_activity_slot_fk')) {
                $table->foreign('schedule_blocked_slot_id', 'blocked_slot_activity_slot_fk')
                    ->references('id')
                    ->on('schedule_blocked_slots')
                    ->nullOnDelete();
            }
            if (! $constraints->contains('blocked_slot_activity_actor_fk')) {
                $table->foreign('actor_user_id', 'blocked_slot_activity_actor_fk')
                    ->references('id')
                    ->on('users')
                    ->nullOnDelete();
            }
        });

        $indexes = DB::getDriverName() === 'mysql'
            ? collect(DB::select('SHOW INDEX FROM schedule_blocked_slot_activities'))->pluck('Key_name')
            : collect([
                'blocked_slot_activities_created_at_id_index',
                'blocked_slot_activities_slot_date_barber_index',
            ]);
        $hasCreatedAtIndex = $indexes->contains(fn (string $index): bool => in_array($index, [
            'schedule_blocked_slot_activities_created_at_id_index',
            'blocked_slot_activities_created_at_id_index',
        ], true));
        $hasDateBarberIndex = $indexes->contains(fn (string $index): bool => in_array($index, [
            'schedule_blocked_slot_activities_slot_date_barber_index',
            'blocked_slot_activities_slot_date_barber_index',
        ], true));

        if (! $hasCreatedAtIndex) {
            Schema::table('schedule_blocked_slot_activities', function (Blueprint $table): void {
                $table->index(['created_at', 'id'], 'blocked_slot_activities_created_at_id_index');
            });
        }
        if (! $hasDateBarberIndex) {
            Schema::table('schedule_blocked_slot_activities', function (Blueprint $table): void {
                $table->index(['slot_date', 'barber_user_id'], 'blocked_slot_activities_slot_date_barber_index');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('schedule_blocked_slot_activities');
        Schema::dropIfExists('schedule_blocked_slots');
    }
};
