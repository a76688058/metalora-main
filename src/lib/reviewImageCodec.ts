/**
 * Server-only sharp adapter. Re-encodes JPEG, PNG, and WebP and drops source metadata.
 * Output is re-encoded without source metadata.
 */
import {
  REVIEW_IMAGE_MAX_EDGE,
  REVIEW_IMAGE_MAX_PIXELS,
  ReviewImageError,
  type ReviewImageCodec,
  type ReviewImageContentType,
  type SanitizedReviewImage,
} from "./reviewImageContract";

const OUTPUT_TYPES: Record<string, ReviewImageContentType> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function sharpInputOptions() {
  return {
    failOn: "warning" as const,
    limitInputPixels: REVIEW_IMAGE_MAX_PIXELS,
    animated: false,
    pages: 1,
    sequentialRead: true,
  };
}

function isAnimatedWebp(bytes: Buffer): boolean {
  if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
    return false;
  }
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const tag = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (tag === "ANIM") return true;
    if (tag === "VP8X" && offset + 8 < bytes.length) return (bytes[offset + 8] & 0x02) !== 0;
    if (!Number.isFinite(size) || size < 0) return false;
    offset += 8 + size + (size % 2);
  }
  return false;
}

function isAnimatedPng(bytes: Buffer): boolean {
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes.toString("ascii", 1, 4) !== "PNG") return false;
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "acTL") return true;
    if (type === "IDAT" || type === "IEND") return false;
    if (!Number.isFinite(length) || length < 0) return false;
    offset += 12 + length;
  }
  return false;
}

function rejectMarkup(bytes: Buffer): void {
  const head = bytes.subarray(0, 80).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<svg") || head.startsWith("<?xml") || head.startsWith("<!doctype")) {
    throw new ReviewImageError("unsupported", 415);
  }
}

function mapCodecFailure(error: unknown): ReviewImageError {
  if (error instanceof ReviewImageError) return error;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("pixel")) return new ReviewImageError("dimensions", 400);
  if (message.includes("unsupported marker") || message.includes("corrupt") || message.includes("premature")) {
    return new ReviewImageError("malformed", 400);
  }
  if (message.includes("unsupported image format") || message.includes("unsupported")) {
    return new ReviewImageError("unsupported", 415);
  }
  return new ReviewImageError("malformed", 400);
}

export function createSharpReviewImageCodec(): ReviewImageCodec {
  return {
    async reencode(input: Buffer): Promise<SanitizedReviewImage> {
      if (input.length === 0) throw new ReviewImageError("malformed", 400);
      const signature = input.toString("ascii", 0, 6);
      if (signature === "GIF87a" || signature === "GIF89a") {
        throw new ReviewImageError("unsupported", 415);
      }
      rejectMarkup(input);
      if (isAnimatedWebp(input) || isAnimatedPng(input)) {
        throw new ReviewImageError("unsupported", 415);
      }
      let sharp: typeof import("sharp").default;
      try {
        sharp = (await import("sharp")).default;
      } catch {
        throw new ReviewImageError("codec_unavailable", 503);
      }
      try {
        const meta = await sharp(input, sharpInputOptions()).metadata();
        const contentType = OUTPUT_TYPES[meta.format];
        if (!contentType) throw new ReviewImageError("unsupported", 415);
        if ((meta.pages ?? 1) > 1) throw new ReviewImageError("unsupported", 415);
        const declaredWidth = meta.width ?? 0;
        const declaredHeight = meta.height ?? 0;
        if (
          declaredWidth < 1 ||
          declaredHeight < 1 ||
          declaredWidth > REVIEW_IMAGE_MAX_EDGE ||
          declaredHeight > REVIEW_IMAGE_MAX_EDGE ||
          declaredWidth * declaredHeight > REVIEW_IMAGE_MAX_PIXELS
        ) {
          throw new ReviewImageError("dimensions", 400);
        }
        const encoded = sharp(input, sharpInputOptions()).rotate();
        const bytes = contentType === "image/jpeg"
          ? await encoded.jpeg({ quality: 85 }).toBuffer()
          : contentType === "image/png"
            ? await encoded.png().toBuffer()
            : await encoded.webp({ quality: 85 }).toBuffer();
        const out = await sharp(bytes, sharpInputOptions()).metadata();
        if (out.exif || out.iptc || out.xmp || out.format !== meta.format || !out.width || !out.height) {
          throw new ReviewImageError("malformed", 400);
        }
        return { bytes, contentType, width: out.width, height: out.height };
      } catch (error) {
        throw mapCodecFailure(error);
      }
    },
  };
}
