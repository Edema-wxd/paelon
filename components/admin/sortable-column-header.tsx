import Link from "next/link";

/**
 * One sortable `<th>` for an admin list table: a link (so sorting works
 * without JavaScript, and each ordering has its own address) plus an arrow
 * that repeats — never replaces — the `aria-sort` state.
 *
 * Extracted from `bookings-table.tsx`'s column-heading block.
 */
export function SortableColumnHeader({
  label,
  href,
  ariaSort,
}: {
  label: string;
  href: string;
  ariaSort: "ascending" | "descending" | "none";
}) {
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className="p-3 font-medium text-primary"
    >
      <Link href={href} className="underline-offset-4 hover:underline">
        {label}
        {ariaSort === "ascending" ? " ↑" : ariaSort === "descending" ? " ↓" : ""}
      </Link>
    </th>
  );
}
