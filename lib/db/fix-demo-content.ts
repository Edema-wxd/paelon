import { and, eq } from "drizzle-orm";

import { closePool, dbTx } from "@/lib/db/client";
import {
  PREVIEW_FIXTURES,
  fixBranchCount,
  type PreviewFixture,
} from "@/lib/db/demo-content-plan";
import {
  auditLog,
  authors,
  blogPosts,
  contentSections,
  testimonials,
} from "@/lib/db/schema";

/**
 * Hide the placeholder content a client would see in a demo, in the database
 * the site actually reads (Preview and Production share it).
 *
 *  1. Unpublish the three `preview-*` layout fixtures: the placeholder
 *     testimonial on the homepage and the fixture post (with its author) on
 *     the homepage and /blog. `seed/` marks them unpublished too.
 *  2. Drop "three branches in Lagos" from the About page's Text block, untrue
 *     on the site since Victoria Island became the only listed branch.
 *
 * Nothing is deleted, and every change gets an `audit_log` row marked
 * `via: "cli"`, as an admin-panel save would. Dry run by default; `--apply`
 * writes in one transaction.
 *
 *   node --env-file=.env.local ./node_modules/.bin/tsx lib/db/fix-demo-content.ts
 *   node --env-file=.env.local ./node_modules/.bin/tsx lib/db/fix-demo-content.ts --apply
 */

const APPLY = process.argv.includes("--apply");
const SCRIPT = "lib/db/fix-demo-content.ts";

const TABLES = {
  author: authors,
  post: blogPosts,
  testimonial: testimonials,
} as const;

interface FixtureRow {
  fixture: PreviewFixture;
  id: string;
}

async function main(): Promise<void> {
  const db = dbTx();
  const lines: string[] = [];

  // ---- 1. preview fixtures ---------------------------------------------------
  const toUnpublish: FixtureRow[] = [];
  for (const fixture of PREVIEW_FIXTURES) {
    const table = TABLES[fixture.kind];
    const [row] = await db
      .select({ id: table.id, published: table.published, deletedAt: table.deletedAt })
      .from(table)
      .where(eq(table.slug, fixture.slug));

    if (!row) lines.push(`  ${fixture.slug}: not in the database, nothing to do`);
    else if (row.deletedAt) lines.push(`  ${fixture.slug}: already deleted, nothing to do`);
    else if (!row.published) lines.push(`  ${fixture.slug}: already unpublished`);
    else {
      lines.push(`  ${fixture.slug}: UNPUBLISH`);
      toUnpublish.push({ fixture, id: row.id });
    }
  }

  // ---- 2. About branch count -------------------------------------------------
  const sections = await db
    .select({ id: contentSections.id, data: contentSections.data })
    .from(contentSections)
    .where(and(eq(contentSections.page, "about"), eq(contentSections.kind, "text")));

  const toReword: { id: string; data: Record<string, unknown> }[] = [];
  let edited = 0;
  for (const section of sections) {
    const body = section.data.body;
    if (typeof body !== "string") continue;
    const fix = fixBranchCount(body);
    if (fix.kind === "reworded") toReword.push({ id: section.id, data: { ...section.data, body: fix.body } });
    if (fix.kind === "edited") edited += 1;
  }

  lines.push(
    toReword.length > 0
      ? `  About page: DROP "three branches in Lagos" from ${toReword.length} Text block(s)`
      : "  About page: original branch-count sentence not found, nothing to do",
  );
  if (edited > 0) {
    lines.push(
      `  About page: ${edited} block(s) mention three branches in edited wording; ` +
        "left alone, check them in /admin/about",
    );
  }

  process.stdout.write(`Planned changes\n${lines.join("\n")}\n\n`);

  if (!APPLY) {
    process.stdout.write("Dry run: nothing written. Re-run with --apply.\n");
    return;
  }
  if (toUnpublish.length === 0 && toReword.length === 0) {
    process.stdout.write("Nothing to change.\n");
    return;
  }

  await db.transaction(async (tx) => {
    for (const { fixture, id } of toUnpublish) {
      const table = TABLES[fixture.kind];
      await tx.update(table).set({ published: false, updatedAt: new Date() }).where(eq(table.id, id));
    }
    for (const { id, data } of toReword) {
      await tx.update(contentSections).set({ data }).where(eq(contentSections.id, id));
    }

    const audits = [
      ...toUnpublish.map(({ fixture, id }) => ({
        action: fixture.event,
        entityType: fixture.entityType,
        entityId: id,
        metadata: { via: "cli", script: SCRIPT, change: "unpublished preview fixture", slug: fixture.slug },
      })),
      ...(toReword.length > 0
        ? [
            {
              action: "about_content.layout_saved",
              entityType: "about_content",
              entityId: null,
              metadata: {
                via: "cli",
                script: SCRIPT,
                change: 'dropped "three branches in Lagos" from the founding story',
                sectionIds: toReword.map((s) => s.id),
              },
            },
          ]
        : []),
    ];
    await tx.insert(auditLog).values(audits);
  });

  process.stdout.write(
    `Applied: ${toUnpublish.length} fixture(s) unpublished, ${toReword.length} About block(s) reworded.\n` +
      "The live site caches these pages for up to an hour. To refresh them at once, " +
      "save the testimonial, the blog post and the About page layout in the live " +
      "site's admin.\n",
  );
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        level: "error",
        event: "db.fix_demo_content.failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        cause:
          error instanceof Error && error.cause instanceof Error
            ? error.cause.message
            : undefined,
      })}\n`,
    );
    await closePool();
    process.exit(1);
  });
