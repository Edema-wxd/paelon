import {
  NotImplementedError,
  type BookingDestination,
  type BookingDispatch,
  type DestinationResult,
} from "./types";

/**
 * Insta HMS destination — **interface only**.
 *
 * Master spec §7 and §10 are both explicit: stub the class, do not implement
 * the API call. The docs are an outstanding item (master spec §18), and writing
 * a speculative integration against an unseen API would be worse than none.
 *
 * `enabled` is hard-coded false, so the registry never dispatches to it and
 * `send()` is unreachable in normal operation. It throws rather than returning
 * a failure so that wiring it up by accident is loud, not silent.
 */
export const instaHmsDestination: BookingDestination = {
  name: "insta-hms",
  enabled: false,

  send(_dispatch: BookingDispatch): Promise<DestinationResult> {
    throw new NotImplementedError("Insta HMS booking destination");
  },
};
