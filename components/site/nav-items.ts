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
 * TODO(design): "Our Specialties" has no destination. Spec §6 defines no
 * doctors or specialists template, yet spec §11 requires `Physician` JSON-LD
 * on "each doctor profile" — so a route is implied but never specified. Points
 * at /services for now.
 */
export interface NavItem {
  label: string;
  href: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Medical Services", href: "/services" },
  { label: "Our Specialties", href: "/services" },
  // Added now that /locations exists. Spec §6 puts locations in the header;
  // the export omits it. Sits after the service links and before About so the
  // nav runs care, then place, then company.
  { label: "Locations", href: "/locations" },
  { label: "About Us", href: "/about" },
  { label: "Contact Us", href: "/contact" },
] as const;
