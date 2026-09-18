/**
 * Limits shared by the media actions and the media grid. Kept out of
 * `actions.ts`, which is a `"use server"` module and can export only async
 * functions.
 */

/** Most files one delete may name. Bounded so a crafted form cannot ask for 10,000. */
export const MEDIA_DELETE_MAX = 50;

export const MEDIA_DELETE_COUNT_MESSAGE = `Select between 1 and ${MEDIA_DELETE_MAX} files to delete.`;
