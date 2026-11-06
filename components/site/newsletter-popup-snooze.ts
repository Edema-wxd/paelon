/**
 * The newsletter popup's 30-day snooze, shared by the trigger that decides
 * whether to open it (`newsletter-popup.tsx`) and the dialog that sets it
 * (`newsletter-popup-dialog.tsx`). Kept apart so the trigger can read it
 * without importing the dialog, which is loaded on demand.
 */

const SNOOZE_KEY = "paelon:newsletter-popup";
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

/** Browser storage is a convenience here, never a dependency: it throws in
    private windows and with site data blocked, and the popup then simply shows
    once per page load. */
export function isSnoozed(): boolean {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY);
    return raw !== null && Date.now() - Number(raw) < SNOOZE_MS;
  } catch {
    return false;
  }
}

export function snooze() {
  try {
    window.localStorage.setItem(SNOOZE_KEY, String(Date.now()));
  } catch {
    // Nothing to do — see isSnoozed.
  }
}
