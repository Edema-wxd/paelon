import Link from "next/link";

/**
 * Shown when a signed-in account reaches a page its role does not cover.
 *
 * A permission problem is not an error, and routing it through `error.tsx`
 * would tell someone the page failed to load when it loaded fine and the answer
 * was no. It also names the role they have, so the next question — "who do I
 * ask" — has an obvious answer.
 *
 * Pages use this instead of letting `requireCan` throw. `requireCan` still
 * throws in server actions, where a `ForbiddenError` is exactly right.
 */
export function NotPermitted({ roleLabel }: { roleLabel: string }) {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-primary">Not available to you</h1>
      <p className="mt-4 text-base text-foreground/80">
        Your account is a <strong className="text-primary">{roleLabel}</strong>,
        which does not include this area. Nothing is wrong — ask an admin if
        you need access.
      </p>
      <p className="mt-6 text-sm">
        <Link
          href="/admin"
          className="text-accent underline underline-offset-4 hover:no-underline"
        >
          Back to the overview
        </Link>
      </p>
    </div>
  );
}
