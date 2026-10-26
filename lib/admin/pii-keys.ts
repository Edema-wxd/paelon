/**
 * Which audit metadata keys name personal data — shared by the write path
 * (`stripPii` in `lib/admin/audit.ts`) and the viewer (`metadataPairs` in
 * `lib/admin/audit-view.ts`). Pure, so the viewer and its tests can import it
 * without the database.
 */

/**
 * Keys that name personal data, matched case-insensitively against the key with
 * `_` and `-` removed. Fragments match anywhere, so `patient_email` and
 * `passwordHash` hit; short words that occur inside innocent keys match only
 * the whole key.
 */
const PII_KEY_FRAGMENTS = [
  "email",
  "phone",
  "password",
  "address",
  "birth",
  "reasonforvisit",
  "token",
];
const PII_KEYS = new Set([
  "ip",
  "name",
  "fullname",
  "firstname",
  "lastname",
  "dob",
  "notes",
  "message",
  // A contact form's subject line is typed by the patient.
  "subject",
]);

export function isPiiKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[_-]/g, "");
  return (
    PII_KEYS.has(normalised) ||
    PII_KEY_FRAGMENTS.some((fragment) => normalised.includes(fragment))
  );
}

