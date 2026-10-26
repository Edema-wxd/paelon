"use client";

import { Save } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";

import { MarkdownField } from "@/components/admin/markdown-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveAboutAction, type AboutState } from "@/lib/admin/about-actions";

/**
 * The `/admin/about` form (migration 0005).
 *
 * One screen for the whole page, in the order the page renders, because that
 * is how someone writing it reads it. The sections are all optional at rest
 * and all required to publish — the server enforces that pair, and the
 * checkbox hint below says so before the save rather than after.
 *
 * The intro goes through `MarkdownField`, the same editor the blog body uses,
 * so the preview is the renderer the public page runs. It is a short lead under
 * the h1 and stays plain: no images, no headings. The page's sections are
 * blocks in Page layout, edited and saved below this form.
 *
 * No optimistic state. Saving the hospital's founding story is rare and worth
 * a round trip; showing copy as saved before the write lands is how someone
 * walks away from a failed save believing the page changed.
 */

/**
 * The prose this form edits. Since migration 0008 the story, mission, vision,
 * value proposition and ESG sections are blocks in Page layout (below this
 * form), so only the intro — the lead under the h1 — remains here.
 */
const SECTIONS = [
  {
    name: "intro",
    label: "Intro",
    hint: "One or two sentences under the page heading. Required to publish. The sections below it are edited in Page layout.",
    rows: 4,
    rich: false,
  },
] as const;

type SectionName = (typeof SECTIONS)[number]["name"];

export interface AboutFormValues {
  published: boolean;
  placeholder: boolean;
  intro: string;
  motto: string;
}

/** The first server message for `field`, rendered under its control. */
function FieldError({
  id,
  messages,
}: {
  id: string;
  messages: string[] | undefined;
}) {
  const message = messages?.[0];
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      <Save aria-hidden />
      {pending ? "Saving…" : "Save About page"}
    </Button>
  );
}

export function AboutForm({ values }: { values: AboutFormValues }) {
  const [state, formAction] = useActionState<AboutState, FormData>(
    saveAboutAction,
    null,
  );
  const formId = useId();

  /*
   * Controlled because `MarkdownField` is: the editor owns its textarea value
   * so the preview can render what is typed. The server's parse still decides.
   */
  const [prose, setProse] = useState<Record<SectionName, string>>({
    intro: values.intro,
  });

  const fields = state && !state.ok ? state.fields : undefined;

  return (
    <form action={formAction} className="mt-8 space-y-10">
      {state && !state.ok && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-sm text-foreground/80">
          {state.data.message}
        </p>
      )}

      {SECTIONS.map((section) => {
        const id = `${formId}-${section.name}`;
        return (
          <div key={section.name} className="space-y-2">
            <label
              htmlFor={id}
              className="block text-sm font-medium text-primary"
            >
              {section.label}
            </label>
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">
              {section.hint}
            </p>
            <MarkdownField
              id={id}
              name={section.name}
              figures={section.rich}
              headings={section.rich}
              value={prose[section.name]}
              onChange={(next) =>
                setProse((current) => ({ ...current, [section.name]: next }))
              }
              rows={section.rows}
              invalid={Boolean(fields?.[section.name])}
              describedBy={`${id}-hint ${id}-error`}
            />
            <FieldError id={`${id}-error`} messages={fields?.[section.name]} />
          </div>
        );
      })}

      <div className="space-y-2">
        <label
          htmlFor={`${formId}-motto`}
          className="block text-sm font-medium text-primary"
        >
          Motto
        </label>
        <Input
          id={`${formId}-motto`}
          name="motto"
          type="text"
          maxLength={200}
          autoComplete="off"
          defaultValue={values.motto}
          aria-describedby={`${formId}-motto-hint ${formId}-motto-error`}
        />
        <p id={`${formId}-motto-hint`} className="text-xs text-muted-foreground">
          One line, shown as a pull quote. Plain text, not Markdown. Optional.
        </p>
        <FieldError id={`${formId}-motto-error`} messages={fields?.motto} />
      </div>

      <fieldset className="space-y-4 border-t border-border pt-6">
        <legend className="sr-only">Publishing</legend>

        <div className="flex items-start gap-3">
          <input
            id={`${formId}-placeholder`}
            name="placeholder"
            type="checkbox"
            defaultChecked={values.placeholder}
            className="mt-1 size-4"
            aria-describedby={`${formId}-placeholder-hint`}
          />
          <div>
            <label
              htmlFor={`${formId}-placeholder`}
              className="text-sm font-medium text-primary"
            >
              This copy is a draft nobody at Paelon has confirmed
            </label>
            <p
              id={`${formId}-placeholder-hint`}
              className="text-xs text-muted-foreground"
            >
              Publishing is refused while this is ticked. Draft text is
              non-empty, so the empty-section check cannot catch it on its own.
            </p>
            <FieldError
              id={`${formId}-placeholder-error`}
              messages={fields?.placeholder}
            />
          </div>
        </div>

        <div className="flex items-start gap-3">
          <input
            id={`${formId}-published`}
            name="published"
            type="checkbox"
            defaultChecked={values.published}
            className="mt-1 size-4"
            aria-describedby={`${formId}-published-hint`}
          />
          <div>
            <label
              htmlFor={`${formId}-published`}
              className="text-sm font-medium text-primary"
            >
              Publish the About page
            </label>
            <p
              id={`${formId}-published-hint`}
              className="text-xs text-muted-foreground"
            >
              Needs the intro, founding story, mission, vision and value
              proposition filled in. While this is off the page still renders,
              with a pending notice and `noindex`.
            </p>
            <FieldError
              id={`${formId}-published-error`}
              messages={fields?.published}
            />
          </div>
        </div>
      </fieldset>

      <SubmitButton />
    </form>
  );
}
