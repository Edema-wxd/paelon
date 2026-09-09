import type { ServiceFamily } from "@/lib/content";
import type {
  serviceFamilyValues,
  timeWindowValues,
} from "@/lib/validation/booking";

/**
 * The wizard's shared vocabulary (master spec §7).
 *
 * Deliberately *not* `BookingSubmission`: that type is the validated payload,
 * where consent is `true` and the required fields are present. A half-filled
 * wizard is neither, so the draft is a separate shape whose fields are all
 * optional-ish, and `bookingStepSchemas` is what turns one into the other.
 *
 * The option types carry only what a step renders. The page maps database rows
 * onto them server-side so no template row — and no Neon driver — reaches the
 * client bundle.
 */

export type TimeWindow = (typeof timeWindowValues)[number];
export type { ServiceFamily };

export interface BranchOption {
  slug: string;
  name: string;
  city: string;
  /** Pre-formatted on the server: "Open 8:00am – 6:00pm" or null when unseeded. */
  hoursToday: string | null;
}

export interface ServiceOption {
  slug: string;
  name: string;
  family: ServiceFamily;
  shortDescription: string | null;
}

export interface HmoOption {
  slug: string;
  name: string;
  aliases?: string[];
}

/** In-progress booking. One object, owned by the wizard, patched per step. */
export interface BookingDraft {
  locationSlug: string;
  serviceFamily: ServiceFamily | "";
  serviceSlug: string;
  preferredDate: string;
  preferredTimeWindow: TimeWindow | "";
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  patientDob: string;
  existingPatient: boolean;
  reasonForVisit: string;
  hmoSlug: string;
  hmoPlan: string;
  consentNdpr: boolean;
  consentMarketing: boolean;
}

export const EMPTY_DRAFT: BookingDraft = {
  locationSlug: "",
  serviceFamily: "",
  serviceSlug: "",
  preferredDate: "",
  preferredTimeWindow: "",
  patientName: "",
  patientPhone: "",
  patientEmail: "",
  patientDob: "",
  existingPatient: false,
  reasonForVisit: "",
  hmoSlug: "",
  hmoPlan: "",
  consentNdpr: false,
  consentMarketing: false,
};

/** Field-keyed messages from either the step schema or the server. */
export type DraftErrors = Partial<Record<keyof BookingDraft, string>>;

export interface StepProps {
  draft: BookingDraft;
  errors: DraftErrors;
  /** Patches the draft. Never replaces it — back navigation must not lose state. */
  patch: (values: Partial<BookingDraft>) => void;
}

export const SERVICE_FAMILY_LABELS: Record<
  (typeof serviceFamilyValues)[number],
  string
> = {
  family_healthcare: "Family Healthcare",
  women_and_children: "Women and Children",
  specialist: "Specialist",
  diagnostics: "Diagnostics",
};

export const TIME_WINDOW_LABELS: Record<TimeWindow, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

/**
 * Indicative only, and labelled as such in the UI. The hospital confirms the
 * actual appointment time by phone, so these must never read as bookable slots.
 */
export const TIME_WINDOW_HINTS: Record<TimeWindow, string> = {
  morning: "Roughly 8am – 12pm",
  afternoon: "Roughly 12pm – 4pm",
  evening: "Roughly 4pm – 8pm",
};
