import { cn } from "@/lib/utils";

interface PendingNoteProps {
  /** What is not known, and what the reader should do instead. */
  children: React.ReactNode;
  /** An action that still works despite the gap, usually a phone link. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * A "we have not confirmed this yet" note, styled as a card pinned at the
 * front desk.
 *
 * CLAUDE.md forbids inventing hospital content, and a hospital is the wrong
 * place to soften that with plausible-looking filler: wrong opening hours send
 * someone to a locked gate. So the templates state the gap plainly and hand
 * over an action that does work. This component gives that state one
 * consistent, quiet treatment instead of a different apology each time.
 *
 * It is a launch-blocker marker as much as a UI element. Every instance on a
 * rendered page is a field waiting on Francis — see seed/README.md.
 */
export function PendingNote({ children, action, className }: PendingNoteProps) {
  return (
    <div
      className={cn(
        "rounded-r-md border-l-2 border-accent bg-secondary px-4 py-3",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">{children}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
