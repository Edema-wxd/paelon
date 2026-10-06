"use client";

import { Save } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  saveSettingsAction,
  type SettingsState,
} from "@/lib/admin/settings-actions";
import {
  DEFAULT_RESPONSE_TIME_HOURS,
  responseTimePromise,
} from "@/lib/response-time";
import { RESPONSE_TIME_MAX_HOURS } from "@/lib/validation/settings";

/**
 * The `/admin/settings` form (decision C2 option B).
 *
 * Two fields, both clearable, because an empty value is a real answer here:
 * "not confirmed yet" is the state the site ships in, and clearing a field
 * restores the documented placeholder rather than blanking a page.
 *
 * The turnaround is a number, and the sentence it produces is previewed live
 * beneath it. An operator setting a promise to every patient who fills in a
 * form should see the words that will appear, not infer them from "4" — and
 * because the wording comes from `lib/response-time.ts`, the preview is the
 * same string the public pages will render.
 *
 * No optimistic state. A settings save is rare and worth a round trip; showing
 * a value as saved before the write lands is how an operator walks away from a
 * failed save believing the promise changed.
 */

/** The first server message for `field`, rendered under its input. */
function FieldError({ id, messages }: { id: string; messages: string[] | undefined }) {
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
      {pending ? "Saving…" : "Save settings"}
    </Button>
  );
}

export function SettingsForm({
  responseTimeHours,
  whatsappNumber,
}: {
  responseTimeHours: number | null;
  whatsappNumber: string | null;
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(
    saveSettingsAction,
    null,
  );

  // Controlled only so the preview can track typing. The server value is the
  // initial state and the server's parse is still what decides.
  const [hours, setHours] = useState(
    responseTimeHours === null ? "" : String(responseTimeHours),
  );

  const parsedHours = /^\d+$/.test(hours) ? Number(hours) : null;
  const previewHours =
    parsedHours !== null && parsedHours >= 1 && parsedHours <= RESPONSE_TIME_MAX_HOURS
      ? parsedHours
      : null;

  return (
    <form action={formAction} className="mt-8 space-y-8">
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

      <div className="space-y-2">
        <label htmlFor="responseTimeHours" className="block text-sm font-medium text-primary">
          Response time, in hours
        </label>
        <Input
          id="responseTimeHours"
          name="responseTimeHours"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="max-w-32"
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          aria-describedby="responseTimeHours-hint responseTimeHours-error"
        />
        <p id="responseTimeHours-hint" className="text-xs text-muted-foreground">
          {hours === ""
            ? `Not confirmed. Every form currently shows the placeholder: “${responseTimePromise(null)}” (${DEFAULT_RESPONSE_TIME_HOURS} hours, transcribed from the spec, not agreed with the front desk).`
            : previewHours === null
              ? `Whole number of hours, 1 to ${RESPONSE_TIME_MAX_HOURS}. Leave empty if it is not confirmed.`
              : `Every form and thank-you page will read: “${responseTimePromise(previewHours)}”`}
        </p>
        <FieldError
          id="responseTimeHours-error"
          messages={state && !state.ok ? state.fields.responseTimeHours : undefined}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="whatsappNumber" className="block text-sm font-medium text-primary">
          Switchboard WhatsApp number
        </label>
        <Input
          id="whatsappNumber"
          name="whatsappNumber"
          type="tel"
          autoComplete="off"
          className="max-w-64"
          defaultValue={whatsappNumber ?? ""}
          placeholder="0801 234 5678"
          aria-describedby="whatsappNumber-hint whatsappNumber-error"
        />
        <p id="whatsappNumber-hint" className="text-xs text-muted-foreground">
          Used only where a branch has no WhatsApp number of its own. A branch
          number always wins. Leave empty to show no WhatsApp link at all.
        </p>
        <FieldError
          id="whatsappNumber-error"
          messages={state && !state.ok ? state.fields.whatsappNumber : undefined}
        />
      </div>

      <SubmitButton />
    </form>
  );
}
