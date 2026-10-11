<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->decimal('subtotal', 10, 2)->nullable();
            $table->string('discount_type', 32)->nullable();
            $table->decimal('discount_amount', 10, 2)->default(0);
            $table->foreignId('discount_applied_by_user_id')->nullable()->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('discount_applied_by_user_id');
            $table->dropColumn(['subtotal', 'discount_type', 'discount_amount']);
        });
    }
};
