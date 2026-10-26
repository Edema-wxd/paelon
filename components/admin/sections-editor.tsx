"use client";

import {
  ArrowDown,
  ArrowUp,
  Images,
  Image as ImageIcon,
  Loader2,
  MousePointerClick,
  Plus,
  Trash2,
  Type,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition } from "react";

import { GalleryField } from "@/components/admin/gallery-field";
import { MarkdownField } from "@/components/admin/markdown-field";
import { MarkdownMediaPicker, type PickableMedia } from "@/components/admin/markdown-media-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SectionsState } from "@/lib/admin/sections-actions";
import { cn } from "@/lib/utils";
import { sectionsSchema, type Section, type SectionKind } from "@/lib/validation/sections";

/**
 * The page-layout editor: a page's blocks, added, edited, reordered and
 * removed, then saved together (migration 0008, `content_sections`).
 *
 * Reordering is Move up / Move down buttons rather than drag and drop: they
 * work from the keyboard and with a screen reader, need no library (spec §2
 * approves none for it), and are unambiguous on a phone. Focus follows the
 * block that moved, and the new position is announced.
 *
 * The layout is validated with the same `sectionsSchema` the save action
 * parses, before anything is sent; errors are shown on the block they belong
 * to and focus moves to the first. The server's parse is still the truth.
 *
 * This editor needs JavaScript — reordering and the media picker are
 * interactive by nature — and says so in a `<noscript>`. The page's other
 * fields, in the form above, still work without it.
 */

type Draft =
  | { key: string; kind: "text"; heading: string; body: string }
  | { key: string; kind: "image"; mediaId: string | null; caption: string }
  | { key: string; kind: "gallery"; heading: string; media: readonly PickableMedia[] }
  | { key: string; kind: "cta"; heading: string; text: string; buttonLabel: string; href: string };

const KIND: Record<SectionKind, { label: string; icon: LucideIcon; hint: string }> = {
  text: { label: "Text", icon: Type, hint: "Paragraphs, subheadings, lists and images between paragraphs." },
  image: { label: "Image", icon: ImageIcon, hint: "One picture from the media library, with a caption." },
  gallery: { label: "Gallery", icon: Images, hint: "Several pictures in a grid." },
  cta: { label: "Call to action", icon: MousePointerClick, hint: "A highlighted panel with a button." },
};

/*
 * Block keys double as element-id prefixes (labels, aria-controls), so they
 * must be identical on the server and in the browser: built from `useId()` and
 * the block's position for the saved blocks, and from a per-editor counter for
 * blocks added after hydration. `Date.now()` here was a hydration mismatch.
 */
function blank(kind: SectionKind, key: string): Draft {
  switch (kind) {
    case "text":
      return { key, kind, heading: "", body: "" };
    case "image":
      return { key, kind, mediaId: null, caption: "" };
    case "gallery":
      return { key, kind, heading: "", media: [] };
    case "cta":
      return { key, kind, heading: "", text: "", buttonLabel: "", href: "" };
  }
}

function fromSection(section: Section, media: ReadonlyMap<string, PickableMedia>, key: string): Draft {
  switch (section.kind) {
    case "text":
      return { key, kind: "text", heading: section.data.heading ?? "", body: section.data.body };
    case "image":
      return { key, kind: "image", mediaId: section.data.mediaId, caption: section.data.caption ?? "" };
    case "gallery":
      return {
        key,
        kind: "gallery",
        heading: section.data.heading,
        // An id the library no longer has is dropped here, so saving cleans it.
        media: section.data.mediaIds.flatMap((id) => {
          const asset = media.get(id);
          return asset ? [asset] : [];
        }),
      };
    case "cta":
      return {
        key,
        kind: "cta",
        heading: section.data.heading,
        text: section.data.text ?? "",
        buttonLabel: section.data.buttonLabel,
        href: section.data.href,
      };
  }
}

/** The schema's input shape for one draft. */
function toInput(draft: Draft) {
  switch (draft.kind) {
    case "text":
      return { kind: draft.kind, data: { heading: draft.heading, body: draft.body } };
    case "image":
      return { kind: draft.kind, data: { mediaId: draft.mediaId ?? "", caption: draft.caption } };
    case "gallery":
      return { kind: draft.kind, data: { heading: draft.heading, mediaIds: draft.media.map((asset) => asset.id) } };
    case "cta":
      return {
        kind: draft.kind,
        data: { heading: draft.heading, text: draft.text, buttonLabel: draft.buttonLabel, href: draft.href },
      };
  }
}

export function SectionsEditor({
  initialSections,
  media,
  save,
  target,
  pageName,
}: {
  initialSections: readonly Section[];
  /** Assets the saved blocks reference, so thumbnails and previews render. */
  media: readonly PickableMedia[];
  /** The server action for this page type. */
  save: (prev: SectionsState, formData: FormData) => Promise<SectionsState>;
  /** Hidden fields the action needs besides the layout, e.g. `serviceId`. */
  target: Record<string, string>;
  /** "the service page", "the About page" — used in messages. */
  pageName: string;
}) {
  const router = useRouter();
  const headingId = useId();
  // Element-id-safe prefix (useId returns colons on some React versions).
  const keyPrefix = `sec${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const added = useRef(0);
  const [known, setKnown] = useState<ReadonlyMap<string, PickableMedia>>(
    () => new Map(media.map((asset) => [asset.id, asset])),
  );
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    initialSections.map((section, index) => fromSection(section, known, `${keyPrefix}-s${index}`)),
  );
  const [saved, setSaved] = useState(() => JSON.stringify(drafts.map(toInput)));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [isPending, startTransition] = useTransition();
  const blockRefs = useRef(new Map<string, HTMLLIElement>());

  const current = useMemo(() => JSON.stringify(drafts.map(toInput)), [drafts]);
  const dirty = current !== saved;
  const figureImages = useMemo(() => [...known.values()], [known]);

  function remember(asset: PickableMedia) {
    setKnown((map) => new Map(map).set(asset.id, asset));
  }

  function update(key: string, patch: Partial<Draft>) {
    setDrafts((list) => list.map((draft) => (draft.key === key ? ({ ...draft, ...patch } as Draft) : draft)));
    setStatus(null);
  }

  function focusBlock(key: string, selector: string) {
    requestAnimationFrame(() => {
      blockRefs.current.get(key)?.querySelector<HTMLElement>(selector)?.focus();
    });
  }

  function move(index: number, by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= drafts.length) return;
    const moving = drafts[index];
    if (!moving) return;
    setDrafts((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      if (item) next.splice(target, 0, item);
      return next;
    });
    setStatus(null);
    setAnnouncement(`${KIND[moving.kind].label} block moved to position ${target + 1} of ${drafts.length}.`);
    // Keep focus on the same button of the block that moved. At the end it
    // was moving towards, that button is now disabled and cannot hold focus,
    // so focus the other direction's — still on the same block.
    const reachedEdge = by === -1 ? target === 0 : target === drafts.length - 1;
    const direction = (by === -1) !== reachedEdge ? "up" : "down";
    focusBlock(moving.key, `[data-move="${direction}"]`);
  }

  function remove(index: number) {
    const removed = drafts[index];
    if (!removed) return;
    setDrafts((list) => list.filter((_, at) => at !== index));
    setStatus(null);
    setAnnouncement(`${KIND[removed.kind].label} block removed. Save to apply it.`);
    const neighbour = drafts[index + 1] ?? drafts[index - 1];
    if (neighbour) focusBlock(neighbour.key, "[data-move]");
  }

  function add(kind: SectionKind) {
    added.current += 1;
    const draft = blank(kind, `${keyPrefix}-n${added.current}`);
    setDrafts((list) => [...list, draft]);
    setStatus(null);
    setAnnouncement(`${KIND[kind].label} block added at position ${drafts.length + 1}.`);
    focusBlock(draft.key, "input, textarea, button[data-pick]");
    requestAnimationFrame(() =>
      blockRefs.current.get(draft.key)?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
  }

  function onSave() {
    const parsed = sectionsSchema.safeParse(drafts.map(toInput));
    if (!parsed.success) {
      const byBlock: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const index = typeof issue.path[0] === "number" ? issue.path[0] : -1;
        const key = drafts[index]?.key ?? "layout";
        (byBlock[key] ??= []).push(issue.message);
      }
      setErrors(byBlock);
      setStatus({ ok: false, message: "Some blocks need attention before the layout can be saved." });
      const first = drafts.find((draft) => byBlock[draft.key]);
      if (first) focusBlock(first.key, "input, textarea, button[data-pick]");
      return;
    }

    setErrors({});
    const formData = new FormData();
    for (const [name, value] of Object.entries(target)) formData.set(name, value);
    formData.set("sections", JSON.stringify(drafts.map(toInput)));

    startTransition(async () => {
      const result = await save(null, formData);
      if (result?.ok) {
        setSaved(current);
        setStatus({ ok: true, message: result.data.message });
        router.refresh();
      } else {
        setStatus({ ok: false, message: result?.error ?? "The layout could not be saved. Try again." });
      }
    });
  }

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-border bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={headingId} className="text-base font-semibold text-primary">
            Page layout
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The blocks that make up {pageName}, top to bottom. Add, edit, move or remove them, then
            save the layout. It saves separately from the fields above.
          </p>
        </div>
      </div>

      <noscript>
        <p className="mt-4 rounded-md bg-secondary px-3 py-2 text-sm text-primary">
          Editing the page layout needs JavaScript. The fields above can still be saved.
        </p>
      </noscript>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {drafts.length === 0 ? (
        <p className="mt-5 rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No blocks yet. Add the first one below.
        </p>
      ) : (
        <ol className="mt-5 space-y-4">
          {drafts.map((draft, index) => {
            const { label, icon: Icon } = KIND[draft.kind];
            const blockErrors = errors[draft.key];
            const titleId = `${draft.key}-title`;
            const summary =
              draft.kind === "text" || draft.kind === "gallery" || draft.kind === "cta"
                ? draft.heading.trim()
                : draft.mediaId
                  ? (known.get(draft.mediaId)?.alt ?? "")
                  : "";
            return (
              <li
                key={draft.key}
                ref={(node) => {
                  if (node) blockRefs.current.set(draft.key, node);
                  else blockRefs.current.delete(draft.key);
                }}
                aria-labelledby={titleId}
                className={cn(
                  "rounded-lg border bg-background",
                  blockErrors ? "border-destructive" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                  <Icon aria-hidden className="size-4 text-muted-foreground" />
                  <h3 id={titleId} className="min-w-0 flex-1 truncate text-sm font-medium text-primary">
                    {index + 1}. {label}
                    {summary ? <span className="font-normal text-muted-foreground"> — {summary}</span> : null}
                  </h3>
                  <div className="flex items-center gap-0.5">
                    <IconButton
                      label={`Move block ${index + 1} up`}
                      data-move="up"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp aria-hidden className="size-4" />
                    </IconButton>
                    <IconButton
                      label={`Move block ${index + 1} down`}
                      data-move="down"
                      disabled={index === drafts.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown aria-hidden className="size-4" />
                    </IconButton>
                    <IconButton label={`Remove block ${index + 1}`} onClick={() => remove(index)} danger>
                      <Trash2 aria-hidden className="size-4" />
                    </IconButton>
                  </div>
                </div>

                <div className="space-y-4 p-4">
                  <BlockFields
                    draft={draft}
                    known={known}
                    figureImages={figureImages}
                    onChange={(patch) => update(draft.key, patch)}
                    onPicked={remember}
                  />
                  {blockErrors ? (
                    <ul role="alert" className="space-y-1 text-sm text-destructive">
                      {blockErrors.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-5">
        <p className="text-xs font-medium text-muted-foreground">Add a block</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(KIND) as SectionKind[]).map((kind) => {
            const { label, icon: Icon, hint } = KIND[kind];
            return (
              <Button key={kind} type="button" variant="outline" size="sm" onClick={() => add(kind)} title={hint}>
                <Plus aria-hidden />
                <Icon aria-hidden />
                {label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <Button type="button" onClick={onSave} disabled={isPending || !dirty}>
          {isPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
          {isPending ? "Saving layout…" : "Save page layout"}
        </Button>
        <p aria-live="polite" className="text-sm">
          {status ? (
            <span className={status.ok ? "text-primary" : "text-destructive"}>{status.message}</span>
          ) : dirty ? (
            <span className="text-amber-700">Unsaved layout changes.</span>
          ) : (
            <span className="text-muted-foreground">All changes saved.</span>
          )}
        </p>
      </div>
    </section>
  );
}

function IconButton({
  label,
  danger = false,
  children,
  ...props
}: {
  label: string;
  danger?: boolean;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.94] disabled:pointer-events-none disabled:opacity-35",
        danger ? "hover:bg-red-50 hover:text-destructive" : "hover:bg-surface hover:text-primary",
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function BlockFields({
  draft,
  known,
  figureImages,
  onChange,
  onPicked,
}: {
  draft: Draft;
  known: ReadonlyMap<string, PickableMedia>;
  figureImages: readonly PickableMedia[];
  onChange: (patch: Partial<Draft>) => void;
  onPicked: (asset: PickableMedia) => void;
}) {
  const id = (name: string) => `${draft.key}-${name}`;

  switch (draft.kind) {
    case "text":
      return (
        <>
          <Field
            id={id("heading")}
            label="Section heading (optional)"
            hint="With a heading, this block is its own section of the page, and headings inside it become subsections."
          >
            <Input
              id={id("heading")}
              value={draft.heading}
              maxLength={120}
              onChange={(event) => onChange({ heading: event.target.value })}
            />
          </Field>
          <div className="space-y-1">
            <label htmlFor={id("body")} className="block text-sm font-medium text-foreground">
              Text
            </label>
            <MarkdownField
              id={id("body")}
              name={id("body")}
              rows={8}
              figures
              headingOffset={draft.heading.trim() ? 1 : 0}
              figureImages={figureImages}
              value={draft.body}
              onChange={(next) => onChange({ body: next })}
            />
          </div>
        </>
      );

    case "image": {
      const asset = draft.mediaId ? known.get(draft.mediaId) : undefined;
      return (
        <>
          <div className="flex flex-wrap items-center gap-4">
            {asset ? (
              // eslint-disable-next-line @next/next/no-img-element -- an admin thumbnail of a CDN asset; next/image adds nothing here
              <img src={asset.url} alt={asset.alt ?? ""} className="size-24 rounded-md border border-border object-cover" />
            ) : (
              <div className="flex size-24 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                No image
              </div>
            )}
            <div className="space-y-1">
              <MarkdownMediaPicker
                onPick={(picked) => {
                  onPicked(picked);
                  onChange({ mediaId: picked.id });
                }}
                label={asset ? "Choose a different image" : "Choose an image"}
                title="Choose an image"
              />
              <p className="text-xs text-muted-foreground">
                Alt text comes from the media library
                {asset
                  ? asset.alt === null
                    ? ": not written yet — add it there before publishing."
                    : `: “${asset.alt || "decorative"}”`
                  : "."}
              </p>
            </div>
          </div>
          <Field id={id("caption")} label="Caption (optional)">
            <Input
              id={id("caption")}
              value={draft.caption}
              maxLength={300}
              onChange={(event) => onChange({ caption: event.target.value })}
            />
          </Field>
        </>
      );
    }

    case "gallery":
      return (
        <>
          <Field id={id("heading")} label="Gallery heading" hint="Required — it names the gallery for everyone, including screen-reader users.">
            <Input
              id={id("heading")}
              value={draft.heading}
              maxLength={120}
              onChange={(event) => onChange({ heading: event.target.value })}
            />
          </Field>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Images</legend>
            <GalleryField
              name={id("media")}
              label={draft.heading || "Gallery"}
              value={draft.media}
              onChange={(next) => {
                next.forEach(onPicked);
                onChange({ media: next });
              }}
            />
          </fieldset>
        </>
      );

    case "cta":
      return (
        <>
          <Field id={id("heading")} label="Heading">
            <Input
              id={id("heading")}
              value={draft.heading}
              maxLength={120}
              onChange={(event) => onChange({ heading: event.target.value })}
            />
          </Field>
          <Field id={id("text")} label="Text (optional)">
            <Textarea
              id={id("text")}
              rows={2}
              value={draft.text}
              maxLength={300}
              onChange={(event) => onChange({ text: event.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={id("label")} label="Button label">
              <Input
                id={id("label")}
                value={draft.buttonLabel}
                maxLength={60}
                onChange={(event) => onChange({ buttonLabel: event.target.value })}
              />
            </Field>
            <Field
              id={id("href")}
              label="Button link"
              hint="A page on this site (e.g. /book), tel:, mailto: or an https:// address."
            >
              <Input
                id={id("href")}
                value={draft.href}
                maxLength={500}
                spellCheck={false}
                onChange={(event) => onChange({ href: event.target.value })}
              />
            </Field>
          </div>
        </>
      );
  }
}
