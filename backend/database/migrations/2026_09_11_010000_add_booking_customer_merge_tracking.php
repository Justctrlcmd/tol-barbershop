<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('booking_customers', function (Blueprint $table): void {
            $table->foreignId('merged_into_id')
                ->nullable()
                ->after('contact_number')
                ->constrained('booking_customers')
                ->nullOnDelete();
            $table->timestamp('merged_at')->nullable()->after('merged_into_id');
            $table->string('merge_match_type', 20)->nullable()->after('merged_at');
            $table->index('merged_into_id');
        });

        Schema::create('booking_customer_merges', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('canonical_customer_id')
                ->constrained('booking_customers')
                ->cascadeOnDelete();
            $table->foreignId('merged_customer_id')
                ->unique()
                ->constrained('booking_customers')
                ->cascadeOnDelete();
            $table->string('match_type', 20);
            $table->string('source_fullname', 255);
            $table->string('source_email', 255)->nullable();
            $table->string('source_contact_number', 11)->nullable();
            $table->timestamps();

            $table->index('canonical_customer_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_customer_merges');

        Schema::table('booking_customers', function (Blueprint $table): void {
            $table->dropForeign(['merged_into_id']);
            $table->dropIndex(['merged_into_id']);
            $table->dropColumn(['merged_into_id', 'merged_at', 'merge_match_type']);
        });
    }
};
