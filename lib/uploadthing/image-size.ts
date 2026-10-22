/**
 * Read an uploaded image's pixel dimensions from its header.
 *
 * `media.width` and `media.height` exist so `next/image` can reserve space
 * before the bytes arrive; CLS < 0.05 is a hard budget (spec §13). UploadThing's
 * completion callback does not report dimensions, so they have to come from the
 * file itself.
 *
 * ## Why this is hand-written
 *
 * The obvious answer is `sharp` or `image-size`, and neither is on the approved
 * dependency list in spec §2 — CLAUDE.md says ask before installing. Asking is
 * not worth it here, because spec §10 restricts uploads to **jpeg, png and
 * webp**, and the headers of those three are small, fixed and stable. There is
 * no decoding: nothing here reads a pixel, so a malformed or hostile file
 * cannot do more than fail to parse.
 *
 * ## Why not measure in the browser
 *
 * The client has the `File` and could report `naturalWidth`. It would also be
 * reporting a number the server then writes to the database and renders into a
 * layout, with nothing to check it against. The header is the file's own answer.
 *
 * A `null` return is normal, not an error: the format was not one of the three,
 * or the header was truncated or malformed. Callers store null, and
 * `lib/content.ts` renders alt text instead of a figure whose dimensions it had
 * to guess.
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * How much of the file to read.
 *
 * PNG and WebP answer within the first 32 bytes. JPEG does not: its SOF segment
 * sits after however many APPn segments the encoder wrote, and an embedded
 * colour profile or EXIF thumbnail can push it past 64 KB. 256 KB covers every
 * realistic case without pulling a 4 MB upload back out of the CDN.
 */
const HEADER_BYTES = 256 * 1024;

/** Plausible bounds. Outside them the parse found noise, not a dimension. */
const MAX_DIMENSION = 65_535;

function isPlausible(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= MAX_DIMENSION;
}

function dimensionsOrNull(width: number, height: number): ImageDimensions | null {
  return isPlausible(width) && isPlausible(height) ? { width, height } : null;
}

function hasAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * PNG: the IHDR chunk is mandatory and must come first, so width and height sit
 * at fixed offsets 16 and 20, big-endian.
 */
function readPng(view: DataView, bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 24) return null;
  if (PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) return null;
  if (!hasAscii(bytes, 12, "IHDR")) return null;

  return dimensionsOrNull(view.getUint32(16), view.getUint32(20));
}

/** Frame-header markers that carry the frame's size. */
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/**
 * JPEG: walk the segment chain to the first SOF (start of frame).
 *
 * `0xFFC4`, `0xFFC8` and `0xFFCC` are deliberately not in the SOF set — they
 * are Huffman tables, JPEG extensions and arithmetic-coding conditioning, which
 * share the `0xFFCn` range but carry no dimensions.
 */
function readJpeg(view: DataView, bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;

  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      // Not at a marker boundary: the header is damaged, or this is entropy
      // -coded scan data, which means the SOF was never found.
      return null;
    }

    // Runs of 0xFF are legal padding before a marker.
    let marker = bytes[offset + 1];
    let markerOffset = offset + 1;
    while (marker === 0xff && markerOffset + 1 < bytes.length) {
      markerOffset += 1;
      marker = bytes[markerOffset];
    }

    if (marker === undefined) return null;

    // Standalone markers: no length field, nothing to skip.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset = markerOffset + 1;
      continue;
    }

    const lengthOffset = markerOffset + 1;
    if (lengthOffset + 1 >= bytes.length) return null;
    const length = view.getUint16(lengthOffset);

    // A segment length counts its own two bytes, so anything under 2 is
    // nonsense and would loop forever.
    if (length < 2) return null;

    if (JPEG_SOF_MARKERS.has(marker)) {
      // length(2) precision(1) height(2) width(2) — so the last byte read is
      // at `lengthOffset + 6`, and a frame header ending exactly at the end of
      // the buffer is complete rather than truncated.
      if (lengthOffset + 7 > bytes.length) return null;
      return dimensionsOrNull(
        view.getUint16(lengthOffset + 5),
        view.getUint16(lengthOffset + 3),
      );
    }

    offset = lengthOffset + length;
  }

  return null;
}

/**
 * WebP: a RIFF container whose first chunk says which of three bitstreams it is.
 *
 * `VP8 ` is lossy, `VP8L` lossless and `VP8X` extended (the form used for
 * animation, alpha and ICC). Each stores its size differently, and the
 * fourteen-bit fields are why the masks are here.
 */
function readWebp(view: DataView, bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 30) return null;
  if (!hasAscii(bytes, 0, "RIFF") || !hasAscii(bytes, 8, "WEBP")) return null;

  if (hasAscii(bytes, 12, "VP8 ")) {
    // Frame tag (3 bytes), then the 0x9d012a sync code, then the dimensions.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      return null;
    }
    return dimensionsOrNull(
      view.getUint16(26, true) & 0x3fff,
      view.getUint16(28, true) & 0x3fff,
    );
  }

  if (hasAscii(bytes, 12, "VP8L")) {
    // One signature byte, then width-1 and height-1 packed into 28 bits.
    if (bytes[20] !== 0x2f) return null;
    const packed = view.getUint32(21, true);
    return dimensionsOrNull(
      (packed & 0x3fff) + 1,
      ((packed >> 14) & 0x3fff) + 1,
    );
  }

  if (hasAscii(bytes, 12, "VP8X")) {
    // Canvas size, as two 24-bit little-endian values holding size-1.
    const width =
      ((bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16)) + 1;
    const height =
      ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16)) + 1;
    return dimensionsOrNull(width, height);
  }

  return null;
}

/**
 * Dimensions from an image header, or null when the format is not one of the
 * three spec §10 allows.
 */
export function readImageDimensions(
  header: ArrayBuffer | Uint8Array,
): ImageDimensions | null {
  const bytes =
    header instanceof Uint8Array ? header : new Uint8Array(header);

  // No blanket length floor: each reader below states its own minimum, and
  // they differ — 24 bytes for PNG, 30 for WebP, far fewer for JPEG, whose
  // frame header can legally sit almost at the start of the file.
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );

  return readPng(view, bytes) ?? readWebp(view, bytes) ?? readJpeg(view, bytes);
}

/**
 * Fetch enough of an uploaded image to read its header, and parse it.
 *
 * Asks for a byte range so a 4 MB upload is not pulled back in full. A CDN that
 * ignores `Range` answers 200 with the whole body, which still parses — the
 * request is an optimisation, not a requirement.
 *
 * Never throws. A failed fetch means the dimensions are unknown, which is a
 * state the schema and the templates both allow for; it must not fail the
 * upload, because the file is already stored and the `media` row is what makes
 * it visible in the library at all.
 */
export async function fetchImageDimensions(
  url: string,
): Promise<ImageDimensions | null> {
  try {
    const response = await fetch(url, {
      headers: { Range: `bytes=0-${HEADER_BYTES - 1}` },
      cache: "no-store",
    });

    if (!response.ok) return null;

    return readImageDimensions(await response.arrayBuffer());
  } catch {
    return null;
  }
}
