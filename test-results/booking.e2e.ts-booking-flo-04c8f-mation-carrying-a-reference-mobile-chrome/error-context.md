# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: booking.e2e.ts >> booking flow >> submitting the flow lands on a confirmation carrying a reference
- Location: tests/e2e/booking.e2e.ts:104:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/book\/confirmed\?ref=PMH-\d{4}-\d{6,}/
Received string:  "http://localhost:3000/book"

Call log:
  - Expect "toHaveURL" with timeout 30000ms
    54 × locator resolved to <html lang="en">…</html>
       - unexpected value "http://localhost:3000/book"
  - Test timeout of 30000ms exceeded.

```

```yaml
- link "Skip to content":
  - /url: "#main"
- banner:
  - link "Paelon Memorial Hospital, home":
    - /url: /
  - button "Open menu"
- main:
  - navigation "Breadcrumb":
    - list:
      - listitem:
        - link "Home":
          - /url: /
      - listitem: Book an appointment
  - heading "Book an appointment" [level=1]
  - paragraph: Tell us where, what and when, and we will call to confirm a time. We will contact you within 4 business hours during clinic hours.
  - paragraph: If this is an emergency, do not use this form. Go to your nearest branch or call the emergency line — it is answered 24 hours a day.
  - navigation "Booking progress":
    - paragraph: Step 6 of 6
    - list:
      - listitem: 1. Branch — Done
      - listitem: 2. Service — Done
      - listitem: 3. Date — Done
      - listitem: 4. Details — Done
      - listitem: 5. HMO — Done
      - listitem: 6. Review — Current step
  - paragraph: "Step 6 of 6: Review and confirm"
  - heading "Review and confirm" [level=2]
  - heading "Check your details" [level=3]
  - term: Branch
  - definition: Victoria Island
  - button "Edit branch"
  - term: Service
  - definition: Family Healthcare
  - button "Edit service"
  - term: Preferred day
  - definition: Monday, 14 September 2026, morning
  - button "Edit preferred day"
  - term: Patient
  - definition: Playwright Test Patient
  - button "Edit patient"
  - term: Phone
  - definition: "08012345678"
  - button "Edit phone"
  - term: Email
  - definition: playwright@example.test
  - button "Edit email"
  - term: HMO
  - definition: Paying privately
  - button "Edit hmo"
  - checkbox "I agree that Paelon Memorial Hospital may store these details and contact me about this appointment, and I have read the privacy policy." [checked]
  - text: I agree that Paelon Memorial Hospital may store these details and contact me about this appointment, and I have read the
  - link "privacy policy":
    - /url: /privacy
  - text: .
  - checkbox "Send me occasional health tips and hospital news by email. Optional, and you can unsubscribe at any time."
  - text: Send me occasional health tips and hospital news by email. Optional, and you can unsubscribe at any time.
  - paragraph: Something went wrong on our side. Please try again shortly.
  - button "Back"
  - button "Request appointment"
  - paragraph: We will contact you within 4 business hours during clinic hours. This is a request, not a confirmed appointment.
- contentinfo:
  - paragraph: Paelon Memorial
  - paragraph: Dedicated to providing expert medical care with a human touch. Your health and comfort are our primary concerns.
  - navigation "Quick Links":
    - heading "Quick Links" [level=2]
    - list:
      - listitem:
        - link "Clinical Accreditation":
          - /url: /about
      - listitem:
        - link "Patient Portal":
          - /url: /contact
      - listitem:
        - link "Medical Records":
          - /url: /contact
      - listitem:
        - link "Careers":
          - /url: /contact
  - navigation "Patient Support":
    - heading "Patient Support" [level=2]
    - list:
      - listitem:
        - link "Privacy Policy":
          - /url: /privacy
      - listitem:
        - link "Terms of Service":
          - /url: /terms
      - listitem:
        - link "Contact Information":
          - /url: /contact
      - listitem:
        - link "Find a Doctor":
          - /url: /services
  - heading "Emergency Contact" [level=2]
  - paragraph: 24/7 Hotline
  - link "+234 1234 5678":
    - /url: tel:+23412345678
  - text: Plot 12, Admiralty Way, Victoria Island, Lagos.
  - navigation "Our Branches":
    - heading "Our Branches" [level=2]
    - list:
      - listitem:
        - link "Victoria Island":
          - /url: /locations/victoria-island
  - paragraph: Data Protection Officer contact pending, required before launch under the NDPR.
  - paragraph: © 2026 Paelon Memorial Hospital. All rights reserved.
- alert
```

# Test source

```ts
  43  |     await expect(branches.first()).toBeVisible();
  44  |     await branches.first().check();
  45  |     await continueStep(page);
  46  | 
  47  |     // Step 2 — the announcement is what tells a screen-reader user the screen
  48  |     // moved. Without it, Continue looks like it did nothing.
  49  |     await expect(page.getByText("Step 2 of 6:")).toBeAttached();
  50  | 
  51  |     await page.getByRole("radio", { name: /family healthcare/i }).check();
  52  |     await continueStep(page);
  53  | 
  54  |     // Back twice, then forward again: the branch must still be selected.
  55  |     await page.getByRole("button", { name: "Back" }).click();
  56  |     await page.getByRole("button", { name: "Back" }).click();
  57  |     await expect(page.getByText("Step 1 of 6:")).toBeAttached();
  58  |     await expect(page.getByRole("radio").first()).toBeChecked();
  59  |   });
  60  | 
  61  |   test("a branch deep link skips step 1 and lands on the service step", async ({
  62  |     page,
  63  |   }) => {
  64  |     // The URL comes from the branch page's own "Book at this branch" CTA, so
  65  |     // this cannot drift away from what the location template actually links to.
  66  |     await page.goto("/locations");
  67  | 
  68  |     // Scoped to `main`, and waited for: the footer carries branch links too,
  69  |     // and this route streams behind a loading state, so an unscoped lookup
  70  |     // races it and clicks the footer copy instead.
  71  |     const main = page.getByRole("main");
  72  |     await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
  73  | 
  74  |     const branch = main.getByRole("link", { name: /victoria island/i }).first();
  75  | 
  76  |     test.skip(
  77  |       (await branch.count()) === 0,
  78  |       "No branch is published to deep-link from.",
  79  |     );
  80  | 
  81  |     await branch.click();
  82  |     await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
  83  | 
  84  |     const bookHere = main
  85  |       .getByRole("link", { name: /book at this branch/i })
  86  |       .first();
  87  |     await expect(bookHere).toHaveAttribute("href", /\/book\?branch=/);
  88  |     await bookHere.click();
  89  | 
  90  |     // Pre-filled, so step 1 is skipped and the visitor lands on the service
  91  |     // step directly (spec §7).
  92  |     await expect(page.getByText("Step 2 of 6:")).toBeAttached();
  93  |   });
  94  | 
  95  |   test("an unknown branch slug falls back to step 1 rather than 404ing", async ({
  96  |     page,
  97  |   }) => {
  98  |     const response = await page.goto("/book?branch=not-a-real-branch");
  99  | 
  100 |     expect(response?.status()).toBe(200);
  101 |     await expect(page.getByText("Step 1 of 6:")).toBeAttached();
  102 |   });
  103 | 
  104 |   test("submitting the flow lands on a confirmation carrying a reference", async ({
  105 |     page,
  106 |   }) => {
  107 |     await page.goto("/book");
  108 | 
  109 |     await page.getByRole("radio").first().check();
  110 |     await continueStep(page);
  111 | 
  112 |     await page.getByRole("radio", { name: /family healthcare/i }).check();
  113 |     await continueStep(page);
  114 | 
  115 |     // A day inside the 90-day window `bookingDate()` allows.
  116 |     const inSevenDays = new Date(Date.now() + 7 * 86_400_000)
  117 |       .toISOString()
  118 |       .slice(0, 10);
  119 |     await page.getByLabel(/which day suits you/i).fill(inSevenDays);
  120 |     await page.getByRole("radio", { name: /morning/i }).check();
  121 |     await continueStep(page);
  122 | 
  123 |     await page.getByLabel(/patient's full name/i).fill(PATIENT.name);
  124 |     await page.getByLabel(/phone number/i).fill(PATIENT.phone);
  125 |     await page.getByLabel(/email address/i).fill(PATIENT.email);
  126 |     await continueStep(page);
  127 | 
  128 |     // Paying privately is a first-class answer, not an empty state.
  129 |     await page.getByRole("radio", { name: /paying privately/i }).check();
  130 |     await continueStep(page);
  131 | 
  132 |     // Consent is never pre-ticked (NDPR), so submitting without it must fail.
  133 |     await page.getByRole("button", { name: /request appointment/i }).click();
  134 |     await expect(page).toHaveURL(/\/book$/);
  135 | 
  136 |     await page.getByRole("checkbox", { name: /privacy policy/i }).check();
  137 |     await page.getByRole("button", { name: /request appointment/i }).click();
  138 | 
  139 |     // Generous, and deliberately so: this click is a database write plus a
  140 |     // destination dispatch plus a route the dev server has not compiled yet.
  141 |     // The default 5s is a stopwatch on the machine, not an assertion about the
  142 |     // booking flow.
> 143 |     await expect(page).toHaveURL(/\/book\/confirmed\?ref=PMH-\d{4}-\d{6,}/, {
      |                        ^ Error: expect(page).toHaveURL(expected) failed
  144 |       timeout: 30_000,
  145 |     });
  146 |     await expect(page.getByText(/^PMH-\d{4}-\d{6,}$/)).toBeVisible();
  147 | 
  148 |     // A refresh must never resubmit — the POST already happened, and this page
  149 |     // is a GET (CLAUDE.md, conversion baseline item 1).
  150 |     await page.reload();
  151 |     await expect(page.getByText(/^PMH-\d{4}-\d{6,}$/)).toBeVisible();
  152 |   });
  153 | });
  154 | 
```