/**
 * What the Save button says, so it names what pressing it will do.
 *
 * Whether a row goes live is decided by the Published box, two controls away
 * from a button that only ever said "Save changes" or "Create post". An editor
 * writing a draft could not tell from the button that it would stay off the
 * site, nor see that ticking the box meant this press would publish.
 */
export interface SaveLabelInput {
  /** No row yet: the button creates one. */
  isNew: boolean;
  /** "post", as the form names the row in a sentence. */
  singular: string;
  /** False for a role that may not publish, or a type with no Published box. */
  canPublish: boolean;
  /** The Published box as it is now. */
  publishedNow: boolean;
  /** Whether the saved row is published. */
  publishedSaved: boolean;
}

export function saveButtonLabel({
  isNew,
  singular,
  canPublish,
  publishedNow,
  publishedSaved,
}: SaveLabelInput): string {
  if (!canPublish) return isNew ? `Create ${singular}` : "Save changes";
  if (!publishedNow) return publishedSaved ? "Save and unpublish" : "Save draft";
  if (publishedSaved) return "Save changes";
  return `Publish ${singular}`;
}

/** The line under the button, saying where the result will be visible. */
export function saveButtonHint({
  isNew,
  canPublish,
  publishedNow,
}: Pick<SaveLabelInput, "isNew" | "canPublish" | "publishedNow">): string | null {
  if (!canPublish || publishedNow) return null;
  return isNew
    ? "A draft is not on the site. Once it is saved, Preview on site shows it as readers will see it."
    : "A draft is not on the site. Preview on site shows the last saved version, so save first.";
}
