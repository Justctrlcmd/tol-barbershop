<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('booking_schedules', function (Blueprint $table): void {
            $table->json('custom_open_times')->nullable()->after('custom_open_time');
        });

        DB::table('booking_schedules')
            ->orderBy('id')
            ->get(['id', 'custom_open_time'])
            ->each(function (object $schedule): void {
                DB::table('booking_schedules')
                    ->where('id', $schedule->id)
                    ->update([
                        'custom_open_times' => json_encode([substr((string) $schedule->custom_open_time, 0, 5)]),
                    ]);
            });
    }

    public function down(): void
    {
        Schema::table('booking_schedules', function (Blueprint $table): void {
            $table->dropColumn('custom_open_times');
        });
    }
};
