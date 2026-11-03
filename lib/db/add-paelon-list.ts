import { readFileSync } from "node:fs";
import { join } from "node:path";

import { and, eq, inArray, isNull, max } from "drizzle-orm";
import type { z } from "zod";

import { closePool, dbTx } from "@/lib/db/client";
import {
  APPOINTMENT_WHATSAPP,
  NEW_DOCTOR_SLUGS,
  NEW_SERVICE_SLUGS,
  SPECIALTY_DOCTOR_SLUGS,
  WHATSAPP_LOCATION_SLUG,
  appendedOrders,
  decideNewRow,
  fillIfEmpty,
  mergeSpecialties,
} from "@/lib/db/paelon-list-plan";
import {
  auditLog,
  doctorLocations,
  doctors,
  locations,
  serviceLocations,
  services,
} from "@/lib/db/schema";
import { TODO_SEED, doctorSeedSchema, serviceSeedSchema } from "@/lib/validation/seed";

/**
 * Add Paelon's 2026-11-02 list to the database the site reads (Preview and
 * Production share it), without overwriting anything edited since seeding.
 *
 *  1. Insert the 18 new services and 2 new clinicians from `seed/`, each
 *     linked to its seeded branches and appended after the rows that exist.
 *  2. Extend the three existing clinicians' specialties, only where the stored
 *     list is contained in Paelon's.
 *  3. Set Victoria Island's WhatsApp to the appointment line, only if empty.
 *
 * `lib/db/paelon-list-plan.ts` holds the rules. Nothing is deleted, and every
 * change gets an `audit_log` row marked `via: "cli"`. Dry run by default;
 * `--apply` writes in one transaction.
 *
 *   node --env-file=.env.local ./node_modules/.bin/tsx lib/db/add-paelon-list.ts
 *   node --env-file=.env.local ./node_modules/.bin/tsx lib/db/add-paelon-list.ts --apply
 */

const APPLY = process.argv.includes("--apply");
const SCRIPT = "lib/db/add-paelon-list.ts";

type ServiceSeed = z.infer<typeof serviceSeedSchema>;
type DoctorSeed = z.infer<typeof doctorSeedSchema>;

/** The seed records for `slugs`, in that order. A missing slug is a bug here. */
function seedRecords<S extends z.ZodType<{ slug: string }>>(
  file: string,
  schema: S,
  slugs: readonly string[],
): z.infer<S>[] {
  const raw: unknown = JSON.parse(readFileSync(join(process.cwd(), "seed", file), "utf8"));
  const all = schema.array().parse(raw);
  return slugs.map((slug) => {
    const record = all.find((r) => r.slug === slug);
    if (!record) throw new Error(`seed/${file} has no record "${slug}"`);
    return record;
  });
}

const orTodo = (value: string | null): string => value ?? TODO_SEED;

async function main(): Promise<void> {
  const db = dbTx();
  const lines: string[] = [];

  const serviceSeeds = seedRecords("services.json", serviceSeedSchema, NEW_SERVICE_SLUGS);
  const newDoctorSeeds = seedRecords("doctors.json", doctorSeedSchema, NEW_DOCTOR_SLUGS);
  const specialtySeeds = seedRecords("doctors.json", doctorSeedSchema, SPECIALTY_DOCTOR_SLUGS);

  // ---- branches, by slug -----------------------------------------------------
  const branchRows = await db
    .select({ id: locations.id, slug: locations.slug, whatsapp: locations.whatsapp })
    .from(locations)
    .where(isNull(locations.deletedAt));
  const branchId = new Map(branchRows.map((b) => [b.slug, b.id]));

  const branchIds = (slugs: readonly string[], label: string): string[] =>
    slugs.flatMap((slug) => {
      const id = branchId.get(slug);
      if (!id) lines.push(`  ${label}: branch "${slug}" not in the database, not linked`);
      return id ? [id] : [];
    });

  // ---- 1a. services ----------------------------------------------------------
  const existingServices = await db
    .select({ slug: services.slug, deletedAt: services.deletedAt })
    .from(services)
    .where(inArray(services.slug, [...NEW_SERVICE_SLUGS]));

  const servicesToAdd: ServiceSeed[] = [];
  for (const seed of serviceSeeds) {
    const decision = decideNewRow(existingServices.find((s) => s.slug === seed.slug));
    if (decision.kind === "insert") servicesToAdd.push(seed);
    else if (decision.kind === "exists") lines.push(`  service ${seed.slug}: already exists, left alone`);
    else lines.push(`  service ${seed.slug}: a deleted row holds this slug, restore it in /admin/services`);
  }
  const [serviceMax] = await db
    .select({ value: max(services.order) })
    .from(services)
    .where(isNull(services.deletedAt));
  const serviceOrders = appendedOrders(serviceMax?.value ?? null, servicesToAdd.length);
  const serviceLinks = servicesToAdd.map((seed) => branchIds(seed.location_slugs, `service ${seed.slug}`));
  servicesToAdd.forEach((seed, i) =>
    lines.push(`  service ${seed.slug}: ADD "${seed.name}" (order ${serviceOrders[i]})`),
  );

  // ---- 1b. new doctors -------------------------------------------------------
  const existingNewDoctors = await db
    .select({ slug: doctors.slug, deletedAt: doctors.deletedAt })
    .from(doctors)
    .where(inArray(doctors.slug, [...NEW_DOCTOR_SLUGS]));

  const doctorsToAdd: DoctorSeed[] = [];
  for (const seed of newDoctorSeeds) {
    const decision = decideNewRow(existingNewDoctors.find((d) => d.slug === seed.slug));
    if (decision.kind === "insert") doctorsToAdd.push(seed);
    else if (decision.kind === "exists") lines.push(`  doctor ${seed.slug}: already exists, left alone`);
    else lines.push(`  doctor ${seed.slug}: a deleted row holds this slug, restore it in /admin/doctors`);
  }
  const [doctorMax] = await db
    .select({ value: max(doctors.order) })
    .from(doctors)
    .where(isNull(doctors.deletedAt));
  const doctorOrders = appendedOrders(doctorMax?.value ?? null, doctorsToAdd.length);
  const doctorLinks = doctorsToAdd.map((seed) => branchIds(seed.location_slugs, `doctor ${seed.slug}`));
  doctorsToAdd.forEach((seed, i) =>
    lines.push(`  doctor ${seed.slug}: ADD "${seed.name}" (order ${doctorOrders[i]})`),
  );

  // ---- 2. specialties --------------------------------------------------------
  const specialtyRows = await db
    .select({ id: doctors.id, slug: doctors.slug, specialties: doctors.specialties })
    .from(doctors)
    .where(and(inArray(doctors.slug, [...SPECIALTY_DOCTOR_SLUGS]), isNull(doctors.deletedAt)));

  const specialtyUpdates: { id: string; slug: string; before: string[]; after: string[] }[] = [];
  for (const seed of specialtySeeds) {
    const row = specialtyRows.find((r) => r.slug === seed.slug);
    if (!row) {
      lines.push(`  doctor ${seed.slug}: not in the database, specialties not set`);
      continue;
    }
    const decision = mergeSpecialties(row.specialties, seed.specialties);
    if (decision.kind === "set") {
      specialtyUpdates.push({ id: row.id, slug: row.slug, before: row.specialties, after: decision.value });
      lines.push(`  doctor ${seed.slug}: SPECIALTIES [${row.specialties.join(", ")}] -> [${decision.value.join(", ")}]`);
    } else if (decision.kind === "unchanged") {
      lines.push(`  doctor ${seed.slug}: specialties already include Paelon's list`);
    } else {
      lines.push(
        `  doctor ${seed.slug}: specialties edited to [${row.specialties.join(", ")}], ` +
          `left alone; Paelon's list is [${seed.specialties.join(", ")}]`,
      );
    }
  }

  // ---- 3. WhatsApp -----------------------------------------------------------
  const branch = branchRows.find((b) => b.slug === WHATSAPP_LOCATION_SLUG);
  let whatsappUpdate: { id: string; before: string | null } | null = null;
  if (!branch) {
    lines.push(`  location ${WHATSAPP_LOCATION_SLUG}: not in the database, WhatsApp not set`);
  } else {
    const decision = fillIfEmpty(branch.whatsapp, APPOINTMENT_WHATSAPP);
    if (decision.kind === "set") {
      whatsappUpdate = { id: branch.id, before: branch.whatsapp };
      lines.push(`  location ${branch.slug}: WHATSAPP -> ${APPOINTMENT_WHATSAPP}`);
    } else if (decision.kind === "unchanged") {
      lines.push(`  location ${branch.slug}: WhatsApp already the appointment line`);
    } else {
      lines.push(`  location ${branch.slug}: WhatsApp is ${decision.current}, left alone`);
    }
  }

  process.stdout.write(`Planned changes\n${lines.join("\n")}\n\n`);

  const total =
    servicesToAdd.length + doctorsToAdd.length + specialtyUpdates.length + (whatsappUpdate ? 1 : 0);

  if (!APPLY) {
    process.stdout.write("Dry run: nothing written. Re-run with --apply.\n");
    return;
  }
  if (total === 0) {
    process.stdout.write("Nothing to change.\n");
    return;
  }

  await db.transaction(async (tx) => {
    const audits: (typeof auditLog.$inferInsert)[] = [];
    const meta = (extra: Record<string, unknown>) => ({ via: "cli", script: SCRIPT, ...extra });

    for (const [i, seed] of servicesToAdd.entries()) {
      const [row] = await tx
        .insert(services)
        .values({
          slug: seed.slug,
          name: seed.name,
          published: seed.published,
          order: serviceOrders[i] ?? 0,
          family: seed.family,
          shortDescription: orTodo(seed.short_description),
          whoItsFor: seed.who_its_for,
          howToAccess: seed.how_to_access,
          typicalWaitTime: seed.typical_wait_time,
        })
        .returning({ id: services.id });
      if (!row) throw new Error(`insert returned no row for service ${seed.slug}`);
      const links = serviceLinks[i] ?? [];
      if (links.length > 0) {
        await tx.insert(serviceLocations).values(links.map((locationId) => ({ serviceId: row.id, locationId })));
      }
      audits.push({
        action: "services.created",
        entityType: "services",
        entityId: row.id,
        metadata: meta({ change: "added from Paelon's list", slug: seed.slug, published: seed.published }),
      });
    }

    for (const [i, seed] of doctorsToAdd.entries()) {
      const [row] = await tx
        .insert(doctors)
        .values({
          slug: seed.slug,
          name: seed.name,
          published: seed.published,
          order: doctorOrders[i] ?? 0,
          title: orTodo(seed.title),
          qualifications: seed.qualifications,
          yearsExperience: seed.years_experience,
          specialties: seed.specialties,
          languagesSpoken: seed.languages_spoken,
          bio: orTodo(seed.bio),
          inHouse: seed.in_house,
          visiting: seed.visiting,
        })
        .returning({ id: doctors.id });
      if (!row) throw new Error(`insert returned no row for doctor ${seed.slug}`);
      const links = doctorLinks[i] ?? [];
      if (links.length > 0) {
        await tx.insert(doctorLocations).values(links.map((locationId) => ({ doctorId: row.id, locationId })));
      }
      audits.push({
        action: "doctors.created",
        entityType: "doctors",
        entityId: row.id,
        metadata: meta({ change: "added from Paelon's list", slug: seed.slug, published: seed.published }),
      });
    }

    for (const update of specialtyUpdates) {
      await tx
        .update(doctors)
        .set({ specialties: update.after, updatedAt: new Date() })
        .where(eq(doctors.id, update.id));
      audits.push({
        action: "doctors.updated",
        entityType: "doctors",
        entityId: update.id,
        metadata: meta({
          change: "specialties from Paelon's list",
          slug: update.slug,
          specialties: { before: update.before, after: update.after },
        }),
      });
    }

    if (whatsappUpdate) {
      await tx
        .update(locations)
        .set({ whatsapp: APPOINTMENT_WHATSAPP, updatedAt: new Date() })
        .where(eq(locations.id, whatsappUpdate.id));
      audits.push({
        action: "locations.updated",
        entityType: "locations",
        entityId: whatsappUpdate.id,
        metadata: meta({
          change: "WhatsApp set to the appointment line",
          slug: WHATSAPP_LOCATION_SLUG,
          whatsapp: { before: whatsappUpdate.before, after: APPOINTMENT_WHATSAPP },
        }),
      });
    }

    await tx.insert(auditLog).values(audits);
  });

  process.stdout.write(
    `Applied: ${servicesToAdd.length} service(s) and ${doctorsToAdd.length} doctor(s) added, ` +
      `${specialtyUpdates.length} specialty list(s) extended, ` +
      `${whatsappUpdate ? 1 : 0} WhatsApp number set.\n` +
      "The live site caches these pages for up to an hour. To refresh them at once, " +
      "save the Victoria Island branch in the live site's admin; that clears the " +
      "services and doctors caches too.\n",
  );
}

/**
 * What actually went wrong underneath a failed query. Drizzle wraps the
 * driver's error, and a failed WebSocket to Neon is an ErrorEvent rather than
 * an `Error`, so its reason lives on `message` / `error`, which a plain
 * `instanceof Error` check, `String()` and `inspect` all drop.
 */
function describeCause(cause: unknown): string | undefined {
  if (cause === undefined || cause === null) return undefined;
  if (cause instanceof Error) {
    const code = (cause as { code?: unknown }).code;
    const inner = describeCause(cause.cause);
    return [cause.message, code ? `code ${String(code)}` : null, inner ? `caused by: ${inner}` : null]
      .filter(Boolean)
      .join("; ");
  }
  if (typeof cause === "object") {
    const event = cause as { type?: unknown; message?: unknown; error?: unknown };
    const parts = [
      typeof event.type === "string" ? `${event.type} event` : null,
      typeof event.message === "string" && event.message ? event.message : null,
      describeCause(event.error) ?? null,
    ].filter((part): part is string => Boolean(part));
    // An ErrorEvent's `message` usually repeats its `error.message`.
    const unique = [...new Set(parts)];
    if (unique.length > 0) return unique.join("; ");
  }
  return String(cause);
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        level: "error",
        event: "db.add_paelon_list.failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        // Not only `Error`s: a failed WebSocket to Neon surfaces as an
        // ErrorEvent, and dropping it leaves the bare "Failed query" above.
        cause: error instanceof Error ? describeCause(error.cause) : undefined,
      })}\n`,
    );
    await closePool();
    process.exit(1);
  });
