# Project Instructions

## Project Overview

**Stack:** Laravel 13 API (backend/) + Next.js 16 App Router SPA (frontend/)
**Auth:** Sanctum SPA cookie auth, 3 roles: `customer`, `admin`, `manager`
**Database:** MySQL 8+ via Eloquent ORM
**Realtime:** Version-based polling via `EntityChange` (no SSE, no WebSockets)
**Production:** `https://tolbarbershop.com` behind Nginx, with Next.js and Laravel served from one origin
**Dev Tunnel:** ngrok only — never optimize production for ngrok/localhost

---

## 1. Architecture & Connectivity

### Frontend ↔ Backend Flow

```
Browser → Nginx
        ├── / → Next.js → proxy.ts route protection
        ├── /api/v1/* → Laravel → auth:sanctum → EnsureRole → Controller
        ├── /sanctum/* → Laravel Sanctum CSRF cookie endpoint
        └── /storage/* → Laravel public storage
```

> Production API and Sanctum requests use same-origin paths. Nginx routes them directly to Laravel; Next.js does not proxy them.

### Key Files

| File | Purpose |
|------|---------|
| `frontend/src/lib/api.ts` | `publicFetch()` / `authFetch()` HTTP client |
| `frontend/src/proxy.ts` | Middleware: role-based route protection |
| `frontend/src/contexts/AuthContext.tsx` | Auth state management |
| `frontend/src/contexts/RealtimeContext.tsx` | Polling subscription via EntityChange |
| `frontend/next.config.ts` | Next.js and security-header config |

### Route Structure

| Area | Base Path | Auth |
|------|-----------|------|
| Public (landing) | `/` | None |
| Auth | `/login`, `/register`, etc. | Guest |
| Customer | `/customer/*` | `auth_role=customer` |
| Admin | `/admin/*` | `auth_role=admin` |
| Manager | `/manager/*` | `auth_role=manager` |

---

## 2. File Organization

### Frontend (`frontend/src/`)

```
src/
  app/                    — Next.js App Router pages (route groups)
    (auth)/               — Public auth pages (login, register, forgot/reset password)
    admin/                — Admin role pages
    customer/             — Customer role pages
    manager/              — Manager role pages
    layout.tsx            — Root layout (providers wrapper)
    globals.css           — Tailwind v4 + shadcn theme
  components/
    common/               — Reusable app components (InputWithLabel, AppointmentCard, etc.)
    ui/                   — shadcn/ui primitives (button, dialog, select, etc.)
  contexts/               — React context providers
  forms/                  — Form components (one per form, linked to validation schemas)
  hooks/                  — Custom React hooks
  layout/                 — Page layout content components (role-scoped subfolders)
  lib/                    — Utilities (api.ts, utils.ts, sanitizer.ts, etc.)
  services/               — API service functions (role-scoped subfolders)
  validations/            — Zod validation schemas (one file per domain)
```

### Backend (`backend/`)

```
backend/
  app/
    Http/
      Controllers/        — API controllers (role-scoped or domain-scoped)
      Middleware/         — Custom middleware (EnsureRole, SecurityHeaders)
      Requests/          — Form Request validation classes
      Resources/         — API resource transformers
    Models/              — Eloquent models
    Services/            — Business logic services
    Support/             — Support classes (EntityChange, PushEndpointValidator)
    Traits/              — ApiResponseTrait (shared across controllers)
  routes/
    api.php              — All API route definitions
  database/
    migrations/          — Database migrations
    seeders/             — Seeders
  tests/                 — Pest tests
```

### File Ownership

| File Type | Location |
|-----------|----------|
| Page/Route | `frontend/src/app/{role}/...` |
| Form Component | `frontend/src/forms/` |
| Reusable UI Component | `frontend/src/components/common/` |
| shadcn Primitive | `frontend/src/components/ui/` |
| API Call Function | `frontend/src/services/{role}/` |
| Validation Schema | `frontend/src/validations/` |
| Custom Hook | `frontend/src/hooks/` |
| Context Provider | `frontend/src/contexts/` |
| Controller | `backend/app/Http/Controllers/` |
| Form Request | `backend/app/Http/Requests/` |
| API Resource | `backend/app/Http/Resources/` |
| Model | `backend/app/Models/` |
| Migration | `backend/database/migrations/` |

---

## 3. Coding Standards

### Naming Conventions

| Category | Convention | Example |
|----------|-----------|---------|
| Components | PascalCase | `InputWithLabel.tsx` |
| Pages | PascalCase (dir) | `admin/appointment/page.tsx` |
| Utilities | camelCase | `utils.ts`, `sanitizer.ts` |
| API services | camelCase functions | `getActiveBarbers()` |
| Validation files | kebab-case | `appointment.validation.ts` |
| Validation exports | PascalCase schema + type | `appointmentSchema`, `AppointmentFormValues` |
| Backend Controllers | PascalCase | `ServiceController.php` |
| Backend Models | PascalCase (singular) | `Appointment.php` |
| Backend Migrations | snake_case | `2026_05_13_040932_create_appointments_table.php` |

### Imports Order (Frontend)

```typescript
// 1. External packages
import { useForm } from "react-hook-form";
import { z } from "zod";
// 2. @/ path aliases
import { InputWithLabel } from "@/components/common/InputWithLabel";
import { authFetch } from "@/lib/api";
// 3. Types
import type { AppointmentFormValues } from "@/validations/appointment.validation";
```

### ✅ Do / ❌ Don't

| ✅ Do | ❌ Don't |
|-------|---------|
| `type Props = { ... }` | `interface Props { ... }` |
| Named exports: `export function Foo` | Default exports |
| `@/` path alias for all internal imports | Relative paths like `../../` |
| `cn()` for className merging | Template literal class strings |
| `sanitizeString()` / `sanitizeText()` before display | `dangerouslySetInnerHTML` |
| Add comments only when asked | Add explanatory comments |

---

## 4. Frontend Conventions

### Component Patterns

**shadcn Primitive** (`components/ui/`)

Follow existing CVA pattern from generated shadcn files.

**Common Labeled Component** (`components/common/`)

```typescript
"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type InputWithLabelProps = {
  label: string;
  error?: string;
  icon?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>;

export const InputWithLabel = forwardRef<HTMLInputElement, InputWithLabelProps>(
  ({ label, error, icon, className, id, ...props }, ref) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</span>}
        <Input ref={ref} id={id} className={cn(icon && "pl-10", className)} {...props} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
);
InputWithLabel.displayName = "InputWithLabel";
```

### Form Pattern

```typescript
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { useRateLimit } from "@/hooks/useRateLimit";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function MyForm() {
  const { user } = useAuth();
  const router = useRouter();
  const { isRateLimited, cooldownRemaining, recordAction } = useRateLimit("form-key", 5, 60);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SchemaType>({
    resolver: zodResolver(schema),
    defaultValues: { /* ... */ },
  });

  const onSubmit = async (data: SchemaType) => {
    if (isRateLimited) {
      toast.error(`Please wait ${cooldownRemaining}s`);
      return;
    }
    try {
      recordAction();
      const result = await someApiCall(data);
      toast.success("Success message");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <InputWithLabel label="Field" error={errors.field?.message} {...register("field")} />
      <button type="submit" disabled={isSubmitting}>Submit</button>
    </form>
  );
}
```

### API Service Pattern

```typescript
import { authFetch, publicFetch } from "@/lib/api";

export const getItems = async (): Promise<ItemType[]> => {
  const response = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/items`);
  return response.data?.data ?? response.data;
};

export const createItem = async (data: CreateItemData): Promise<ItemType> => {
  const response = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/items`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return response.data;
};
```

### Validation Pattern

```typescript
// frontend/src/validations/domain.validation.ts
import { z } from "zod";

export const domainSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(255, "Name must not exceed 255 characters"),
  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .toLowerCase(),
});

export type DomainFormValues = z.infer<typeof domainSchema>;
```

### UI Rules

- **Always reuse** existing `components/common/` components before creating new ones
- **Missing a primitive?** Add via shadcn CLI (`npx shadcn add button`) for consistency
- **Every component must be responsive** — test at mobile (375px), tablet (768px), desktop (1280px)
- **Use Tailwind v4 responsive prefixes:** `sm:`, `md:`, `lg:`, `xl:`
- **Maintain uniform spacing** using Tailwind scale (`space-y-4`, `gap-4`, `p-4`)
- **Dark mode support** via `next-themes` + CSS variables in `globals.css`

---

## 5. Backend Conventions

### Controller Pattern

```php
namespace App\Http\Controllers;

use App\Traits\ApiResponseTrait;

class ItemController extends Controller
{
    use ApiResponseTrait;

    public function index(Request $request)
    {
        try {
            $items = Item::all();
            return $this->success('Items retrieved', ItemResource::collection($items));
        } catch (\Exception $e) {
            return $this->error('Failed to retrieve items', [], 500);
        }
    }

    public function store(ItemRequest $request)
    {
        try {
            $item = Item::create($request->validated());
            EntityChange::dispatch('items');
            return $this->created('Item created', new ItemResource($item));
        } catch (\Exception $e) {
            return $this->error('Failed to create item', [], 500);
        }
    }
}
```

### Form Request Pattern (Validation + Sanitization)

```php
namespace App\Http\Requests;

use App\Http\Requests\Concerns\SanitizesInput;

class ItemRequest extends FormRequest
{
    use SanitizesInput;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->sanitizeStringFields(['name', 'title']);
        $this->sanitizeTextFields(['description']);
        $this->normalizeEmailFields(['email']);
        $this->normalizePhoneFields(['contact_number']);
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'description' => ['required', 'string', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'The name field is required.',
        ];
    }
}
```

### API Resource Pattern

```php
class ItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'created_at' => $this->created_at,
        ];
    }
}
```

### API Route Pattern

```php
// backend/routes/api.php
Route::prefix('v1')->group(function () {
    // Public
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:20,1');

    // Authenticated
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/user', [UserController::class, 'show']);

        // Role-gated
        Route::middleware('role:admin,manager')->group(function () {
            Route::apiResource('/items', ItemController::class);
        });
    });
});
```

---

## 6. Security Rules

### Frontend ↔ Backend Validation MUST Match

Every Zod schema on the frontend must have a matching Form Request on the backend with equivalent rules:

| Aspect | Frontend (Zod) | Backend (Form Request) |
|--------|---------------|----------------------|
| String length | `.min(2).max(255)` | `min:2|max:255` |
| Email format | `.email().toLowerCase()` | `email` |
| Required fields | `.min(1, "Required")` | `required` |
| Regex patterns | `.regex(/^...$/)` | `regex:/^...$/` |
| Numeric ranges | `.min(0).max(1000)` | `min:0|max:1000` |

### Input Sanitization

**Frontend:** Use `sanitizer.ts` utilities before displaying user input:

```typescript
import { sanitizeString, sanitizeText } from "@/lib/sanitizer";
// sanitizeString() — strips HTML tags, control characters, trims
// sanitizeText() — allows basic formatting but strips dangerous tags
// normalizeEmail() — lowercase, trim
// normalizePhone() — strip non-numeric characters
```

**Backend:** Always use `SanitizesInput` trait in Form Requests:

```php
$this->sanitizeStringFields(['field1']);
$this->sanitizeTextFields(['field2']);
$this->normalizeEmailFields(['email']);
```

### Rate Limiting

- **Backend:** Apply `throttle:N,1` middleware to sensitive routes (login, register, forms)
- **Frontend:** Use `useRateLimit` hook for client-side cooldown:

```typescript
const { isRateLimited, cooldownRemaining, recordAction } = useRateLimit(
  'unique-key',  // unique per form
  5,             // max attempts
  60             // cooldown in seconds
);
```

### XSS Prevention

- ❌ Never use `dangerouslySetInnerHTML`
- ❌ Never concatenate strings for HTML
- ✅ Always use React JSX (auto-escaped)
- ✅ Use `sanitizer.ts` for any user text display

### CSRF Protection

- Sanctum handles this automatically via `XSRF-TOKEN` cookie
- Frontend `api.ts` attaches `X-XSRF-TOKEN` header
- All state-changing requests must include CSRF token

### SSRF Prevention

- Validate and restrict any user-supplied URLs
- Use allowlists for external endpoints
- Never pass user input directly to file_get_contents(), curl, or similar

---

## 7. Change Workflow

### Step-by-Step Process

```
Read task → Read file(s) → Check neighbors → Check imports
    |
    ├── Change affects both FE & BE?
    │   ├── Yes → Plan tandem changes (API ↔ Controller ↔ Validation)
    │   └── No  → Make isolated change
    │
    └── Implement → Lint/Typecheck → Fix errors → Handshake test → Done
```

### Before Each Change

1. **Read the full file** before editing
2. **Check neighbors** for existing patterns (naming, typing, imports, structure)
3. **Check imports** — understand what libraries are used
4. **Check connected files** — if editing an API endpoint, check the frontend service that calls it

### After Each Change

1. **Frontend:** `npm run lint` and `npm run typecheck` in `frontend/`
2. **Backend:** `vendor/bin/pint --test` and `php artisan test` in `backend/`
3. **No errors allowed** — fix until clean
4. **No explanatory summary** — just deliver the code

### Handshake Testing Checklist

When making cross-cutting changes, verify these don't break:

| Change Area | Check These |
|-------------|-------------|
| Backend endpoint | Frontend service → Form component → Validation |
| Frontend form | Backend controller → Form Request → Resource |
| Database migration | Model → Resource → Frontend type → Validation |
| Auth change | Middleware → proxy.ts → AuthContext → API services |

---

## 8. When to Ask Questions

Ask before acting when:

1. **Ambiguous requirements** — the task description is unclear
2. **Missing context** — you need more info to make a decision
3. **Multiple valid approaches** — tradeoffs exist between options
4. **Structural changes** — moving files, changing folder structure
5. **New dependencies** — adding packages not already in the project
6. **Breaking changes** — changes that could affect other areas

Do NOT ask when:

- The pattern is already established in neighboring files
- The requirement is explicitly stated
- The change is mechanical (rename, refactor to match existing patterns)

---

## 9. No Commits Rule

**Never commit, amend, push, or create PRs unless explicitly asked.**

## 10. Production Constraints

**Production routing:** Nginx serves `https://tolbarbershop.com`, sends `/` to Next.js, sends `/api/v1/*` and `/sanctum/*` directly to Laravel, and serves `/storage/*` from Laravel public storage.

**Hard rules:**
- Do not add Next.js API/Sanctum rewrites, external-backend fallbacks, or platform redirects
- Keep `NEXT_PUBLIC_API_URL=/api/v1` and leave `NEXT_PUBLIC_API_ORIGIN` unset or empty in production
- Keep Sanctum requests same-origin and credentialed
- Never optimize production for ngrok or localhost — these are dev-only
- Never use `next dev` timings to judge production performance
- Minimize API fan-out: each page should make as few initial requests as possible
- Consolidate multiple analytics/list endpoints into fewer backend calls
- Do not assume Redis or persistent queue workers unless the production server explicitly provides them
- Use `php artisan optimize` (route + config caching) on every deploy
- Push notifications must be dispatched inline or gracefully degraded unless a supervised worker is confirmed
- Heavy client modules (PDF, charts, dialogs) must be dynamically imported

## 11. Toke Saving Rule

**Make sure to answer only waht is asked, dont repeat yourself. Save token reponse in every short concise and clear manner**
