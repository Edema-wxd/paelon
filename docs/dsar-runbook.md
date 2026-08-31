# DSAR runbook — locating a person's data

**Audience:** whoever handles a data subject access request at Paelon.
**Status:** Phase 1. Manual by design (master spec §14) — there is no automated
deletion, and there should not be one until someone owns the review step.

Under the NDPR a data subject may ask what personal data Paelon holds about
them, ask for it to be corrected, or ask for it to be erased. Requests arrive by
email to the DPO address in the site footer.

> **TODO(francis):** the DPO contact address is still outstanding (master spec
> §18). Until it is set, requests have no documented destination.

Personal data lives in exactly four tables. Nothing else in the database holds
information about a member of the public.

| Table | Holds |
|---|---|
| `bookings` | Name, phone, email, DOB, HMO, and free-text reason for visit |
| `contact_submissions` | Name, email, phone, message body |
| `corporate_enquiries` | Contact name, work email, work phone, requirements |
| `newsletter_subscribers` | Email, optional name |

`rate_limit_hits` holds a **salted SHA-256 of an IP address** and nothing else.
It is not reversible, is not linkable to a person without the original IP, and
is deleted after 24 hours. See "Rate limiting" below before answering a question
about it.

---

## Before you run anything

1. **Verify identity first.** These queries are the whole point of a DSAR, and
   running them for an unverified requester is itself a data breach. Confirm the
   request comes from the address or phone number in question, or from someone
   who can otherwise prove they are the data subject.
2. **Use a read-only connection** for the search step. Nothing in step 1 should
   be able to modify a row.
3. **Record what you ran and when.** A DSAR response should be reproducible.

Set the search terms once so no query is edited by hand:

```sql
-- Run these first in the same session as the queries below.
\set target_email 'person@example.com'
\set target_phone '+2348012345678'
```

Email is stored lowercased on `newsletter_subscribers` and on booking/contact
rows written by the API, but historic or manually-entered rows may not be, so
every email comparison below is case-insensitive.

Phone numbers written through the API are normalised to E.164 (`+234…`). A
requester will usually give you `0801 234 5678`. Convert before searching:
drop the leading `0`, prefix `+234`.

---

## Step 1 — Locate

### Bookings

```sql
SELECT id,
       reference,
       created_at,
       preferred_date,
       status,
       patient_name,
       patient_email,
       patient_phone,
       patient_dob,
       reason_for_visit,
       anonymised_at
FROM bookings
WHERE lower(patient_email) = lower(:'target_email')
   OR patient_phone = :'target_phone'
ORDER BY created_at DESC;
```

`reason_for_visit` is free-text symptom information — health data, the most
sensitive category under the NDPR. It is included in an access response, but
handle the response document accordingly: encrypted transfer, no forwarding.

### Contact submissions

```sql
SELECT id, created_at, name, email, phone, subject, message, handled
FROM contact_submissions
WHERE lower(email) = lower(:'target_email')
   OR phone = :'target_phone'
ORDER BY created_at DESC;
```

### Corporate enquiries

```sql
SELECT id, created_at, company_name, contact_name, contact_email,
       contact_phone, sector, requirements, status
FROM corporate_enquiries
WHERE lower(contact_email) = lower(:'target_email')
   OR contact_phone = :'target_phone'
ORDER BY created_at DESC;
```

### Newsletter

```sql
SELECT id, created_at, email, name, confirmed_at, unsubscribed_at
FROM newsletter_subscribers
WHERE lower(email) = lower(:'target_email');
```

Tokens are stored hashed and are not returned. They are not personal data and
disclosing them would let anyone holding the response alter the subscription.

### One-shot summary

Useful for answering "do you hold anything about me at all?" quickly, and for
confirming you have not missed a table:

```sql
SELECT 'bookings' AS source, count(*) AS rows
  FROM bookings
 WHERE lower(patient_email) = lower(:'target_email') OR patient_phone = :'target_phone'
UNION ALL
SELECT 'contact_submissions', count(*)
  FROM contact_submissions
 WHERE lower(email) = lower(:'target_email') OR phone = :'target_phone'
UNION ALL
SELECT 'corporate_enquiries', count(*)
  FROM corporate_enquiries
 WHERE lower(contact_email) = lower(:'target_email') OR contact_phone = :'target_phone'
UNION ALL
SELECT 'newsletter_subscribers', count(*)
  FROM newsletter_subscribers
 WHERE lower(email) = lower(:'target_email');
```

### Consent provenance

Every row above carries `consent_ndpr`, `consent_text_version`, and
`consent_given_at`. If the requester asks "what did I agree to, and when",
`consent_text_version` identifies the privacy policy wording in force at the
time. Include it — it is usually the honest answer to that question.

```sql
SELECT reference, consent_text_version, consent_given_at, consent_marketing
FROM bookings
WHERE lower(patient_email) = lower(:'target_email');
```

---

## Step 2 — Respond

Compile the located rows into a plain-language response. Do not send raw SQL
output: it contains column names, internal ids, and internal notes fields that
are not meaningful to the requester and may contain staff commentary.

Exclude from an access response:
- `internal_notes` and `assigned_to_user_id` on bookings (staff working notes)
- `handled_by` on contact submissions
- Any token hash

---

## Step 3 — Erasure or correction

**No automated deletion in Phase 1** (master spec §14). Erasure is a manual,
reviewed action, because some rows cannot simply be deleted:

- A booking connected to care actually delivered may be subject to a medical
  records retention obligation that overrides an erasure request. Check with
  Francis and, where relevant, clinical governance before deleting any booking.
- A newsletter subscriber asking to be removed should be **unsubscribed**, not
  deleted: deleting the row loses the record that they opted out, and they may
  be re-added by a later import.

The intended mechanism for bookings is **anonymise in place**, not delete: null
the personal columns, keep the aggregate row, and stamp `anonymised_at`. This
satisfies the NDPR obligation (the personal data is gone) while preserving
reporting continuity.

```sql
-- Review the rows first. Run inside a transaction and confirm the count.
BEGIN;

UPDATE bookings
   SET patient_name     = NULL,
       patient_phone    = NULL,
       patient_email    = NULL,
       patient_dob      = NULL,
       reason_for_visit = NULL,
       internal_notes   = NULL,
       anonymised_at    = now()
 WHERE lower(patient_email) = lower(:'target_email')
   AND anonymised_at IS NULL;

-- Check the row count matches what step 1 found, then COMMIT. Otherwise ROLLBACK.
COMMIT;
```

The same pattern applies to `contact_submissions` and `corporate_enquiries`,
which both carry `anonymised_at`.

For newsletter:

```sql
UPDATE newsletter_subscribers
   SET unsubscribed_at = now()
 WHERE lower(email) = lower(:'target_email');
```

---

## Rate limiting

`rate_limit_hits.key` is `<rule>:<sha256(salt + ip)>`. It cannot be searched by
email or phone, and cannot be reversed to an IP address without both the
original address and `RATE_LIMIT_SALT`.

If a requester supplies an IP address and asks whether it appears, you can
confirm or deny for the last 24 hours only — beyond that the rows are gone. The
hash is computed in `lib/rate-limit/index.ts` (`hashIdentifier`); use that
function rather than recomputing the digest by hand, so the salt and the input
format match.

In practice this table is out of scope for almost every DSAR: it holds no
identifier a person would recognise, and it self-expires within a day.

---

## What this runbook does not cover

- **Server logs.** The logger never writes patient names, phone numbers, email
  addresses, DOB, `reason_for_visit`, tokens, or raw IPs — email and phone are
  masked through `redactEmail`/`redactPhone` where they appear at all. There is
  therefore no log search step. If that ever stops being true, this section
  needs rewriting before the next DSAR, not after.
- **Email inboxes.** Booking notifications reach branch inboxes and are outside
  the database. A complete erasure request needs those searched too. Branch
  inbox retention is not currently defined — **TODO(francis)**.
- **Phase 2 admin data.** `audit_log` will record which staff member viewed or
  changed a record. That is data about staff, not about the requester, and is
  not disclosed in a public DSAR response.
