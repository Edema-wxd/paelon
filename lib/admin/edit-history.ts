/**
 * Undo and redo for the Markdown editor, as plain data.
 *
 * The browser's own undo stack cannot be trusted with a controlled textarea:
 * any value React sets, rather than the user typing it, either breaks the
 * stack or is missing from it, and the toolbar's fallback path sets values.
 * So the editor keeps its own history and both the Undo button and
 * ⌘/Ctrl-Z read from it, and the two can never disagree.
 *
 * Each entry is the whole body before a change. Bodies are a few thousand
 * words at most, and a capped list of strings is simpler to get right than a
 * list of diffs.
 */

export type ChangeKind = "typing" | "command";

export interface EditHistory {
  readonly past: readonly string[];
  readonly future: readonly string[];
  readonly lastKind: ChangeKind | null;
  readonly lastAt: number;
}

export const EMPTY_HISTORY: EditHistory = { past: [], future: [], lastKind: null, lastAt: 0 };

/** Steps kept. Older ones fall off the bottom. */
export const HISTORY_LIMIT = 200;

/**
 * Keystrokes closer together than this undo as one step, the way a word
 * processor undoes a burst of typing rather than a letter at a time.
 */
export const TYPING_GROUP_MS = 1000;

/**
 * Record that `before` was replaced by an edit of `kind` at `now`.
 *
 * A toolbar command is always its own step, so Undo takes back exactly the
 * bold or the heading that was applied. Any new edit clears redo, as everywhere.
 */
export function recordChange(
  history: EditHistory,
  before: string,
  kind: ChangeKind,
  now: number,
): EditHistory {
  const joinsTyping =
    kind === "typing" &&
    history.lastKind === "typing" &&
    now - history.lastAt < TYPING_GROUP_MS &&
    history.past.length > 0;
  // The same text twice in a row would make one press of Undo do nothing.
  const repeat = history.past[history.past.length - 1] === before;

  return {
    past: joinsTyping || repeat ? history.past : [...history.past, before].slice(-HISTORY_LIMIT),
    future: [],
    lastKind: kind,
    lastAt: now,
  };
}

/** The body one step back, and the history after taking that step. */
export function undoChange(
  history: EditHistory,
  current: string,
): { value: string; history: EditHistory } | null {
  const value = history.past[history.past.length - 1];
  if (value === undefined) return null;
  return {
    value,
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, current],
      // The next keystroke starts a new step instead of joining the one undone.
      lastKind: null,
      lastAt: 0,
    },
  };
}

/** The body one step forward again, after an undo. */
export function redoChange(
  history: EditHistory,
  current: string,
): { value: string; history: EditHistory } | null {
  const value = history.future[history.future.length - 1];
  if (value === undefined) return null;
  return {
    value,
    history: {
      past: [...history.past, current],
      future: history.future.slice(0, -1),
      lastKind: null,
      lastAt: 0,
    },
  };
}

/**
 * Where the caret belongs after jumping from `from` to `to`: just after the
 * part that changed, so the editor sees what Undo or Redo did.
 */
export function caretAfterJump(from: string, to: string): number {
  let prefix = 0;
  while (prefix < from.length && prefix < to.length && from[prefix] === to[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < from.length - prefix &&
    suffix < to.length - prefix &&
    from[from.length - 1 - suffix] === to[to.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return to.length - suffix;
}
