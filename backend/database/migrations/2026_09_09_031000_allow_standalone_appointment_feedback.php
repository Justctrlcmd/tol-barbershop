<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointment_feedback', function (Blueprint $table) {
            $table->unsignedBigInteger('appointment_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        DB::table('appointment_feedback')->whereNull('appointment_id')->delete();

        Schema::table('appointment_feedback', function (Blueprint $table) {
            $table->unsignedBigInteger('appointment_id')->nullable(false)->change();
        });
    }
};
