import { describe, expect, it } from "vitest";

import { serializeJsonLd } from "@/lib/json-ld";

const LINE_SEPARATOR = String.fromCharCode(0x2028);

describe("serializeJsonLd", () => {
  const hostile = {
    "@type": "Answer",
    text: `Fine.</script><script>alert("x")</script> & <b>more</b>${LINE_SEPARATOR}end`,
  };

  it("leaves nothing that can close the script element", () => {
    const out = serializeJsonLd(hostile);
    expect(out).not.toMatch(/[<>]/);
    expect(out.toLowerCase()).not.toContain("</script");
    expect(out).not.toContain(LINE_SEPARATOR);
  });

  it("parses back to exactly the same data", () => {
    expect(JSON.parse(serializeJsonLd(hostile))).toEqual(hostile);
  });

  it("matches JSON.stringify when there is nothing to escape", () => {
    const plain = { "@context": "https://schema.org", name: "Paelon Memorial Hospital" };
    expect(serializeJsonLd(plain)).toBe(JSON.stringify(plain));
  });
});
