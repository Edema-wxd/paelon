/**
 * Primary navigation.
 *
 * TODO(design): the Figma export and spec §6 disagree on this list. The export
 * has Medical Services · Our Specialties · About Us · Contact Us · Emergency.
 * Spec §6 specifies logo · services dropdown · locations · for patients · for
 * corporates · Book Appointment CTA. The export is implemented below because
 * it is the design that was reviewed visually, with the Book Appointment CTA
 * from the spec added back — the export omits it, and it is the homepage's
 * primary conversion path. Locations and For Corporates are absent from the
 * export but have templates in spec §6; they are not linked from the header
 * yet. Francis to confirm the real nav.
 *
 * "Our Specialists" now points at /doctors, which is the Figma "Our
 * Specialists" page (node 2653-7) built against the `doctors` table. The label
 * follows the export, which reads "Our Specialists" there; the header's
 * earlier "Our Specialties" was a transcription of the same item back when it
 * had no destination and fell through to /services. Spec §6 still defines no
 * such template — Francis to confirm it belongs there.
 */
export interface NavItem {
  label: string;
  href: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Medical Services", href: "/services" },
  { label: "Our Specialists", href: "/doctors" },
  // Added now that /locations exists. Spec §6 puts locations in the header;
  // the export omits it. Sits after the service links and before About so the
  // nav runs care, then place, then company.
  { label: "Locations", href: "/locations" },
  { label: "About Us", href: "/about" },
  { label: "Contact Us", href: "/contact" },
] as const;
