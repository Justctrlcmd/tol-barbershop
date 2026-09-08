<?php

namespace App\Console\Commands;

use App\Models\BookingSchedule;
use App\Models\GalleryImage;
use App\Models\User;
use App\Services\CloudinaryMediaService;
use Database\Seeders\ModuleSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

class ResetProductionSystem extends Command
{
    protected $signature = 'system:fresh-start
        {--confirm-production : Confirm that the production database and gallery may be erased}';

    protected $description = 'Erase application data and create a fresh manager account and booking schedule';

    public function handle(): int
    {
        if (! $this->option('confirm-production')) {
            $this->error('This command is destructive. Re-run it with --confirm-production.');

            return self::FAILURE;
        }

        if (! $this->confirm('This will erase the application database and all Gallery images from Cloudinary. Continue?', false)) {
            $this->info('Fresh start cancelled.');

            return self::SUCCESS;
        }

        $manager = $this->promptForManager();
        if ($manager === null) {
            return self::FAILURE;
        }

        try {
            $galleryImageCount = $this->deleteGalleryImages();
            $this->info("Deleted {$galleryImageCount} Gallery image(s) from Cloudinary.");

            $migrationResult = $this->call('migrate:fresh', ['--force' => true]);
            if ($migrationResult !== self::SUCCESS) {
                $this->error('The database reset failed.');

                return self::FAILURE;
            }

            $createdManager = DB::transaction(function () use ($manager): User {
                app(ModuleSeeder::class)->run();

                $user = User::create([
                    'fullname' => $manager['fullname'],
                    'contact_number' => $manager['contact_number'],
                    'email' => $manager['email'],
                    'password' => Hash::make($manager['password']),
                    'role' => 'manager',
                    'is_active' => true,
                ]);

                BookingSchedule::query()->updateOrCreate(
                    ['effective_from' => '1970-01-01'],
                    [
                        'open_day_from' => 1,
                        'open_day_to' => 7,
                        'closed_weekday' => 7,
                        'opening_time' => '09:00',
                        'closing_time' => '19:00',
                        'custom_open_time' => '12:30',
                        'custom_open_times' => ['12:30'],
                        'booking_days_ahead' => 7,
                        'created_by_user_id' => $user->id,
                    ],
                );

                return $user;
            });

            $this->newLine();
            $this->info('Fresh start completed successfully.');
            $this->line('Manager: '.Str::lower($createdManager->email));
            $this->line('Business data such as services, barbers, add-ons, and Gallery images is empty.');

            return self::SUCCESS;
        } catch (Throwable $exception) {
            report($exception);
            $this->error('Fresh start failed: '.$exception->getMessage());

            return self::FAILURE;
        }
    }

    private function promptForManager(): ?array
    {
        $fullname = trim((string) $this->ask('Manager full name', 'TOL Barbershop Manager'));
        $email = Str::lower(trim((string) $this->ask('Manager email', 'ofcl.tolbarbershop@gmail.com')));
        $password = (string) $this->secret('Manager password');
        $passwordConfirmation = (string) $this->secret('Confirm manager password');
        $contactNumber = trim((string) $this->ask('Manager contact number (optional; leave blank for none)', ''));

        $errors = [];
        if ($fullname === '' || preg_match('/^[A-Za-z\s]+$/', $fullname) !== 1) {
            $errors[] = 'The manager full name may contain only letters and spaces.';
        }
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false || strlen($email) > 255) {
            $errors[] = 'The manager email address is invalid.';
        }
        if (strlen($password) < 8 || strlen($password) > 255) {
            $errors[] = 'The manager password must be between 8 and 255 characters.';
        }
        if (! hash_equals($password, $passwordConfirmation)) {
            $errors[] = 'The manager passwords do not match.';
        }
        if ($contactNumber !== '' && preg_match('/^09\d{9}$/', $contactNumber) !== 1) {
            $errors[] = 'The manager contact number must be a valid PH mobile number or blank.';
        }

        if ($errors !== []) {
            foreach ($errors as $error) {
                $this->error($error);
            }

            return null;
        }

        return [
            'fullname' => $fullname,
            'email' => $email,
            'password' => $password,
            'contact_number' => $contactNumber === '' ? null : $contactNumber,
        ];
    }

    private function deleteGalleryImages(): int
    {
        if (! Schema::hasTable('gallery_images')) {
            return 0;
        }

        $publicIds = GalleryImage::query()
            ->pluck('cloudinary_public_id')
            ->filter(fn (mixed $publicId): bool => is_string($publicId) && $publicId !== '')
            ->values();

        if ($publicIds->isEmpty()) {
            return 0;
        }

        $media = app(CloudinaryMediaService::class);
        foreach ($publicIds as $publicId) {
            $media->deleteImage($publicId);
        }

        return $publicIds->count();
    }
}
