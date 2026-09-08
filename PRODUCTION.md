# Production Deployment Notes

Production uses one public origin, `https://tolbarbershop.com`, with Nginx routing requests to Next.js or Laravel:

```text
https://tolbarbershop.com/
├── /             → Next.js
├── /api/v1/*     → Laravel
├── /sanctum/*    → Laravel
└── /storage/*    → Laravel public storage
```

The browser never needs a separate backend origin. Nginx, not Next.js, owns the API, Sanctum, and storage routes.

## Required Runtime

| Component | Requirement |
|---|---|
| Frontend | Node.js 24.x and npm 11+ |
| Backend | PHP 8.4 or newer within the PHP 8.4 line |
| Database | MySQL 8+ |
| Web server | Nginx with PHP-FPM and reverse proxy support |
| PHP extensions | ctype, curl, dom, fileinfo, filter, hash, iconv, json, libxml, openssl, pcre, PDO MySQL, session, SimpleXML, tokenizer, XML, XMLWriter |
| TLS | HTTPS on `tolbarbershop.com` |

The backend dependency lock is generated for PHP 8.4. Do not deploy it under PHP 8.3.

## Frontend Configuration

Install and build from `frontend/`:

```bash
npm ci
npm run build
npm run start
```

Use these public frontend values in production:

```dotenv
NEXT_PUBLIC_API_URL=/api/v1
NEXT_PUBLIC_API_ORIGIN=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<same public VAPID key used by Laravel>
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=<your Cloudinary cloud name>
```

`NEXT_PUBLIC_API_URL` resolves to `/api/v1`. Leave `NEXT_PUBLIC_API_ORIGIN` unset or empty so API calls and CSRF initialization use `/api/v1/*` and `/sanctum/csrf-cookie` on the current origin. Requests continue to use `credentials: include`; state-changing requests echo the `XSRF-TOKEN` cookie in the `X-XSRF-TOKEN` header.

For local development only, set `NEXT_PUBLIC_API_ORIGIN=http://localhost:8000` when Laravel runs separately from Next.js. This direct-origin development mode does not affect production.

## Nginx Routing

Configure Nginx so `/api/v1/*` and `/sanctum/*` execute Laravel's `backend/public/index.php`, `/storage/*` maps to Laravel public storage, and every other route proxies to the Next.js process. Do not proxy API or Sanctum requests through Next.js and do not configure a separate public API hostname.

## Laravel Environment

Create `backend/.env` on the production server and set owner-only permissions immediately. Start from `.env.example`, then apply at least these production values:

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://tolbarbershop.com
FRONTEND_URL=https://tolbarbershop.com
SHOP_TIMEZONE=Asia/Manila
APP_KEY=<php artisan key:generate --show>

LOG_CHANNEL=daily
LOG_LEVEL=warning
LOG_DAILY_DAYS=14

DB_CONNECTION=mysql
DB_HOST=<database host>
DB_PORT=3306
DB_DATABASE=<database name>
DB_USERNAME=<dedicated least-privilege database user>
DB_PASSWORD=<strong database password>

SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_ENCRYPT=true
SESSION_DOMAIN=null
SESSION_SECURE_COOKIE=true
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax

SANCTUM_STATEFUL_DOMAINS=tolbarbershop.com

CACHE_STORE=database
QUEUE_CONNECTION=sync

MAIL_MAILER=smtp
MAIL_SCHEME=smtp
MAIL_HOST=<smtp host>
MAIL_PORT=587
MAIL_USERNAME=<smtp username>
MAIL_PASSWORD=<smtp password>
MAIL_FROM_ADDRESS=<verified sender address>
MAIL_FROM_NAME="TOL Barbershop"

VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=mailto:<operational email>
PUSH_ALLOWED_ENDPOINT_HOSTS=fcm.googleapis.com,push.services.mozilla.com,updates.push.services.mozilla.com,.push.apple.com,.notify.windows.com

CLOUDINARY_URL=<Cloudinary URL>
CLOUDINARY_FOLDER=tol-barbershop/landing-gallery

# Default manager account (used by seeders — rotate before public launch)
DEFAULT_MANAGER_EMAIL=<manager email>
DEFAULT_MANAGER_PASSWORD=<strong manager password>
DEFAULT_MANAGER_NAME=<manager fullname>
DEFAULT_MANAGER_CONTACT=<manager phone>
```

`SESSION_DOMAIN=null` keeps the session and CSRF cookies host-only on `tolbarbershop.com`. Because the SPA, API, and Sanctum endpoint share one origin, the browser returns those cookies without cross-origin cookie configuration. Keep `Secure`, `SameSite=Lax`, and `HttpOnly` enabled for the session cookie.

Do not add preview domains, wildcard domains, old API subdomains, or unused ngrok domains to `SANCTUM_STATEFUL_DOMAINS` or production CORS configuration.

Use `QUEUE_CONNECTION=sync` unless the production server has a continuously supervised queue worker. The application does not require Redis.

Configure the server cron scheduler to run Laravel's scheduler every minute:

```cron
* * * * * cd /path/to/tol-barbershop/backend && php artisan schedule:run >/dev/null 2>&1
```

Without this cron job, inactive support tickets are not cancelled automatically.

## CORS and Sanctum

Production browser requests are same-origin, so they do not require CORS or preflight access to another hostname. Keep Laravel's credentialed CORS support for the separate-origin local development setup only; never use `Access-Control-Allow-Origin: *` with credentials.

Session authentication remains cookie-based. The readable `XSRF-TOKEN` cookie is echoed in the `X-XSRF-TOKEN` header on state-changing requests, while the `HttpOnly` session cookie is sent automatically through `credentials: include`.

## Server Layout

Only `backend/public` may be web-accessible through the Laravel routes. Never expose the repository root, `.env`, `vendor`, private storage, database files, or source files.

Recommended permissions:

```bash
chmod 600 .env
chmod -R 755 app bootstrap config database public resources routes vendor
chmod -R 775 storage bootstrap/cache
```

Do not use `777` permissions. The PHP process owner must be able to write only to `storage/` and `bootstrap/cache/`.

Create Laravel's public storage link when `/storage/*` is used:

```bash
php artisan storage:link
```

Configure Nginx to serve `/storage/*` from `backend/public/storage` without exposing other storage directories. Gallery images continue to use Cloudinary.

## Backend Deployment

Back up the database before the first deployment containing the security migrations.

The integrity migrations fail closed instead of silently changing ambiguous production records. Before migrating, confirm these queries return no rows and resolve any results manually:

```sql
SELECT barber_user_id, appointment_date, appointment_time, COUNT(*) AS duplicate_count
FROM appointments
WHERE status IN ('pending', 'approved')
GROUP BY barber_user_id, appointment_date, appointment_time
HAVING COUNT(*) > 1;

SELECT date_closed, COUNT(*) AS duplicate_count
FROM closed_dates
GROUP BY date_closed
HAVING COUNT(*) > 1;
```

Connect to the production server via SSH and deploy from the `backend/` directory:

```bash
git pull origin main
composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction
php artisan migrate --force
php artisan optimize
php artisan production:verify
```

If environment values change, rebuild Laravel's cached configuration:

```bash
php artisan optimize:clear
php artisan optimize
```

Do not run `composer update` on the production server. Deploy the reviewed `composer.lock` file.

## Seeder Warning

The current deployment seeders intentionally include known manager, barber, and customer credentials. This was retained for the deployment phase by explicit decision.

Do not run `php artisan db:seed --force` on a publicly accessible production database unless those accounts are intentionally required. Before public launch, rotate every seeded credential and confirm that no predictable account remains active.

Never expose a seeded manager account while DNS or the public frontend is open to untrusted users.

## Security Verification

After deployment, verify frontend headers:

```bash
curl --proto '=https' --tlsv1.2 -sS -D - -o /dev/null https://tolbarbershop.com/
```

Confirm the response contains CSP, HSTS, frame denial, `nosniff`, referrer policy, permissions policy, and no `X-Powered-By` header.

Verify the same-origin CSRF handshake through Nginx:

```bash
curl --proto '=https' --tlsv1.2 -sS -c cookies.txt -D - -o /dev/null \
  -H "Origin: https://tolbarbershop.com" \
  -H "Referer: https://tolbarbershop.com/" \
  https://tolbarbershop.com/sanctum/csrf-cookie
```

Confirm a `204` response that sets host-only `XSRF-TOKEN` and session cookies with `Secure` and `SameSite=Lax`. Confirm authenticated state-changing requests without a matching XSRF header receive HTTP 419.

Verify authenticated API traffic through the same origin:

```bash
curl --proto '=https' --tlsv1.2 -sS -b cookies.txt \
  -H "Origin: https://tolbarbershop.com" \
  -H "Referer: https://tolbarbershop.com/" \
  https://tolbarbershop.com/api/v1/user
```

It should return HTTP 200 with the current user when a valid session exists.

Verify these application cases manually:

1. Customer, admin, and manager login and logout.
2. A disabled admin loses existing access immediately.
3. An admin can access only assigned modules, including direct URLs and direct API requests.
4. A customer cannot read another customer's appointments, support tickets, feedback, or notifications.
5. Customer barber responses contain no barber email or phone number.
6. Email changes require the current password and require verification of the new address.
7. Sunday, closed-date, past, over-30-day, inactive-resource, overlapping, and duplicate bookings are rejected by the API.
8. Group approval or rejection succeeds atomically.
9. Registration verification and password reset emails arrive through the production SMTP account.
10. Support ticket creation and claiming remain single-owner under repeated clicks.
11. Service deletion archives the service without deleting appointment history.
12. Staff image upload attempts are rejected.
13. Push subscription endpoints reject non-provider URLs.

## Operational Protection

Configure a daily MySQL backup or export to storage outside the production server. Encrypt it, retain at least seven daily and four weekly copies, and test a restore at least monthly. Keep any provider-managed backup enabled as a second recovery path.

Configure uptime checks at five-minute intervals for all three paths and send failures to an actively monitored email or phone:

```text
https://tolbarbershop.com/
https://tolbarbershop.com/api/v1/public-booking-settings
https://tolbarbershop.com/sanctum/csrf-cookie
```

All checks use `tolbarbershop.com` so they exercise the production Nginx routing layer. Frontend checks use `/`, public API checks use `/api/v1/*`, and the Sanctum check expects HTTP 204 from `/sanctum/csrf-cookie`.

Configure error alerts for Nginx and backend 5xx responses plus Laravel production log errors. Review repeated 401, 403, 419, 422, and 429 responses for authentication, CSRF, validation, or abuse patterns.

Run the public read workload against a staging deployment while watching PHP-FPM workers, CPU, memory, and MySQL connection metrics:

```bash
node operations/load-test.mjs https://staging.example.com --confirm-staging
```

The default workload is 15 virtual users for 15 minutes. It fails on request errors, non-2xx responses, or p95 latency above 1000 ms. Do not target production. Record p95 latency, 5xx responses, peak PHP workers, peak CPU, and peak MySQL connections in the release notes.

## Maintenance

Run these checks before each production release:

```bash
composer validate --strict --no-check-publish
composer audit --locked --no-dev --abandoned=fail
php artisan test
composer run test:mysql
vendor/bin/pint --test
```

```bash
npm ci --ignore-scripts
npm audit --package-lock-only --omit=dev --ignore-scripts --audit-level=moderate
npm run lint
npx tsc --noEmit
npm run build
```

Keep automated database backups outside the hosting account and periodically test a restore. Retain bounded daily application logs and monitor repeated 401, 403, 419, 422, 429, and 500 responses.

## Accepted Temporary Risks

The six-character password policy and absence of MFA are retained by explicit deployment decision. They should be reviewed before broader public use, especially for manager and admin accounts.

The frontend CSP permits inline scripts because nonce-based Next.js CSP would force dynamic rendering. The application compensates by avoiding user-controlled HTML, removing `dangerouslySetInnerHTML`, disabling inline script attributes, enforcing server-side sanitization, and keeping all API authorization on Laravel.
