<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('booking_schedules', function (Blueprint $table) {
            $table->json('closed_weekdays')->nullable()->after('closed_weekday');
        });

        DB::table('booking_schedules')
            ->select(['id', 'closed_weekday'])
            ->orderBy('id')
            ->each(function (object $schedule): void {
                DB::table('booking_schedules')
                    ->where('id', $schedule->id)
                    ->update([
                        'closed_weekdays' => $schedule->closed_weekday === null
                            ? json_encode([])
                            : json_encode([(int) $schedule->closed_weekday]),
                    ]);
            });
    }

    public function down(): void
    {
        Schema::table('booking_schedules', function (Blueprint $table) {
            $table->dropColumn('closed_weekdays');
        });
    }
};
