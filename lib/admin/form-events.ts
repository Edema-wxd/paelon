/**
 * The event a controlled field hands to react-hook-form's `onBlur`.
 *
 * A Markdown field is controlled by the form (`setValue` on every change), so
 * there is no DOM input behind its registration for react-hook-form to read.
 * Its handler then takes the value from `event.target.value` — and it treats
 * the call as a blur only when `event.type` is `"blur"`.
 *
 * Passing `{ target: { name } }` alone, as the form once did, wrote
 * `undefined` over the field's value every time the editor left the textarea.
 * Clicking Save leaves the textarea, so every save of an edited Markdown field
 * failed client-side as "Invalid input" and nothing was submitted.
 */
export function controlledBlurEvent(name: string, value: string) {
  return { type: "blur", target: { name, value } } as const;
}
