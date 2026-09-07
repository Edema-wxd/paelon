import { createInterface } from "node:readline/promises";
import process from "node:process";

import { eq } from "drizzle-orm";

import { hashPassword } from "@/lib/auth/password";
import { closePool, dbTx } from "@/lib/db/client";
import type { Role } from "@/lib/auth/policy";
import { userRoleEnum, users } from "@/lib/db/schema";

/**
 * Create or re-password an admin account from the command line.
 *
 *   npx tsx lib/db/create-admin.ts
 *
 * This exists because the panel has no self-registration and never should — an
 * open sign-up on a hospital back office is an open back office. The first
 * super admin has to come from somewhere outside the application, and that is
 * here.
 *
 * Re-running it for an existing email resets that account's password and clears
 * any lockout, which is also the password-reset path until a real one exists.
 *
 * The password is read from stdin rather than argv: a password on a command
 * line lands in shell history and in the process list, where every other user
 * on the machine can read it.
 */

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const name = (await rl.question("Full name: ")).trim();
    const email = (await rl.question("Email: ")).trim().toLowerCase();
    const roleInput = (
      await rl.question(
        `Role (${userRoleEnum.enumValues.join(" | ")}) [admin]: `,
      )
    ).trim();

    const role = (roleInput || "admin") as Role;

    if (!name || !email.includes("@")) {
      throw new Error("A name and a valid email are required.");
    }

    if (!userRoleEnum.enumValues.includes(role)) {
      throw new Error(
        `Role must be one of: ${userRoleEnum.enumValues.join(", ")}`,
      );
    }

    const password = await rl.question("Password (min 12 chars): ");

    // 12 is a floor, not a policy. The real protection is argon2id plus the
    // five-attempt lockout in lib/db/queries/users.ts.
    if (password.length < 12) {
      throw new Error("Password must be at least 12 characters.");
    }

    const passwordHash = await hashPassword(password);
    const db = dbTx();

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing[0]) {
      await db
        .update(users)
        .set({
          passwordHash,
          role,
          name,
          failedAttempts: 0,
          lockedUntil: null,
          deletedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing[0].id));

      process.stdout.write(`\nUpdated ${email} (${role}).\n`);
    } else {
      await db.insert(users).values({ name, email, passwordHash, role });
      process.stdout.write(`\nCreated ${email} (${role}).\n`);
    }

    process.stdout.write("Sign in at /admin/login\n");
  } finally {
    rl.close();
    await closePool();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Failed."}\n`,
  );
  process.exit(1);
});
