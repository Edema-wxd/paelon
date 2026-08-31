import type { Hmo } from "@/lib/content";

/**
 * Client-side HMO name matching for the Phase 1 typeahead.
 *
 * Phase 1 reads content from `/seed/*.json` and must work with no database
 * (CLAUDE.md), so this is a pure function over the seeded list rather than a
 * call to `/api/hmo/search`. That route implements the same idea in Postgres
 * with pg_trgm and is the Phase 2 path; the two are deliberately separate.
 *
 * The matching rules exist because patients type what is printed on their
 * card or on the logo strip above the search box, which is rarely the exact
 * seeded name. A plain substring filter failed on "Leadway Health" and
 * "Avon HMO" — both readable from the logos on that very page.
 */

/**
 * Tokens that carry no identifying signal in a Nigerian HMO name.
 *
 * Stripped from the query and the candidate alike, so "Leadway Health"
 * matches "Leadway" and "Avon HMO" matches "Avon" without either needing a
 * hand-written alias. Kept deliberately short: a token here is a token that
 * can never distinguish two providers.
 */
const NOISE_TOKENS = new Set([
  "hmo",
  "hmos",
  "health",
  "healthcare",
  "care",
  "insurance",
  "assurance",
  "limited",
  "ltd",
  "plc",
  "nigeria",
  "nig",
  "company",
  "co",
  "plan",
  "plans",
]);

/**
 * Lowercase, strip diacritics, reduce anything that is not a letter or digit
 * to a space, and collapse runs of whitespace.
 *
 * This is what makes "AXA  Mansard", "axa-mansard" and "AXA/Mansard" all
 * normalise to the same string.
 */
function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenise(value: string): string[] {
  const all = normalise(value).split(" ").filter(Boolean);
  const significant = all.filter((t) => !NOISE_TOKENS.has(t));
  // A query of nothing but noise ("hmo") still deserves to match something,
  // so fall back to the raw tokens rather than returning an empty set.
  return significant.length > 0 ? significant : all;
}

/**
 * Damerau-Levenshtein distance, capped: returns `max + 1` as soon as the
 * best possible remaining score exceeds `max`, so a long non-match costs
 * little. Transpositions count as one edit because "mansrad" for "mansard"
 * is a single slip on a keyboard, not two.
 */
function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr: number[] = [];

  for (let i = 1; i <= a.length; i += 1) {
    curr = [i];
    let rowBest = i;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        (curr[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );

      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        value = Math.min(value, (prev2[j - 2] ?? 0) + 1);
      }

      curr[j] = value;
      if (value < rowBest) rowBest = value;
    }

    if (rowBest > max) return max + 1;
    prev2 = prev;
    prev = curr;
  }

  return prev[b.length] ?? max + 1;
}

/**
 * Does `needle` appear in `haystack` as a whole word (or run of words)?
 *
 * Both are already normalised to space-separated tokens, so word boundaries
 * are just spaces. Used instead of `includes` so a one-letter query does not
 * match the "a" inside "leadway".
 */
function containsWord(haystack: string, needle: string): boolean {
  return (
    haystack === needle ||
    haystack.startsWith(`${needle} `) ||
    haystack.endsWith(` ${needle}`) ||
    haystack.includes(` ${needle} `)
  );
}

/**
 * Typo budget by token length. Short tokens get none: at three characters
 * one edit reaches most other three-character tokens, which would make the
 * first keystrokes of any query match everything.
 */
function typoBudget(length: number): number {
  if (length <= 4) return 0;
  if (length <= 7) return 1;
  return 2;
}

/** Does one query token match one candidate token? */
function tokenMatches(queryToken: string, candidateToken: string): boolean {
  if (candidateToken.startsWith(queryToken)) return true;

  const budget = typoBudget(queryToken.length);
  if (budget === 0) return false;

  // Compare against an equal-length prefix so a partially typed long name is
  // not penalised for the characters not typed yet.
  const window = candidateToken.slice(0, queryToken.length + budget);
  return editDistance(queryToken, window, budget) <= budget;
}

/**
 * Score one HMO against a query. Higher is better; 0 means no match.
 *
 * Aliases are scored alongside the canonical name and the best wins, so an
 * HMO that trades under more than one name resolves to a single record.
 */
function scoreHmo(hmo: Hmo, queryTokens: string[]): number {
  const candidates = [hmo.name, ...(hmo.aliases ?? [])];
  let best = 0;

  for (const candidate of candidates) {
    const normalised = normalise(candidate);
    const candidateTokens = tokenise(candidate);
    const joined = queryTokens.join(" ");

    let score = 0;

    if (normalised === joined) {
      score = 100;
    } else if (normalised.startsWith(joined)) {
      score = 90;
    } else {
      // Every query token must find a distinct candidate token. Requiring all
      // of them keeps "axa cigna" from matching either provider.
      const used = new Set<number>();
      let matched = 0;
      let exact = 0;

      for (const qt of queryTokens) {
        for (let i = 0; i < candidateTokens.length; i += 1) {
          const ct = candidateTokens[i];
          if (used.has(i) || ct === undefined) continue;
          if (tokenMatches(qt, ct)) {
            used.add(i);
            matched += 1;
            if (ct === qt) exact += 1;
            break;
          }
        }
      }

      if (matched === queryTokens.length) {
        // Favour candidates whose tokens were matched exactly, and those with
        // little left over — "avon" should beat a hypothetical "Avon Plus".
        score = 50 + exact * 10 - Math.max(0, candidateTokens.length - matched);
      } else if (containsWord(normalised, joined)) {
        // The query appears verbatim in the name but was dropped as a generic
        // token on the candidate side ("hmo" against "Avon HMO"). Weak, and
        // ranked below every real match, but returning nothing when the user
        // typed something plainly present in the name reads as broken.
        score = 40;
      }
    }

    // A canonical-name hit outranks an alias hit of equal quality.
    if (candidate !== hmo.name) score = Math.max(0, score - 5);
    if (score > best) best = score;
  }

  return best;
}

/**
 * Filter and rank the seeded HMO list for a typeahead query.
 *
 * Returns `[]` for an empty query — a just-mounted typeahead is a normal
 * state, not an error. Ties fall back to the seeded display order, which is
 * already the order the caller passed in.
 */
export function searchHmos(hmos: readonly Hmo[], query: string): Hmo[] {
  const queryTokens = tokenise(query);
  if (queryTokens.length === 0) return [];

  return hmos
    .map((hmo, index) => ({ hmo, index, score: scoreHmo(hmo, queryTokens) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.hmo);
}
