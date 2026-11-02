/**
 * Validation messages an editor can act on.
 *
 * Every rule in the admin schemas carries its own sentence. What reaches the
 * form without one is Zod's default — "Invalid input", or "Invalid input:
 * expected string, received undefined" — and that only ever means the form
 * could not read a value, never that the editor wrote something wrong. Shown
 * as-is, it reads as a verdict on the text and gives nothing to do about it.
 */

const ZOD_DEFAULT = /^Invalid (input|option)\b/;

/** The message an unreadable value gets instead of Zod's default. */
export function unreadableMessage(label: string): string {
  return `${label} could not be read by the form, so nothing was saved. This is a fault in the page, not in what you wrote: copy your text somewhere safe, reload the page, paste it back and save again. If it happens again, tell the developer.`;
}

/** `messages` with any Zod default replaced, and duplicates dropped. */
export function readableMessages(label: string, messages: readonly string[]): string[] {
  return [
    ...new Set(messages.map((message) => (ZOD_DEFAULT.test(message) ? unreadableMessage(label) : message))),
  ];
}

/**
 * One line beside the Save button naming what stopped the save.
 *
 * The errors themselves sit on their fields, which on a long post can be
 * a screen or more away from the button that was just pressed.
 */
export function unsavedSummary(labels: readonly string[]): string {
  const unique = [...new Set(labels)];
  if (unique.length === 0) return "Not saved. Check the highlighted fields.";
  const named =
    unique.length === 1
      ? unique[0]
      : `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
  return `Not saved. Fix ${unique.length === 1 ? "this field" : "these fields"} first: ${named}.`;
}
