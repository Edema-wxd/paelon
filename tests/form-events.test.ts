import { createFormControl } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { controlledBlurEvent } from "@/lib/admin/form-events";

/**
 * Against the real react-hook-form, because the bug lived in how its handler
 * reads an event, not in anything of ours a mock would reproduce.
 */
function bodyField() {
  const form = createFormControl({ defaultValues: { body: "" }, mode: "onBlur" });
  const registration = form.register("body");
  return { form, registration };
}

describe("controlledBlurEvent", () => {
  it("keeps a controlled field's value when it loses focus", async () => {
    const { form, registration } = bodyField();
    form.setValue("body", "Written in the editor.");

    await registration.onBlur(controlledBlurEvent("body", "Written in the editor."));

    expect(form.getValues("body")).toBe("Written in the editor.");
    expect(form.getFieldState("body").isTouched).toBe(true);
  });

  it("documents the old event: no value, so the field was wiped", async () => {
    const { form, registration } = bodyField();
    form.setValue("body", "Written in the editor.");

    await registration.onBlur({ target: { name: "body" } });

    expect(form.getValues("body")).toBeUndefined();
  });
});
