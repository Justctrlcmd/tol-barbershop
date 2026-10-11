<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

test('manager profile can be updated without a contact number', function () {
    $manager = User::factory()->create([
        'role' => 'manager',
        'fullname' => 'Test Manager',
        'contact_number' => null,
    ]);
    Sanctum::actingAs($manager);

    $this->putJson('/api/v1/change-information', [
        'fullname' => $manager->fullname,
        'email' => $manager->email,
    ])
        ->assertOk()
        ->assertJsonPath('data.contact_number', null);
});
