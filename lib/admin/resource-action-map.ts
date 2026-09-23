import {
  createAwardAction,
  createFaqAction,
  deleteAwardAction,
  deleteFaqAction,
  updateAwardAction,
  updateFaqAction,
  type ResourceResult,
  type ResourceState,
} from "@/lib/admin/resource-actions";
import type { ResourceName } from "@/lib/admin/resources";

/**
 * The action trio for each resource, by name.
 *
 * Separate from `resource-actions.ts` because a `"use server"` module may only
 * export async functions — an object of them is a build error there. It is
 * separate from `resources/index.ts` too, so importing a config does not pull
 * the actions (and the database behind them) in with it.
 *
 * A lookup, never a dispatcher: the caller picks a function and calls it, so
 * each one keeps the fixed permission and cache tags it was built with. A
 * resource added to `RESOURCES` without an entry here is a type error.
 */

export type ResourceAction = (
  prev: ResourceState,
  formData: FormData,
) => Promise<ResourceResult>;

export interface ResourceActions {
  create: ResourceAction;
  update: ResourceAction;
  remove: ResourceAction;
}

export const RESOURCE_ACTIONS: Record<ResourceName, ResourceActions> = {
  faqs: { create: createFaqAction, update: updateFaqAction, remove: deleteFaqAction },
  awards: { create: createAwardAction, update: updateAwardAction, remove: deleteAwardAction },
};
