# Paelon Memorial Hospital — Website Build Specification

> This is the source of truth for the Paelon Memorial Hospital website rebuild. Read this file end-to-end before writing any code. When in doubt, this document overrides any other instruction, and anything not covered here should be clarified with Francis before acting.

**Project:** Paelon Memorial Hospital website redesign and rebuild
**Studio:** VARYN Studio
**Lead:** Francis Woods (francis@varyn.ltd)
**Delivery model:** Rolling delivery, 3-week ceiling for the website itself
**Version:** 1.0

---

## 0. Table of Contents

1. [Project Shape and Sequencing](#1-project-shape-and-sequencing)
2. [Tech Stack](#2-tech-stack)
3. [Repository and Conventions](#3-repository-and-conventions)
4. [Brand and Design System](#4-brand-and-design-system)
5. [Content Model and Data Layer](#5-content-model-and-data-layer)
6. [Pages and Templates](#6-pages-and-templates)
7. [Booking Flow](#7-booking-flow)
8. [CMS and Admin Panel](#8-cms-and-admin-panel)
9. [Analytics](#9-analytics)
10. [Integrations](#10-integrations)
11. [SEO Requirements](#11-seo-requirements)
12. [Accessibility Requirements](#12-accessibility-requirements)
13. [Performance Budgets](#13-performance-budgets)
14. [Security and Compliance](#14-security-and-compliance)
15. [Development Workflow](#15-development-workflow)
16. [Claude Code Working Style](#16-claude-code-working-style)
17. [Explicitly Out of Scope for v1](#17-explicitly-out-of-scope-for-v1)

---

## 1. Project Shape and Sequencing

The project ships in two phases. **Do not conflate them.** The website is a 3-week hard-ceiling delivery. The CMS and admin panel ship in a follow-on 1-week phase after the website is on staging.

### Phase 1 — Website (15 working days, hard ceiling)

Delivered on the rolling timeline documented separately in `VARYN_Paelon_Project_Timeline.docx`. In summary:

- Day 1: Onboarding, repo scaffolding, base tokens, design system starter.
- Days 2 to 13: Rolling UI reviews and builds across 7 page groups.
- Days 14 to 15: Full-site QA, integrations wired, staging handover.

Content during Phase 1 is seeded from the Figma file and static seed data (`/seed/` directory). No CMS dependency for the website launch.

### Phase 2 — CMS + Admin + Booking Workflow (1 week follow-on)

- Auth and role-based access
- Content type management (Services, Doctors, Locations, HMOs, Testimonials, Blog Posts, Awards, FAQs)
- Booking workflow with status transitions and staff assignment
- Umami analytics dashboard embedded in the admin panel

### Phase 3 — Post-launch (30 days)

Bug fixes, snags, and stabilisation. Retention fee released at the end.

### Ongoing — Maintenance (6 months)

Hosting, updates, priority support, and up to 8 hours per month of minor improvements.

**Claude Code must not build Phase 2 features during Phase 1 work**, even if adjacent to a Phase 1 task. If the temptation arises, stop and ask.

---

## 2. Tech Stack

Every technology below is locked. Do not substitute without asking.

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server components by default; use client components only when necessary. |
| Language | TypeScript (strict mode) | No `any` without a comment explaining why. |
| Styling | Tailwind CSS + shadcn/ui | shadcn components copied into the repo, not imported as a package. |
| Package manager | npm | Not pnpm, not yarn. Lockfile committed. |
| Node version | 22 LTS | Specify in `.nvmrc` and `package.json` engines field. |
| Database | Neon (Postgres) | Serverless Postgres. Move to self-hosted post-launch. |
| ORM | Drizzle ORM | Type-safe, lightweight, works well with Neon. |
| File uploads | UploadThing | For the demo. Self-hosted alternative evaluated post-launch. |
| Auth | Auth.js (v5, previously NextAuth) with Credentials provider | Email + password; sessions stored in Postgres. |
| Email (transactional) | Resend (optional) | Wire it up so it can be enabled with an env var; do not hard-depend on it. |
| Analytics | Umami (self-hosted) | Deployed alongside the app on Vercel. Dashboard embedded in admin. |
| Hosting (Phase 1) | Vercel | Preview deploys per PR; production on `main`. |
| Hosting (post-launch) | Self-hosted (TBD) | Structure the app so it is not Vercel-locked. |
| WhatsApp | WhatsApp Business API (via Meta) | Provider TBD. Set up abstraction. |
| Booking sync target (later) | Insta HMS (`instahms.com`) | Docs to come. Design for this integration from day one. |

### Dependencies to install upfront

```
next@15
react@19
typescript
tailwindcss
@radix-ui/react-* (via shadcn install script)
drizzle-orm
@neondatabase/serverless
next-auth@beta (v5)
uploadthing @uploadthing/react
zod
react-hook-form
@hookform/resolvers
date-fns
lucide-react
clsx tailwind-merge
```

### Dependencies NOT to install

- Any UI kit other than shadcn/ui (no Chakra, no MUI, no Ant, no daisyUI).
- Any state management library. Use React state, server components, and URL state.
- Any CSS-in-JS library. Tailwind only.
- Any date library beyond `date-fns`. No Moment, no Day.js.
- Any HTTP client. Use native `fetch`.

---

## 3. Repository and Conventions

### Directory structure

```
/
├── app/                        # Next.js App Router
│   ├── (marketing)/            # Public marketing pages
│   │   ├── page.tsx            # Homepage
│   │   ├── about/
│   │   ├── services/
│   │   ├── locations/
│   │   ├── blog/
│   │   ├── for-corporates/
│   │   ├── contact/
│   │   ├── book/
│   │   ├── privacy/
│   │   ├── terms/
│   │   └── not-found.tsx       # 404
│   ├── (admin)/                # Phase 2. Do not build in Phase 1.
│   │   └── admin/
│   ├── api/
│   │   ├── booking/
│   │   ├── contact/
│   │   ├── newsletter/
│   │   ├── corporate/
│   │   └── uploadthing/
│   └── layout.tsx
├── components/
│   ├── ui/                     # shadcn primitives
│   ├── site/                   # Site-specific components (Header, Footer, TrustRibbon)
│   ├── booking/                # Booking flow components
│   └── admin/                  # Phase 2. Empty in Phase 1.
├── lib/
│   ├── db/
│   │   ├── schema.ts           # Drizzle schema
│   │   ├── client.ts           # Neon client
│   │   └── seed.ts             # Seed data script
│   ├── auth/                   # Phase 2
│   ├── booking/
│   │   └── destinations/       # Strategy pattern for booking submission targets
│   ├── email/
│   ├── analytics/
│   └── utils.ts
├── content/                    # MDX for legal pages if any
├── seed/                       # Static JSON seed data for Phase 1
│   ├── services.json
│   ├── doctors.json
│   ├── locations.json
│   ├── hmos.json
│   ├── testimonials.json
│   ├── awards.json
│   └── faqs.json
├── public/                     # Static assets
├── styles/
│   └── globals.css
├── drizzle/                    # Migrations
├── .env.example
├── .env.local                  # Not committed
├── .nvmrc
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── drizzle.config.ts
├── next.config.ts
└── README.md
```

### Naming conventions

- **Files and folders:** kebab-case (`service-card.tsx`, `booking-flow/`).
- **Components:** PascalCase (`ServiceCard`, `BookingFlow`).
- **Hooks:** camelCase with `use` prefix (`useBookingState`).
- **Utility functions:** camelCase (`formatPhoneNumber`).
- **Types and interfaces:** PascalCase (`type Booking`, `interface DoctorProfile`).
- **Constants:** UPPER_SNAKE_CASE (`MAX_BOOKING_ATTEMPTS`).
- **Database tables:** snake_case, plural (`bookings`, `doctors`, `services`).
- **Database columns:** snake_case (`created_at`, `patient_email`).
- **API routes:** kebab-case (`/api/booking-submit`).

### Git conventions

- **Branch strategy:** Feature branches off `main`, PR-based merging. Squash merges only.
- **Commit style:** Conventional Commits.
  - `feat: add booking flow step 3`
  - `fix: correct HMO widget filter behaviour`
  - `refactor: extract trust ribbon component`
  - `docs: update env var list in README`
- **PR titles:** Same convention as commits.
- **Never commit:** `.env.local`, `node_modules`, `.next`, `.DS_Store`.

### TypeScript strictness

`tsconfig.json` must have:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitAny": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

---

## 4. Brand and Design System

Brand assets and typography are **locked**. Follow the Figma file for spacing, sizing, and component composition. This section documents the values that need to live in code.

### Typography

- **Family:** Neo Tech (self-hosted `.woff2` files in `/public/fonts/`).
- Load via `next/font/local` with `display: 'swap'`.
- Weights required: 400, 500, 600, 700.
- Fallback stack: `Neo Tech, ui-sans-serif, system-ui, sans-serif`.

Type scale (Tailwind extension):

```
xs      12px    1.4     letter-spacing 0
sm      14px    1.5
base    16px    1.6
lg      18px    1.6
xl      20px    1.5
2xl     24px    1.4
3xl     30px    1.3
4xl     36px    1.2
5xl     48px    1.1
6xl     60px    1.05
```

Headline weights are 700. Body weight is 400. UI weight is 500.

### Colours

**Colours will be pasted here from the brand image once available.** Placeholder structure:

```
Primary:        <hex>
Primary dark:   <hex>
Accent:         <hex>
Emergency red:  <hex>
Background:     <hex>
Surface:        <hex>
Text primary:   <hex>
Text muted:     <hex>
Border:         <hex>
Success:        <hex>
Warning:        <hex>
```

Configure these as Tailwind theme extensions and expose as CSS variables so they can be referenced from arbitrary components.

### Spacing scale

Tailwind's default 4-point scale is fine. Don't add custom scales.

### Border radius

- `sm` — 4px (inputs, small cards)
- `md` — 8px (buttons, cards)
- `lg` — 12px (large cards, modal)
- `xl` — 16px (hero cards)
- `full` — 9999px (pills, avatars)

### Shadows

- `sm` — subtle depth for hover states
- `md` — default card lift
- `lg` — modal / dialog

Refer to Figma for exact values. No shadow above `lg`.

### Icons

- **Icon set:** Lucide React only. No FontAwesome, no Heroicons, no mixed sets.
- Icon size defaults: 16, 20, 24, 32.
- Icon colour inherits from parent unless explicitly overridden.

### Motion

- Prefer `transition` utilities over `animate-*`.
- Default duration: 200ms.
- Default easing: `ease-out`.
- Avoid layout-shifting animations. Use `transform` and `opacity` only.
- No auto-playing carousels or auto-rotating anything. The current site's slider is a known anti-pattern for this brand.

---

## 5. Content Model and Data Layer

### Approach

Every content type is defined once as a Drizzle schema. During Phase 1, the website reads seed data from `/seed/*.json` files. During Phase 2, the admin panel writes to Postgres. **The schema is designed for Phase 2 from day one**, so no migration is needed to activate CMS-backed reads.

Every content type has:
- `id` (uuid, primary key)
- `slug` (unique, lowercase, kebab-case where user-facing)
- `created_at`, `updated_at`, `deleted_at` (soft delete)
- `published` (boolean, default false in DB, always true for seed)
- `order` (integer, for sortable lists)

### Content types

#### `services`
```
name              string
slug              string, unique
family            enum: family_healthcare | women_and_children | specialist | diagnostics
short_description string (up to 200 chars, for cards)
long_description  text (150 to 250 words)
who_its_for       string[]
how_to_access     string[]
typical_wait_time string, nullable
what_to_expect    text
featured_image    string (upload key)
gallery_images    string[]
related_service_ids uuid[]
branch_ids        uuid[]
```

#### `doctors`
```
name              string
slug              string, unique
title             string  (e.g. "Consultant Paediatrician")
qualifications    string[]
years_experience  integer
specialties       string[]
languages_spoken  string[]
bio               text (80 to 120 words)
headshot          string (upload key)
in_house          boolean
visiting          boolean
branch_ids        uuid[]
```

#### `locations`
```
name                string  (e.g. "Victoria Island")
slug                string, unique
address_line_1      string
address_line_2      string, nullable
city                string
state               string
country             string (default "Nigeria")
latitude            decimal
longitude           decimal
phone               string
whatsapp            string
emergency_line      string
hours               jsonb  (per-day schedule)
services_available  uuid[]  (references services)
parking_info        string, nullable
accessibility_notes string, nullable
hero_image          string (upload key)
gallery_images      string[]
```

#### `hmos`
```
name              string
slug              string, unique
logo              string (upload key)
branch_ids        uuid[]   (accepted at which branches)
coverage_notes    string, nullable
copay_applies     boolean
plan_notes        text, nullable
```

#### `testimonials`
```
patient_name      string   (or initials if preference set)
name_format       enum: full | first_only | initials
avatar            string, nullable (upload key)
quote             text
service_id        uuid, nullable
branch_id         uuid, nullable
date_given        date
featured          boolean
```

#### `blog_posts`
```
title             string
slug              string, unique
excerpt           string (up to 300 chars)
body              text (MDX)
hero_image        string
author_id         uuid, references authors
category          enum: seasonal_alerts | family_health | women_and_children | corporate_wellness
tags              string[]
published_at      timestamp
related_post_ids  uuid[]
```

#### `authors`
```
name              string
slug              string, unique
role              string  (e.g. "Consultant Paediatrician")
bio               text
headshot          string
doctor_id         uuid, nullable, references doctors
```

#### `awards`
```
name              string
awarding_body     string
year              integer
description       text
logo              string (upload key)
certificate_image string, nullable
external_link     string, nullable
```

#### `faqs`
```
question          string
answer            text
category          enum: general | booking | services | insurance | emergencies
order             integer
```

#### `bookings`  (Phase 1 write, Phase 2 workflow)
```
id                    uuid
reference             string (human-readable, e.g. "PMH-2026-000123")
branch_id             uuid
service_family        enum
service_id            uuid, nullable
preferred_date        date
preferred_time_window enum: morning | afternoon | evening
patient_name          string
patient_phone         string
patient_email         string
patient_dob           date, nullable
existing_patient      boolean
reason_for_visit      text, nullable
hmo_id                uuid, nullable
hmo_plan              string, nullable
consent_ndpr          boolean  (must be true)
consent_marketing     boolean  (opt-in)
status                enum: new | contacted | confirmed | completed | no_show | cancelled
assigned_to_user_id   uuid, nullable
internal_notes        text, nullable
source                enum: website | phone | walk_in | referral
created_at            timestamp
```

#### `contact_submissions`
```
name              string
email             string
phone             string, nullable
subject           string
message           text
branch_id         uuid, nullable
consent_ndpr      boolean
handled           boolean
handled_by        uuid, nullable
handled_at        timestamp, nullable
```

#### `corporate_enquiries`
```
company_name         string
contact_name         string
contact_email        string
contact_phone        string
company_size         enum: 1_50 | 51_200 | 201_500 | 501_1000 | 1000_plus
sector               string
current_provider     string, nullable
requirements         text
consent_ndpr         boolean
status               enum: new | contacted | proposal_sent | won | lost
created_at           timestamp
```

#### `newsletter_subscribers`
```
email             string, unique
name              string, nullable
consent_ndpr      boolean
double_opt_in     boolean
confirmed_at      timestamp, nullable
unsubscribed_at   timestamp, nullable
```

#### Phase 2 only: `users`, `sessions`, `accounts` (for Auth.js)

Defined in Phase 2. Do not implement in Phase 1.

### Seed data

`/seed/*.json` files hydrate the website during Phase 1. Structure mirrors the schema. Seed data is populated from the Figma content and Paelon's confirmed material. Do not fabricate content. If a required field is empty, add a `TODO(seed)` comment and surface it to Francis rather than inventing.

### Query patterns

- Use Drizzle's query builder, not raw SQL.
- Cache read queries with Next.js's built-in `unstable_cache` where appropriate.
- Never cache authenticated queries or booking data.

---

## 6. Pages and Templates

Fifteen templates. Each has an owning group per the timeline in section 1. Do not build ahead of the group order.

### Marketing (8 templates)

#### Homepage `/`
- Single calm hero. No auto-rotating slider under any circumstance.
- One primary CTA: "Book Appointment".
- Trust ribbon below hero: SafeCare 5-star, established 2010.
- Three core service cards: Family Healthcare, Women and Children, Corporate Healthcare.
- "For Patricia" block: quiet, prominent, links to About page.
- HMO confirmation widget: typeahead input.
- Two real testimonials (real names or initials, real photos where consented).
- Recent blog post card.
- Footer CTA pair: Book / Find a Branch.

#### About `/about`
- Founding story (Patricia, Dr. Ngozi Onyia).
- Mission, Vision, Value Proposition, Motto as one integrated page, not fragmented strip.
- Awards and accreditations as a scrollable timeline.
- Leadership team with photos and bios.
- ESG / IFC EDGE certification block.

#### Services index `/services`
- Filterable by service family.
- Each card: name, short description, "learn more" link.
- Filter by branch also available.

#### Service detail `/services/[slug]`
- Overview in plain language.
- Who it's for.
- How to access (private, corporate, HMO).
- Typical wait time and what to expect.
- Inline "Book this service" CTA (deep-links to booking flow with service pre-selected).
- Related services at bottom.

#### Locations index `/locations`
- Map view + list view toggle.
- Each branch card: name, hours today, phone, services count.

#### Location detail `/locations/[slug]`
- Address with directions link.
- Full hours per day.
- Phone, WhatsApp, emergency line.
- Services available at this branch.
- Photos, parking, accessibility.
- Embedded map.

#### For Corporates `/for-corporates`
- Retainer programme overview.
- Qualifying form (routes to `corporate_enquiries`).
- Case studies (from `blog_posts` filtered by `corporate_wellness`).

#### Blog index `/blog` + Blog post `/blog/[slug]`
- Index: filterable by category, paginated.
- Post: MDX body, hero image, author card, related posts, share buttons.

### Functional (4 templates)

#### Book Appointment `/book`
See section 7 (Booking Flow) for full spec.

#### Contact `/contact`
- General enquiry form (routes to `contact_submissions`).
- Emergency line block, visually distinct.
- WhatsApp Business link with pre-populated greeting.
- Branch directory snapshot.

#### HMO Coverage Check `/hmo-check`
- Typeahead input.
- On match: shows accepted branches, coverage notes, copay info.
- On no match: "we may still be able to help, contact us" with link to contact form.

#### Privacy Policy `/privacy` and Terms `/terms`
- MDX content.
- NDPR-aligned. Draft to be reviewed by Paelon's legal counsel before launch.

### Utility (3 templates)

#### 404 `/not-found`
- On-brand.
- Emergency line prominent.
- Search bar linking to services / locations.
- Link back to homepage.

#### Booking confirmation `/book/confirmed`
- Success message with reference number.
- What to expect next.
- Contact info if changes needed.

#### Newsletter confirmation `/newsletter/confirmed`
- Success message.
- Link back to homepage.

### Global components

- **Header:** logo, services dropdown, locations, for patients, for corporates, primary Book Appointment CTA.
- **Sticky mobile bottom bar:** Call · WhatsApp · Book. Always visible on mobile.
- **Emergency line block:** red accent, one-tap reachable, appears in header on desktop and in the mobile bottom bar's expandable section.
- **Trust ribbon:** SafeCare 5-star, established 2010. Reusable component, editable via CMS in Phase 2.
- **Footer:** branch directory, social links, newsletter signup, legal links, NDPR contact.

---

## 7. Booking Flow

The booking flow is the single most important conversion path. Get this right.

### UX

Six steps, one screen each on mobile. Progress indicator visible at all times. Users can navigate back without losing state. State stored in React state during the session; on submit, POSTed to the API.

1. **Select branch** — cards, not a dropdown. Each shows name and hours today.
2. **Select service family** — cards: Family Healthcare, Women and Children, Specialist, Diagnostics. Optionally deep-link with a pre-selected service.
3. **Preferred date and time window** — date picker (7 days out from today) + morning / afternoon / evening.
4. **Patient details** — name, phone, email, DOB (optional), existing patient toggle, reason (optional textarea).
5. **HMO** — optional. Typeahead. "None / paying privately" is a first-class option.
6. **Consent and review** — NDPR consent checkbox (required), marketing opt-in checkbox (optional), review of all inputs, submit button.

### Validation

Use Zod schemas. Validate on both client and server. Client validation is UX; server validation is truth.

Client-side:
- Name: min 2 chars, max 100 chars.
- Phone: Nigerian format accepted (`+234...`, `0...`, local numbers). Use a phone input library that handles this.
- Email: valid format.
- Date: must be a future date within 90 days.
- Consent: must be `true`.

### Submission handler

```
POST /api/booking
```

The handler:

1. Validates input server-side (Zod).
2. Rate-limits per IP (5 submissions per hour). Return 429 if exceeded.
3. Generates a reference number: `PMH-YYYY-NNNNNN` where NNNNNN is a zero-padded sequence.
4. Writes to the `bookings` table with status `new`.
5. Sends to configured destinations via strategy pattern (see below).
6. Returns `{ reference, redirectUrl: '/book/confirmed?ref=...' }`.

### Destination strategy pattern

Booking submissions are dispatched via a strategy pattern so destinations are swappable. Directory: `/lib/booking/destinations/`.

```typescript
// /lib/booking/destinations/types.ts
export interface BookingDestination {
  name: string;
  enabled: boolean;
  send(booking: Booking): Promise<{ success: boolean; error?: string }>;
}
```

Destinations to implement in Phase 1:

- **`email.ts`** — Sends via Resend (if enabled) or SMTP fallback. Recipients configured per branch (env var).
- **`whatsapp.ts`** — Sends confirmation to the patient's WhatsApp via Business API. Provider TBD; leave as a stub that can be swapped.
- **`log.ts`** — Always enabled. Writes structured JSON to console for observability.

Destinations planned for later phases (stub the interface now):

- **`insta-hms.ts`** — Sends to Insta HMS API. Docs to come. Stub the class, do not implement the API call.

The `Booking` submission handler iterates over enabled destinations in parallel via `Promise.allSettled`. **A failed destination does not fail the booking.** The database write is the source of truth; email delivery is best-effort.

### Confirmation page

After successful submission, the user lands on `/book/confirmed?ref=PMH-2026-000123`. Show the reference number, what happens next ("we will contact you within 4 business hours during clinic hours"), and links to WhatsApp and phone if they need to reach the hospital sooner.

### Deep-linking

Service pages have a "Book this service" CTA that deep-links to `/book?service=<service-slug>` and pre-fills step 2.

Location pages have a "Book at this branch" CTA that deep-links to `/book?branch=<location-slug>` and pre-fills step 1.

Both deep links skip the pre-filled step and land on the next step directly.

---

## 8. CMS and Admin Panel

**Phase 2 only.** Do not build any of this during Phase 1.

### Access

- Auth: Auth.js v5 with Credentials provider (email + password).
- Sessions stored in Postgres.
- All admin routes protected by middleware.
- Password requirements: min 12 chars, complexity checks via Zod.

### Roles

Role stored on the `users` table. Three roles:

- **`admin`** — Full CRUD on all content, user management, settings.
- **`editor`** — CRUD on content, no user management.
- **`contributor`** — Create and edit their own content only. Publish requires an editor or admin.

### Admin routes

- `/admin/login` — Public.
- `/admin` — Dashboard: recent bookings, recent contact submissions, quick stats.
- `/admin/bookings` — Booking workflow interface (see below).
- `/admin/contact` — Contact submissions.
- `/admin/corporate-enquiries` — Corporate enquiries.
- `/admin/services` — Service CRUD.
- `/admin/doctors` — Doctor CRUD.
- `/admin/locations` — Location CRUD.
- `/admin/hmos` — HMO CRUD.
- `/admin/testimonials` — Testimonial CRUD.
- `/admin/blog` — Blog post CRUD with MDX editor.
- `/admin/awards` — Award CRUD.
- `/admin/faqs` — FAQ CRUD.
- `/admin/users` — User management (admin only).
- `/admin/analytics` — Umami dashboard iframe embed.
- `/admin/settings` — Site settings, feature flags.

### Booking workflow

Booking status transitions:

```
new → contacted → confirmed → completed
                ↘ cancelled
                ↘ no_show
```

Interface features:

- Filterable table: by status, branch, date range, assigned staff.
- Sortable columns.
- Bulk actions: assign to me, mark contacted, mark cancelled.
- Detail view per booking with:
  - Patient details.
  - Timeline of status changes with actor and timestamp.
  - Internal notes (rich text, visible to staff only).
  - Assignment dropdown (users with `editor` or `admin` role).
- Every status change writes to a `booking_status_history` table with `booking_id`, `from_status`, `to_status`, `changed_by_user_id`, `changed_at`, `note`.

### Content editing

- Rich text where sensible (bio, description, blog body) via a lightweight editor. Recommendation: Lexical or Tiptap. Confirm before installing.
- MDX for blog posts (with a preview pane).
- Image uploads via UploadThing.
- Slug auto-generated from title, editable, uniqueness enforced.
- Draft / published toggle.
- "Preview" button that opens the marketing site in draft mode showing the unpublished state.

---

## 9. Analytics

Umami, self-hosted alongside the app.

### Deployment

- Deploy Umami as a separate Vercel project pointing at the same Postgres database (Umami has its own schema; run migrations in a separate namespace or DB).
- Alternatively, run Umami on the same Vercel project as a route group. Investigate what is cleaner; default to a separate deployment.

### Tracking

- Include the Umami tracking script in the root layout.
- Track page views automatically.
- Track custom events: `booking_started`, `booking_step_completed` (with `step` prop), `booking_submitted`, `contact_form_submitted`, `newsletter_signup`, `hmo_lookup_performed`, `emergency_line_clicked`.
- Do NOT track PII.
- Do NOT set cookies (Umami is cookieless).

### Dashboard integration

Umami is embedded via iframe in `/admin/analytics`. Grant admin users access via Umami's share URLs or SSO.

---

## 10. Integrations

### Resend (optional)

- Booking confirmation email to patient.
- Booking notification to branch email (from env).
- Contact form receipts.
- Corporate enquiry notifications.
- Newsletter double opt-in.

Feature-flag Resend via `RESEND_ENABLED=true|false` env var. If false, all email destinations no-op silently and log to console. **The website must work end-to-end with Resend disabled.**

### WhatsApp Business

- Provider decision deferred (see the strategy pattern in section 7).
- Booking confirmations sent to patient WhatsApp when available.
- Contact form has a WhatsApp deep-link with pre-populated greeting.
- Emergency line surfaces WhatsApp as a secondary contact.

### UploadThing

- Configure UploadThing for image uploads in the admin panel (Phase 2).
- Public images accessed via UploadThing's CDN.
- Types allowed: `jpeg`, `png`, `webp`.
- Max size: 5 MB per image (transcode larger uploads server-side to WebP).

### Insta HMS (future)

- Design the booking destination interface today so that adding Insta HMS later is one file.
- Do not build the actual client until docs arrive.

---

## 11. SEO Requirements

Non-negotiable at launch.

### Meta

- Every page has a unique `<title>` and `<meta description>`.
- Open Graph and Twitter Card tags on every page.
- Canonical tag on every page.

### Structured data

Implement JSON-LD for:

- `MedicalOrganization` on the homepage and About page.
- `Hospital` on each `/locations/[slug]` page.
- `Physician` on each doctor profile.
- `MedicalProcedure` on each service page.
- `FAQPage` on any page with FAQ content.
- `Article` on each blog post.
- `BreadcrumbList` on all detail pages.

### Sitemaps and robots

- Dynamic `sitemap.xml` at `/sitemap.xml` generated from published content.
- `robots.txt` at `/robots.txt` allowing all crawlers except on `/admin`, `/api`, `/book/confirmed`.

### Redirects

- 301 redirects from the old WordPress URLs to the new structure.
- Managed in a single `/lib/redirects.ts` file mapped to Next.js redirects in `next.config.ts`.
- URL list to be confirmed with Paelon during Phase 1.

### Link hygiene

- All internal links use Next.js `<Link>` component.
- All `<a>` tags have descriptive text. Never "Read more" or "Learn more" alone.
- External links have `rel="noopener noreferrer"` and open in a new tab only when there is a good reason.

---

## 12. Accessibility Requirements

Target: WCAG 2.1 AA across every template. Not "mostly". Every.

### Semantics

- Use semantic HTML (`nav`, `main`, `article`, `aside`, `header`, `footer`) before reaching for `<div>`.
- Heading hierarchy is strictly sequential. `h1` → `h2` → `h3`. No skipping.
- Landmarks labelled where multiple exist on a page.

### Interactive elements

- All form inputs have associated labels (not placeholder-as-label).
- All interactive elements are keyboard-accessible.
- Focus rings are visible and on-brand (do not remove them).
- Skip-to-content link as the first tabbable element.
- Modals trap focus and return it on close.

### Colour and contrast

- All text meets 4.5:1 contrast minimum.
- Interactive elements meet 3:1 contrast minimum.
- Colour is never the sole indicator of state (add icons or text).

### Screen readers

- Every image has meaningful alt text. Decorative images use `alt=""`.
- Icons in buttons have `aria-label`.
- Live regions (`aria-live`) for booking flow step changes and form errors.

### Testing

- Run `axe-core` in the browser during development.
- Test tab navigation manually.
- Test with VoiceOver (macOS) or NVDA (Windows) at least once per page group.

---

## 13. Performance Budgets

Hard limits. If a change would push a metric past its budget, stop and ask.

| Metric | Budget |
|---|---|
| Lighthouse Performance (mobile) | ≥ 90 |
| Lighthouse Accessibility | ≥ 95 |
| Lighthouse SEO | ≥ 95 |
| Lighthouse Best Practices | 100 |
| Largest Contentful Paint (slow 4G) | < 2.0 s |
| First Contentful Paint | < 1.5 s |
| Total Blocking Time | < 150 ms |
| Cumulative Layout Shift | < 0.05 |
| Initial JS bundle (gzipped) | < 150 KB |
| Page weight (homepage) | < 800 KB |
| Page weight (any page) | < 1.5 MB |
| Time to Interactive (slow 4G) | < 3.0 s |

### Practices

- Server components by default.
- Client components only when interactivity is required.
- Images via `next/image` with proper sizes and priority flags.
- Fonts via `next/font/local` with `display: 'swap'`.
- No third-party scripts on the homepage.
- Umami loads deferred.
- Route-level code splitting via App Router.

---

## 14. Security and Compliance

### Headers

Configure via Next.js middleware:

- `Content-Security-Policy` — strict, allow only trusted sources.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- `X-Frame-Options: DENY`.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`.

### Auth (Phase 2)

- Passwords hashed with argon2id.
- Session cookies `HttpOnly`, `Secure`, `SameSite=Lax`.
- CSRF protection via Auth.js.
- Rate-limit login endpoint (5 attempts per 15 minutes per IP).
- Lock account after 10 failed attempts pending admin unlock.

### NDPR compliance

- Explicit consent checkbox on every form collecting personal data (booking, contact, corporate, newsletter). Not pre-checked.
- Privacy Policy linked from footer of every page.
- Terms linked from footer of every page.
- NDPR-required Data Protection Officer contact in footer.
- Cookie banner not required (Umami is cookieless, no marketing cookies).
- Data subject access request flow: email to a documented address triggers manual review. No automated deletion in Phase 1.
- Data retention: booking submissions retained for 12 months after appointment date, then archived.

### Env vars

Every env var documented in `.env.example`:

```
DATABASE_URL=
DATABASE_URL_UNPOOLED=
AUTH_SECRET=
AUTH_URL=

UPLOADTHING_SECRET=
UPLOADTHING_APP_ID=

RESEND_ENABLED=false
RESEND_API_KEY=
RESEND_FROM_EMAIL=

BRANCH_VI_EMAIL=
BRANCH_IKEJA_EMAIL=
BRANCH_MOSHOOD_EMAIL=
BRANCH_DELTA_EMAIL=

WHATSAPP_PROVIDER=
WHATSAPP_API_KEY=

UMAMI_WEBSITE_ID=
UMAMI_SCRIPT_URL=

NEXT_PUBLIC_SITE_URL=
```

**Never log env vars.** **Never commit `.env.local`.**

---

## 15. Development Workflow

### Local setup

```bash
npm install
cp .env.example .env.local
# Fill in .env.local
npm run db:push       # Apply Drizzle schema to Neon
npm run db:seed       # Populate seed data
npm run dev
```

### Scripts (`package.json`)

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:seed": "tsx lib/db/seed.ts",
    "db:studio": "drizzle-kit studio",
    "format": "prettier --write ."
  }
}
```

### CI

GitHub Actions (or Vercel's built-in CI):

- On every PR: lint, typecheck, build.
- Preview deploy per PR via Vercel.
- Only merge to `main` when all checks pass.
- Deploy to production on merge to `main`.

### Testing (Phase 1 pragmatic minimum)

- Unit tests via Vitest for utilities and Zod schemas.
- Zod schema tests are the minimum: every form submission schema tested for accept/reject.
- Playwright E2E for the booking flow happy path.
- No visual regression testing in Phase 1.

### Formatting

- Prettier with defaults.
- ESLint using Next.js's default preset.
- Run on commit via Husky + lint-staged (optional).

---

## 16. Claude Code Working Style

### Autonomy

- **Autonomous on reads.** Read any file, run any read-only command.
- **Ask on writes to files outside `/app`, `/components`, `/lib`, `/seed`.** Especially config files.
- **Ask on package installs.** Never install a package without confirming it is on the approved list.
- **Ask on schema changes after Phase 2 begins.** Migrations are one-way.
- **Ask on any destructive action.** Deleting files, tables, migrations, or history.

### Workflow

- Read this document end-to-end before writing code in a new area.
- Run tests after every meaningful change.
- Commit at logical stopping points with Conventional Commit messages.
- Do not push directly to `main`. Open a PR.
- If stuck for more than 15 minutes on a design choice, stop and ask Francis.
- If a task appears to require building Phase 2 features during Phase 1, stop and ask.

### Response style

- Terse. Prefer showing the code over explaining it, unless asked.
- When explaining a trade-off, one paragraph maximum.
- Do not narrate what you are about to do. Do it.
- When a decision has more than one reasonable answer, ask before choosing.

### What to always do

- Type everything strictly. Never use `any` without a comment.
- Server components by default.
- Handle loading and error states explicitly. No silent failures.
- Use Zod at every boundary (form submissions, API inputs).
- Add JSDoc to exported functions with non-obvious behaviour.
- Update this document when a decision changes.

### What to never do

- Never install a package not on the approved list without asking.
- Never introduce a state management library.
- Never build a Phase 2 feature during Phase 1.
- Never write copy that fabricates facts about Paelon (services offered, awards, patient stories). If a required field is empty, add a TODO and surface it.
- Never commit `.env.local` or any credentials.
- Never disable a Lighthouse or accessibility check to make a test pass. Fix the underlying issue.
- Never use `console.log` in shipped code. Use a proper logger or remove.

---

## 17. Explicitly Out of Scope for v1

Do not build these regardless of how easy they seem:

- Patient portal or any login-protected patient area.
- Electronic Medical Records integration.
- Telemedicine or video consultation infrastructure.
- Real-time per-doctor slot availability.
- Native mobile applications.
- Payment processing.
- Multilingual translations (English only for v1).
- Live chat.
- Full CRM sync.
- Automated SMS.
- Careers page or applicant tracking.
- Media Centre or press area beyond blog posts.

If Paelon requests any of these during the build, they enter the Phase 2+ backlog. Do not absorb them into v1.

---

## 18. Open Questions to Resolve Before Kickoff

Items that must be answered before Day 1. Flag any of these to Francis if they are still unresolved when work begins.

- [ ] Final brand colour hex codes and light/dark surface treatments.
- [ ] Neo Tech font files delivered as `.woff2` with license.
- [ ] Domain access confirmed with Paelon IT.
- [ ] Content seed data drafted from Figma.
- [ ] WhatsApp Business API provider decision.
- [ ] Insta HMS API documentation available.
- [ ] List of URLs to preserve for 301 redirects, confirmed with Paelon.
- [ ] Branch email inboxes for booking routing confirmed.
- [ ] NDPR Data Protection Officer contact confirmed.
- [ ] Privacy Policy and Terms of Use draft reviewed by Paelon legal counsel.

---

*Prepared by VARYN Studio. Built Right. Built For You. Last updated: July 2026.*
