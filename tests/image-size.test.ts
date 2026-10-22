import { describe, expect, it } from "vitest";

import { readImageDimensions } from "@/lib/uploadthing/image-size";

/**
 * Headers are built here rather than committed as fixture files.
 *
 * The parser only ever reads the header, so a hand-built one exercises exactly
 * what it looks at — and a byte written here is a byte the test can explain,
 * which a binary fixture cannot.
 */

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); // IHDR length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** A JPEG with `fillers` APPn segments before the SOF, to exercise the walk. */
function jpeg(width: number, height: number, fillers = 0): Uint8Array {
  const parts: number[] = [0xff, 0xd8];

  for (let i = 0; i < fillers; i += 1) {
    // APP0 with a 4-byte payload: length counts its own two bytes.
    parts.push(0xff, 0xe0, 0x00, 0x06, 0, 0, 0, 0);
  }

  parts.push(
    0xff,
    0xc0, // SOF0
    0x00,
    0x11, // length
    0x08, // precision
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
  );

  return new Uint8Array(parts);
}

function webpLossy(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  bytes.set([0x56, 0x50, 0x38, 0x20], 12); // "VP8 "
  bytes.set([0x9d, 0x01, 0x2a], 23); // sync code
  view.setUint16(26, width, true);
  view.setUint16(28, height, true);
  return bytes;
}

function webpLossless(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x4c], 12); // "VP8L"
  bytes[20] = 0x2f; // signature
  // width-1 in the low 14 bits, height-1 in the next 14.
  view.setUint32(21, (width - 1) | ((height - 1) << 14), true);
  return bytes;
}

function webpExtended(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x58], 12); // "VP8X"
  const w = width - 1;
  const h = height - 1;
  bytes.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff], 24);
  bytes.set([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 27);
  return bytes;
}

describe("readImageDimensions — PNG", () => {
  it("reads IHDR", () => {
    expect(readImageDimensions(png(1200, 630))).toEqual({
      width: 1200,
      height: 630,
    });
  });

  it("rejects a PNG signature with no IHDR chunk", () => {
    const bytes = png(10, 10);
    bytes.set([0x6a, 0x75, 0x6e, 0x6b], 12); // "junk"
    expect(readImageDimensions(bytes)).toBeNull();
  });

  it("rejects a zero dimension", () => {
    expect(readImageDimensions(png(0, 100))).toBeNull();
  });
});

describe("readImageDimensions — JPEG", () => {
  it("reads SOF0", () => {
    expect(readImageDimensions(jpeg(800, 600))).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("walks past APPn segments to reach the frame header", () => {
    expect(readImageDimensions(jpeg(1920, 1080, 6))).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("returns null when the header ends before any frame header", () => {
    expect(readImageDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });

  it("does not mistake a Huffman table for a frame header", () => {
    // 0xFFC4 shares the 0xFFCn range with the SOF markers but carries no size.
    const parts = [0xff, 0xd8, 0xff, 0xc4, 0x00, 0x06, 0, 0, 0, 0];
    parts.push(0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x90, 0x02, 0x80);
    expect(readImageDimensions(new Uint8Array(parts))).toEqual({
      width: 640,
      height: 400,
    });
  });
});

describe("readImageDimensions — WebP", () => {
  it("reads a lossy VP8 chunk", () => {
    expect(readImageDimensions(webpLossy(640, 480))).toEqual({
      width: 640,
      height: 480,
    });
  });

  it("reads a lossless VP8L chunk", () => {
    expect(readImageDimensions(webpLossless(300, 200))).toEqual({
      width: 300,
      height: 200,
    });
  });

  it("reads an extended VP8X canvas", () => {
    expect(readImageDimensions(webpExtended(2000, 1500))).toEqual({
      width: 2000,
      height: 1500,
    });
  });

  it("rejects a lossy chunk with a bad sync code", () => {
    const bytes = webpLossy(100, 100);
    bytes[23] = 0x00;
    expect(readImageDimensions(bytes)).toBeNull();
  });

  it("rejects a RIFF container that is not WebP", () => {
    const bytes = webpLossy(100, 100);
    bytes.set([0x41, 0x56, 0x49, 0x20], 8); // "AVI "
    expect(readImageDimensions(bytes)).toBeNull();
  });
});

describe("readImageDimensions — other input", () => {
  it("returns null for a format spec §10 does not allow", () => {
    // GIF89a. Allowed uploads are jpeg, png and webp only.
    const gif = new Uint8Array(24);
    gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x10, 0x00], 0);
    expect(readImageDimensions(gif)).toBeNull();
  });

  it("returns null for a header too short to identify", () => {
    expect(readImageDimensions(new Uint8Array([0x89, 0x50]))).toBeNull();
  });

  it("returns null for empty input rather than throwing", () => {
    expect(readImageDimensions(new Uint8Array(0))).toBeNull();
  });

  it("accepts an ArrayBuffer as well as a view", () => {
    const bytes = png(64, 64);
    const copy = bytes.buffer.slice(0) as ArrayBuffer;
    expect(readImageDimensions(copy)).toEqual({ width: 64, height: 64 });
  });
});
