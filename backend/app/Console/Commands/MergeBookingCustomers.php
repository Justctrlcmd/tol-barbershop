<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class MergeBookingCustomers extends Command
{
    protected $signature = 'crm:merge-booking-customers
        {--apply : Apply the non-destructive merge instead of only reporting candidates}
        {--force : Skip the confirmation prompt when applying}';

    protected $description = 'Find and optionally merge duplicate CRM booking customers without deleting source records';

    public function handle(): int
    {
        $groups = $this->duplicateGroups();

        if ($groups === []) {
            $this->info('No duplicate CRM customer groups were found.');

            return self::SUCCESS;
        }

        $this->table(
            ['Canonical ID', 'Merged IDs', 'Match type'],
            collect($groups)->map(fn (array $group): array => [
                $group['canonical']->id,
                collect($group['sources'])->pluck('id')->implode(', '),
                $group['match_type'],
            ])->all(),
        );

        $sourceCount = collect($groups)->sum(fn (array $group): int => count($group['sources']));
        $this->line(sprintf('%d group(s), %d source record(s) identified.', count($groups), $sourceCount));

        if (! $this->option('apply')) {
            $this->comment('Dry run only. Re-run with --apply to preserve source rows and link their history.');

            return self::SUCCESS;
        }

        if (! $this->option('force') && ! $this->confirm(
            'Apply this non-destructive merge? Source CRM rows will be retained and marked as merged.',
            false,
        )) {
            $this->info('CRM merge cancelled.');

            return self::SUCCESS;
        }

        $mergedCount = DB::transaction(function () use ($groups): int {
            $mergedCount = 0;

            foreach ($groups as $group) {
                $canonicalId = (int) $group['canonical']->id;
                $mergedAt = now();

                foreach ($group['sources'] as $source) {
                    $sourceId = (int) $source->id;

                    foreach (['appointments', 'appointment_feedback', 'booking_email_deliveries', 'feedback_tokens'] as $table) {
                        DB::table($table)
                            ->where('booking_customer_id', $sourceId)
                            ->update(['booking_customer_id' => $canonicalId]);
                    }

                    DB::table('booking_customer_merges')->insert([
                        'canonical_customer_id' => $canonicalId,
                        'merged_customer_id' => $sourceId,
                        'match_type' => $group['match_type'],
                        'source_fullname' => $source->fullname,
                        'source_email' => $source->email,
                        'source_contact_number' => $source->contact_number,
                        'created_at' => $mergedAt,
                        'updated_at' => $mergedAt,
                    ]);

                    DB::table('booking_customers')
                        ->where('id', $sourceId)
                        ->update([
                            'merged_into_id' => $canonicalId,
                            'merged_at' => $mergedAt,
                            'merge_match_type' => $group['match_type'],
                            'updated_at' => $mergedAt,
                        ]);

                    $mergedCount++;
                }
            }

            return $mergedCount;
        });

        $this->info("Merged {$mergedCount} CRM source record(s) without deleting data.");

        return self::SUCCESS;
    }

    /**
     * @return array<int, array{canonical: object, sources: array<int, object>, match_type: string}>
     */
    private function duplicateGroups(): array
    {
        $customers = DB::table('booking_customers')
            ->whereNull('merged_into_id')
            ->orderBy('id')
            ->get(['id', 'fullname', 'email', 'contact_number']);

        if ($customers->isEmpty()) {
            return [];
        }

        $parent = [];
        $keysByCustomer = [];
        $ownerByKey = [];

        foreach ($customers as $customer) {
            $id = (int) $customer->id;
            $parent[$id] = $id;
            $keysByCustomer[$id] = $this->matchKeys($customer);
        }

        $find = function (int $id) use (&$parent, &$find): int {
            if ($parent[$id] !== $id) {
                $parent[$id] = $find($parent[$id]);
            }

            return $parent[$id];
        };
        $union = function (int $left, int $right) use (&$find, &$parent): void {
            $leftRoot = $find($left);
            $rightRoot = $find($right);

            if ($leftRoot !== $rightRoot) {
                $parent[$rightRoot] = $leftRoot;
            }
        };

        foreach ($keysByCustomer as $customerId => $keys) {
            foreach ($keys as $key) {
                if (isset($ownerByKey[$key])) {
                    $union($customerId, $ownerByKey[$key]);
                } else {
                    $ownerByKey[$key] = $customerId;
                }
            }
        }

        $groups = [];
        foreach ($customers as $customer) {
            $root = $find((int) $customer->id);
            $groups[$root][] = $customer;
        }

        return collect($groups)
            ->filter(fn (array $group): bool => count($group) > 1)
            ->map(function (array $group): array {
                usort($group, fn (object $left, object $right): int => $left->id <=> $right->id);
                $keys = collect($group)
                    ->flatMap(fn (object $customer): array => $this->matchKeys($customer))
                    ->unique()
                    ->values();

                $hasEmail = $keys->contains(fn (string $key): bool => str_starts_with($key, 'email:'));
                $hasContact = $keys->contains(fn (string $key): bool => str_starts_with($key, 'contact:'));

                return [
                    'canonical' => $group[0],
                    'sources' => array_slice($group, 1),
                    'match_type' => $hasEmail && $hasContact
                        ? 'email_contact'
                        : ($hasEmail ? 'email' : ($hasContact ? 'contact' : 'name')),
                ];
            })
            ->values()
            ->all();
    }

    /**
     * @return array<int, string>
     */
    private function matchKeys(object $customer): array
    {
        $email = $this->normalizeEmail($customer->email);
        $contact = $this->normalizeContact($customer->contact_number);
        $keys = [];

        if ($email !== null) {
            $keys[] = "email:{$email}";
        }
        if ($contact !== null) {
            $keys[] = "contact:{$contact}";
        }
        if ($email === null && $contact === null) {
            $name = $this->normalizeName($customer->fullname);
            if ($name !== '') {
                $keys[] = "name:{$name}";
            }
        }

        return $keys;
    }

    private function normalizeEmail(?string $email): ?string
    {
        $normalized = mb_strtolower(trim((string) $email));

        return $normalized === '' ? null : $normalized;
    }

    private function normalizeContact(?string $contact): ?string
    {
        $normalized = preg_replace('/\D+/u', '', (string) $contact) ?? '';

        return $normalized === '' ? null : $normalized;
    }

    private function normalizeName(?string $fullname): string
    {
        return preg_replace('/\s+/u', ' ', mb_strtolower(trim((string) $fullname))) ?? mb_strtolower(trim((string) $fullname));
    }
}
