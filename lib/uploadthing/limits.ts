/**
 * Limits shared by the media actions and the media grid. Kept out of
 * `actions.ts`, which is a `"use server"` module and can export only async
 * functions.
 */

/** Longest alt text the library accepts — a description, not a caption. */
export const MEDIA_ALT_MAX = 300;
