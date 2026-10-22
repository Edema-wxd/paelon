"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useForm, type FieldValues, type Resolver } from "react-hook-form";

import { HoursField } from "@/components/admin/hours-field";
import { GalleryField } from "@/components/admin/gallery-field";
import { MarkdownField } from "@/components/admin/markdown-field";
import type { PickableMedia } from "@/components/admin/markdown-media-picker";
import {
  MultiSelectField,
  type SelectOption,
} from "@/components/admin/multi-select-field";
import { TagInput } from "@/components/admin/tag-input";
import {
  ResourceImageField,
  type ImageFieldValue,
} from "@/components/admin/resource-image-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ResourceState } from "@/lib/admin/resource-actions";
import { RESOURCE_ACTIONS } from "@/lib/admin/resource-action-map";
import { slugify, type Field } from "@/lib/admin/resource-config";
import { RESOURCES, type ResourceName } from "@/lib/admin/resources";

/**
 * The create / edit form for every content type the CRUD kit drives (spec §8).
 *
 * ## How it is wired
 *
 * The config arrives as a *name*, not an object: a Zod schema and a set of
 * functions do not survive the RSC boundary, so the page passes `resource` and
 * this component looks the config up in the client-safe registry.
 *
 * Validation runs twice against the same schema — react-hook-form with
 * `zodResolver` here, `adminAction` on the server (CLAUDE.md: client for UX,
 * server for truth). One schema, so the two cannot drift, and the messages an
 * editor sees are identical either way.
 *
 * Submission goes through the server action in `RESOURCE_ACTIONS`. The `<form>`
 * keeps `action={…}` so it still posts with JavaScript off; with JavaScript the
 * submit handler validates first and then hands the same `FormData` to the
 * action, so a typo costs no round trip.
 *
 * Server-side field errors — the slug uniqueness check above all — come back in
 * `state.fields` and are merged into the same error display as the client's.
 * A failed submission keeps every value: nothing is re-fetched or reset.
 *
 * Accessibility: every control has a real `<label>` (never a placeholder), each
 * error is `role="alert"` and wired to its input with `aria-describedby`, and
 * the form-level result is `aria-live` so it is announced without moving focus.
 */

export interface ResourceFormProps {
  resource: ResourceName;
  /** Present when editing. Absent for a new row. */
  id?: string;
  /**
   * Row values keyed by field name.
   *
   * Strings for the ordinary controls, arrays for `tags` and `multiselect`,
   * and a nested `{ day: { open, close, closed } }` object for `hours` — the
   * same shapes `resourceInput` reconstructs on the server, so both sides
   * validate the same thing.
   */
  defaults: Record<string, unknown>;
  /** Existing image values, keyed by the image field's name. */
  images?: Record<string, ImageFieldValue>;
  /**
   * Picker options for each `multiselect` field, loaded by the editor screen.
   * They are rows and they change, so they are not in the config.
   */
  options?: Record<string, readonly SelectOption[]>;
  /**
   * Assets the row's stored body already references, resolved by the editor
   * screen so the preview can render them. Not the library: the picker queries
   * that itself.
   */
  media?: readonly PickableMedia[];
  /** Each gallery field's current assets, in order, keyed by field name. */
  galleryValues?: Record<string, readonly PickableMedia[]>;
  /** Hides the published toggle for a role that may not publish. */
  canPublish: boolean;
}

export function ResourceForm({
  resource,
  id,
  defaults,
  images = {},
  options = {},
  media,
  galleryValues = {},
  canPublish,
}: ResourceFormProps) {
  const config = RESOURCES[resource];
  const actions = RESOURCE_ACTIONS[resource];
  const action = id ? actions.update : actions.create;

  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [state, formAction] = useActionState<ResourceState, FormData>(
    async (prev, formData) => action(prev, formData),
    null,
  );

  const form = useForm<FieldValues>({
    // The same schema the server parses. The cast is because the registry is
    // heterogeneous by design: a lookup by name cannot carry each resource's
    // own field types, so the form works in `FieldValues` and the schema is the
    // thing that knows the real shape.
    resolver: zodResolver(config.schema) as unknown as Resolver<FieldValues>,
    defaultValues: defaults as FieldValues,
    mode: "onBlur",
  });

  const [markdown, setMarkdown] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      config.fields
        .filter((field) => field.type === "markdown")
        .map((field) => [field.name, String(defaults[field.name] ?? "")]),
    ),
  );

  const [imageValues, setImageValues] = useState<Record<string, ImageFieldValue>>(
    () =>
      Object.fromEntries(
        config.fields
          .filter((field) => field.type === "image")
          .map((field) => [
            field.name,
            images[field.name] ?? {
              mediaId: null,
              url: null,
              alt: "",
              decorative: false,
            },
          ]),
      ),
  );

  /**
   * Gallery selections, in the editor's order.
   *
   * Held as whole assets rather than ids, because the control renders a
   * thumbnail and an alt-text warning for each. `react-hook-form` holds the
   * matching id list so the resolver validates exactly what will submit.
   */
  const [galleries, setGalleries] = useState<Record<string, readonly PickableMedia[]>>(
    () =>
      Object.fromEntries(
        config.fields
          .filter((field) => field.type === "gallery")
          .map((field) => [field.name, galleryValues[field.name] ?? []]),
      ),
  );

  /**
   * Tag and multi-select values, which are arrays rather than control values.
   * `react-hook-form` holds the same arrays — `setValue` on every change — so
   * the resolver validates exactly what the hidden inputs and the `<select>`
   * will submit.
   */
  const [listValues, setListValues] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      config.fields
        .filter((field) => field.type === "tags" || field.type === "multiselect")
        .map((field) => {
          const value = defaults[field.name];
          return [field.name, Array.isArray(value) ? value.map(String) : []];
        }),
    ),
  );

  /**
   * True once the editor types in the slug box, after which generation stops.
   *
   * An existing row starts touched: its slug is already a live URL, and
   * quietly rewriting it because someone fixed a typo in the title would break
   * every inbound link to it.
   */
  const [slugTouched, setSlugTouched] = useState(id !== undefined);

  const slugFieldName = config.fields.find((field) => field.type === "slug")?.name;

  // On a successful create, go to the row that was just made. On an update the
  // page stays put — the message is the feedback, and re-rendering an edit form
  // someone is still working in would be worse than useful.
  useEffect(() => {
    if (state?.ok && id === undefined) {
      router.push(`/admin/${resource}/${state.data.id}`);
    }
  }, [state, id, resource, router]);

  /**
   * Client errors and server field errors, in one place.
   *
   * The client half has to be walked rather than read. `hours`, `whoItsFor` and
   * the multi-selects validate as nested values, so react-hook-form files their
   * errors at `hours.sun.open` or `whoItsFor.0` — `errors.hours` itself has no
   * `message`. Reading only the top level made those errors invisible while
   * `onSubmit` still refused to submit, which is a Save button that does
   * nothing and says nothing.
   *
   * The server half needs no walk: `z.flattenError` keys `fieldErrors` by the
   * first path segment, so a nested issue already arrives under `hours`.
   */
  function errorsFor(name: string): string[] | undefined {
    const server = state && !state.ok ? state.fields[name] : undefined;
    if (server?.length) return server;
    const messages = collectMessages(form.formState.errors[name]);
    return messages.length > 0 ? messages : undefined;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const valid = await form.trigger();
    if (!valid) {
      // Focus the first invalid control, or the message is announced somewhere
      // off screen and nothing tells the editor where to go. The leaf path
      // first — `hours.sun.open` is a real input, `hours` is not — then the
      // field name, for a control that renders under a name of its own.
      const [leaf, root] = firstErrorPath(form.formState.errors);
      const selectors = [
        leaf ? `[name="${leaf}"]` : null,
        root ? `[name="${root}"]` : null,
        root ? `#field-${CSS.escape(root)}` : null,
      ].filter((selector): selector is string => selector !== null);

      for (const selector of selectors) {
        const target = formRef.current?.querySelector<HTMLElement>(selector);
        if (target) {
          target.focus();
          break;
        }
      }
      return;
    }

    startTransition(() => formAction(formData));
  }

  const visibleFields = config.fields.filter(
    (field) => canPublish || field.name !== "published",
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={onSubmit}
      noValidate
      className="max-w-3xl space-y-6"
    >
      {id ? <input type="hidden" name="id" value={id} /> : null}

      {/* Draft state has to be submitted even when the toggle is hidden, or
          saving as a contributor would silently publish or unpublish the row. */}
      {canPublish ? null : (
        <input
          type="hidden"
          name="published"
          value={defaults.published === true ? "on" : ""}
        />
      )}

      <div aria-live="polite" className="empty:hidden">
        {state?.ok ? (
          <p className="rounded-md bg-secondary px-3 py-2 text-sm text-primary">
            {state.data.message}
          </p>
        ) : null}
        {state && !state.ok ? (
          <p
            role="alert"
            className="rounded-md bg-secondary px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </p>
        ) : null}
      </div>

      {visibleFields.map((field) => (
        <FieldRow
          key={field.name}
          field={field}
          errors={errorsFor(field.name)}
          altErrors={field.type === "image" ? errorsFor(field.altName) : undefined}
        >
          {renderControl(field)}
        </FieldRow>
      ))}

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : id ? "Save changes" : `Create ${config.singular}`}
        </Button>
        <Link
          href={`/admin/${resource}`}
          className="text-sm text-accent underline underline-offset-4 hover:no-underline"
        >
          Cancel
        </Link>
      </div>
    </form>
  );

  function renderControl(field: Field): React.ReactNode {
    const inputId = `field-${field.name}`;
    const invalid = (errorsFor(field.name)?.length ?? 0) > 0;
    const describedBy =
      [field.hint ? `${inputId}-hint` : null, invalid ? `${inputId}-error` : null]
        .filter(Boolean)
        .join(" ") || undefined;

    switch (field.type) {
      case "text":
      case "url": {
        const registration = form.register(field.name);
        // Does a slug field generate itself from this one?
        const generates = config.fields.some(
          (candidate) => candidate.type === "slug" && candidate.from === field.name,
        );

        return (
          <Input
            {...registration}
            id={inputId}
            type={field.type === "url" ? "url" : "text"}
            maxLength={field.type === "text" ? field.maxLength : undefined}
            required={field.required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => {
              void registration.onChange(event);
              // Keep the slug in step with the title until it is edited by hand
              // (spec §8: "Slug auto-generated from title, editable").
              if (generates && slugFieldName && !slugTouched) {
                form.setValue(slugFieldName, slugify(event.target.value), {
                  shouldValidate: form.formState.isSubmitted,
                });
              }
            }}
          />
        );
      }

      case "slug": {
        const registration = form.register(field.name);
        return (
          <Input
            {...registration}
            id={inputId}
            required={field.required}
            spellCheck={false}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => {
              setSlugTouched(true);
              void registration.onChange(event);
            }}
          />
        );
      }

      case "textarea":
        return (
          <Textarea
            {...form.register(field.name)}
            id={inputId}
            rows={field.rows ?? 4}
            maxLength={field.maxLength}
            required={field.required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          />
        );

      case "markdown": {
        // Registered so the resolver validates it; rendered controlled so the
        // preview and the toolbar have a value to work with.
        const registration = form.register(field.name);
        return (
          <MarkdownField
            name={field.name}
            id={inputId}
            rows={field.rows}
            required={field.required}
            invalid={invalid}
            describedBy={describedBy}
            figures={field.figures === true}
            {...(media ? { figureImages: media } : {})}
            value={markdown[field.name] ?? ""}
            onBlur={() => void registration.onBlur({ target: { name: field.name } })}
            onChange={(next) => {
              setMarkdown((current) => ({ ...current, [field.name]: next }));
              form.setValue(field.name, next, {
                shouldValidate: form.formState.isSubmitted,
              });
            }}
          />
        );
      }

      case "number":
        return (
          <Input
            {...form.register(field.name)}
            id={inputId}
            type="number"
            inputMode="numeric"
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            required={field.required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          />
        );

      case "date":
        return (
          <Input
            {...form.register(field.name)}
            id={inputId}
            type="date"
            min={field.min}
            max={field.max}
            required={field.required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          />
        );

      case "reference":
        return (
          <select
            {...form.register(field.name)}
            id={inputId}
            required={field.required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {/* The blank option is a real answer, not a prompt to choose: the
                column is nullable and "not attached to anything" is the right
                value for most rows. */}
            <option value="">{field.emptyLabel}</option>
            {(options[field.name] ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.published ? option.label : `${option.label} (draft)`}
              </option>
            ))}
          </select>
        );

      case "select":
        return (
          <select
            {...form.register(field.name)}
            id={inputId}
            required={field.required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case "checkbox":
        return (
          <input
            {...form.register(field.name)}
            id={inputId}
            type="checkbox"
            value="on"
            aria-describedby={describedBy}
            className="mt-0.5 size-4 rounded border-input"
          />
        );

      case "gallery": {
        form.register(field.name);
        const chosen = galleries[field.name] ?? [];
        return (
          <GalleryField
            name={field.name}
            label={field.label}
            value={chosen}
            max={field.max}
            describedBy={describedBy}
            onChange={(next) => {
              setGalleries((current) => ({ ...current, [field.name]: next }));
              form.setValue(
                field.name,
                next.map((asset) => asset.id),
                { shouldValidate: form.formState.isSubmitted },
              );
            }}
          />
        );
      }

      case "tags": {
        form.register(field.name);
        return (
          <TagInput
            name={field.name}
            id={inputId}
            label={field.label}
            values={listValues[field.name] ?? []}
            maxItems={field.maxItems}
            maxLength={field.maxLength}
            invalid={invalid}
            describedBy={describedBy}
            onChange={(next) => {
              setListValues((current) => ({ ...current, [field.name]: next }));
              form.setValue(field.name, next, {
                shouldValidate: form.formState.isSubmitted,
              });
            }}
          />
        );
      }

      case "multiselect": {
        form.register(field.name);
        return (
          <MultiSelectField
            name={field.name}
            id={inputId}
            options={options[field.name] ?? []}
            value={listValues[field.name] ?? []}
            emptyLabel={field.emptyLabel}
            invalid={invalid}
            describedBy={describedBy}
            onChange={(next) => {
              setListValues((current) => ({ ...current, [field.name]: next }));
              form.setValue(field.name, next, {
                shouldValidate: form.formState.isSubmitted,
              });
            }}
          />
        );
      }

      case "hours":
        return (
          <HoursField
            name={field.name}
            legend={field.label}
            hint={field.hint}
            register={(control) => form.register(control)}
            error={errorsFor(field.name)?.[0]}
          />
        );

      case "image": {
        const value = imageValues[field.name] ?? {
          mediaId: null,
          url: null,
          alt: "",
          decorative: false,
        };
        return (
          <ResourceImageField
            name={field.name}
            altName={field.altName}
            decorativeName={`${field.name}Decorative`}
            label={field.label}
            altLabel={field.altLabel}
            hint={field.hint}
            value={value}
            contentType={resource}
            slug={slugFieldName ? String(form.getValues(slugFieldName) ?? "") : ""}
            errors={errorsFor(field.name)}
            altErrors={errorsFor(field.altName)}
            onChange={(next) => {
              setImageValues((current) => ({ ...current, [field.name]: next }));
              form.setValue(field.name, next.mediaId ?? "");
              form.setValue(field.altName, next.alt);
              form.setValue(`${field.name}Decorative`, next.decorative);
            }}
          />
        );
      }
    }
  }
}

/**
 * Every message under an error node, however deep.
 *
 * A leaf is `{ message, type, ref }`; a branch is a plain object or array of
 * them. Both shapes come from the same resolver, so the walk is the only thing
 * that reads both without knowing which field produced it.
 */
function collectMessages(node: unknown, found: string[] = []): string[] {
  if (!node || typeof node !== "object") return found;

  const message = (node as { message?: unknown }).message;
  if (typeof message === "string") {
    found.push(message);
    return found;
  }

  for (const value of Object.values(node as Record<string, unknown>)) {
    collectMessages(value, found);
  }
  return found;
}

/**
 * The dotted path of the first error with a message, and the top-level field it
 * belongs to. `["hours.sun.open", "hours"]` for a blank Sunday.
 */
function firstErrorPath(
  errors: Record<string, unknown>,
): [leaf: string | null, root: string | null] {
  for (const [key, value] of Object.entries(errors)) {
    const path = pathToMessage(value, key);
    if (path) return [path, key];
  }
  return [null, null];
}

function pathToMessage(node: unknown, prefix: string): string | null {
  if (!node || typeof node !== "object") return null;
  if (typeof (node as { message?: unknown }).message === "string") return prefix;

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const found = pathToMessage(value, `${prefix}.${key}`);
    if (found) return found;
  }
  return null;
}

/**
 * The label / control / hint / error wrapper.
 *
 * Image fields render their own `<fieldset>` with its own legend, labels and
 * errors, so this contributes nothing around them — a second label for a
 * control that already has three would be noise in a screen reader.
 */
function FieldRow({
  field,
  errors,
  altErrors,
  children,
}: {
  field: Field;
  errors?: string[];
  altErrors?: string[];
  children: React.ReactNode;
}) {
  // These render their own `<fieldset>` with a legend, labels and errors, so
  // this contributes nothing around them — a second label for a control that
  // already has three would be noise in a screen reader.
  if (field.type === "image" || field.type === "hours") return <>{children}</>;

  const inputId = `field-${field.name}`;
  const invalid = (errors?.length ?? 0) > 0 || (altErrors?.length ?? 0) > 0;

  // A gallery has no single focusable control for a `<label for>` to point at —
  // it is a list of rows, each with its own buttons — so it is grouped rather
  // than labelled. A label pointing at an id that does not exist is worse than
  // no label: a screen reader announces nothing and the click target is dead.
  if (field.type === "gallery") {
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">
          {field.label}
          {field.required ? <span className="text-destructive"> *</span> : null}
        </legend>
        {children}
        {field.hint ? (
          <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
            {field.hint}
          </p>
        ) : null}
        {invalid ? (
          <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">
            {errors?.[0]}
          </p>
        ) : null}
      </fieldset>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div>
        <div className="flex items-start gap-2">
          {children}
          <label htmlFor={inputId} className="text-sm text-foreground">
            {field.label}
          </label>
        </div>
        {field.hint ? (
          <p id={`${inputId}-hint`} className="mt-1 text-xs text-muted-foreground">
            {field.hint}
          </p>
        ) : null}
        {invalid ? (
          <p id={`${inputId}-error`} role="alert" className="mt-1 text-sm text-destructive">
            {errors?.[0]}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
        {field.label}
        {field.required ? <span className="text-destructive"> *</span> : null}
      </label>
      {children}
      {field.hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
          {field.hint}
        </p>
      ) : null}
      {invalid ? (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">
          {errors?.[0]}
        </p>
      ) : null}
    </div>
  );
}
