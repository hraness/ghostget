// @bun
// src/providers/x-image-provenance.ts
import { deflateSync, inflateSync } from "zlib";
var IMAGE_PROVENANCE_MARKER = /c2pa|cabx|trainedalgorithmic|digitalsourcetype/iu;
var PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
var MAX_PNG_DIMENSION = 16384;
var MAX_PNG_PIXELS = 16384 * 16384;
var CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0;index < 256; index += 1) {
    let value = index;
    for (let bit = 0;bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 3988292384 ^ value >>> 1 : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();
function pngCrc(bytes) {
  let crc = 4294967295;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 255] ^ crc >>> 8;
  }
  return (crc ^ 4294967295) >>> 0;
}
function readUint32(bytes, offset) {
  return ((bytes[offset] ?? 0) << 24 | (bytes[offset + 1] ?? 0) << 16 | (bytes[offset + 2] ?? 0) << 8 | (bytes[offset + 3] ?? 0)) >>> 0;
}
function writeUint32(bytes, offset, value) {
  bytes[offset] = value >>> 24 & 255;
  bytes[offset + 1] = value >>> 16 & 255;
  bytes[offset + 2] = value >>> 8 & 255;
  bytes[offset + 3] = value & 255;
}
function concatBytes(parts) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}
function asciiBytes(value) {
  const output = new Uint8Array(value.length);
  for (let index = 0;index < value.length; index += 1) {
    output[index] = value.charCodeAt(index) & 255;
  }
  return output;
}
function parsePngChunks(bytes) {
  if (bytes.byteLength < PNG_SIGNATURE.byteLength + 12) {
    throw new Error("X PNG attachment is not a complete PNG");
  }
  for (const [index, expected] of PNG_SIGNATURE.entries()) {
    if (bytes[index] !== expected)
      throw new Error("X PNG attachment is not a complete PNG");
  }
  const chunks = [];
  let offset = PNG_SIGNATURE.byteLength;
  let sawIend = false;
  while (offset + 12 <= bytes.byteLength) {
    const length = readUint32(bytes, offset);
    if (length > bytes.byteLength - offset - 12) {
      throw new Error("X PNG attachment contained a truncated chunk");
    }
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = String.fromCharCode(...typeBytes);
    if (!/^[A-Za-z]{4}$/u.test(type))
      throw new Error("X PNG attachment contained an invalid chunk type");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = readUint32(bytes, offset + 8 + length);
    if (pngCrc(concatBytes([typeBytes, data])) !== expectedCrc) {
      throw new Error("X PNG attachment failed its chunk checksum");
    }
    chunks.push({ type, data: new Uint8Array(data) });
    offset += 12 + length;
    if (type === "IEND") {
      sawIend = true;
      break;
    }
  }
  if (!sawIend)
    throw new Error("X PNG attachment omitted IEND");
  if (chunks[0]?.type !== "IHDR")
    throw new Error("X PNG attachment omitted IHDR");
  return Object.freeze(chunks);
}
function writePngChunk(type, data) {
  const typeBytes = asciiBytes(type);
  const output = new Uint8Array(12 + data.byteLength);
  writeUint32(output, 0, data.byteLength);
  output.set(typeBytes, 4);
  output.set(data, 8);
  writeUint32(output, 8 + data.byteLength, pngCrc(concatBytes([typeBytes, data])));
  return output;
}
function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpLeft = Math.abs(estimate - upLeft);
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft)
    return left;
  if (distanceUp <= distanceUpLeft)
    return up;
  return upLeft;
}
function bytesPerPixel(bitDepth, colorType) {
  const samples = colorType === 0 || colorType === 3 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : 4;
  return Math.max(1, Math.ceil(samples * bitDepth / 8));
}
function scanlineWidth(width, bitDepth, colorType) {
  const samples = colorType === 0 || colorType === 3 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : 4;
  return Math.ceil(width * samples * bitDepth / 8);
}
function unfilter(filtered, width, height, bitDepth, colorType) {
  const bpp = bytesPerPixel(bitDepth, colorType);
  const stride = scanlineWidth(width, bitDepth, colorType);
  const expected = height * (stride + 1);
  if (filtered.byteLength !== expected) {
    throw new Error("X PNG attachment scanlines did not match IHDR");
  }
  const raw = new Uint8Array(height * stride);
  for (let row = 0;row < height; row += 1) {
    const filter = filtered[row * (stride + 1)] ?? 0;
    const source = filtered.subarray(row * (stride + 1) + 1, row * (stride + 1) + 1 + stride);
    const destination = raw.subarray(row * stride, row * stride + stride);
    const prior = row === 0 ? null : raw.subarray((row - 1) * stride, row * stride);
    for (let column = 0;column < stride; column += 1) {
      const sample = source[column] ?? 0;
      const left = column >= bpp ? destination[column - bpp] ?? 0 : 0;
      const up = prior?.[column] ?? 0;
      const upLeft = prior !== null && column >= bpp ? prior[column - bpp] ?? 0 : 0;
      const reconstructed = filter === 0 ? sample : filter === 1 ? sample + left & 255 : filter === 2 ? sample + up & 255 : filter === 3 ? sample + Math.floor((left + up) / 2) & 255 : filter === 4 ? sample + paethPredictor(left, up, upLeft) & 255 : null;
      if (reconstructed === null)
        throw new Error("X PNG attachment used an unsupported filter");
      destination[column] = reconstructed;
    }
  }
  return raw;
}
function sampleChannel(packed, pixelIndex, channel, channels, bitDepth) {
  if (bitDepth === 8)
    return packed[pixelIndex * channels + channel] ?? 0;
  if (bitDepth === 16) {
    const offset = (pixelIndex * channels + channel) * 2;
    return packed[offset] ?? 0;
  }
  const bitsPerPixel = channels * bitDepth;
  const bitOffset = pixelIndex * bitsPerPixel + channel * bitDepth;
  const byteIndex = Math.floor(bitOffset / 8);
  const shift = 8 - bitDepth - bitOffset % 8;
  const mask = (1 << bitDepth) - 1;
  const value = (packed[byteIndex] ?? 0) >> shift & mask;
  return bitDepth === 1 ? value * 255 : Math.round(value * 255 / mask);
}
function expandToRgba(packed, width, height, bitDepth, colorType, palette, transparency) {
  const rgba = new Uint8Array(width * height * 4);
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
  for (let pixel = 0;pixel < width * height; pixel += 1) {
    const dest = pixel * 4;
    if (colorType === 3) {
      const index = sampleChannel(packed, pixel, 0, 1, bitDepth);
      rgba[dest] = palette?.[index * 3] ?? 0;
      rgba[dest + 1] = palette?.[index * 3 + 1] ?? 0;
      rgba[dest + 2] = palette?.[index * 3 + 2] ?? 0;
      rgba[dest + 3] = transparency?.[index] ?? 255;
      continue;
    }
    const red = sampleChannel(packed, pixel, 0, channels, bitDepth);
    const green = colorType === 0 || colorType === 4 ? red : sampleChannel(packed, pixel, 1, channels, bitDepth);
    const blue = colorType === 0 || colorType === 4 ? red : sampleChannel(packed, pixel, 2, channels, bitDepth);
    const alpha = colorType === 4 ? sampleChannel(packed, pixel, 1, channels, bitDepth) : colorType === 6 ? sampleChannel(packed, pixel, 3, channels, bitDepth) : transparency === null ? 255 : colorType === 0 ? red === (transparency[0] ?? -1) ? 0 : 255 : red === (transparency[1] ?? -1) && green === (transparency[3] ?? -1) && blue === (transparency[5] ?? -1) ? 0 : 255;
    rgba[dest] = red;
    rgba[dest + 1] = green;
    rgba[dest + 2] = blue;
    rgba[dest + 3] = alpha;
  }
  return rgba;
}
var ADAM7 = [
  { x: 0, y: 0, dx: 8, dy: 8 },
  { x: 4, y: 0, dx: 8, dy: 8 },
  { x: 0, y: 4, dx: 4, dy: 8 },
  { x: 2, y: 0, dx: 4, dy: 4 },
  { x: 0, y: 2, dx: 2, dy: 4 },
  { x: 1, y: 0, dx: 2, dy: 2 },
  { x: 0, y: 1, dx: 1, dy: 2 }
];
function passSize(width, height, pass) {
  return {
    width: pass.x >= width ? 0 : Math.floor((width - pass.x - 1) / pass.dx) + 1,
    height: pass.y >= height ? 0 : Math.floor((height - pass.y - 1) / pass.dy) + 1
  };
}
function decodePngToRgba(bytes) {
  const chunks = parsePngChunks(bytes);
  const ihdr = chunks[0].data;
  if (ihdr.byteLength !== 13)
    throw new Error("X PNG attachment IHDR was invalid");
  const width = readUint32(ihdr, 0);
  const height = readUint32(ihdr, 4);
  const bitDepth = ihdr[8] ?? 0;
  const colorType = ihdr[9] ?? 0;
  const compression = ihdr[10] ?? 1;
  const filter = ihdr[11] ?? 1;
  const interlace = ihdr[12] ?? 1;
  if (width < 1 || height < 1 || width > MAX_PNG_DIMENSION || height > MAX_PNG_DIMENSION || width * height > MAX_PNG_PIXELS) {
    throw new Error("X PNG attachment dimensions escaped the reviewed bound");
  }
  if (compression !== 0 || filter !== 0 || interlace !== 0 && interlace !== 1) {
    throw new Error("X PNG attachment used an unsupported IHDR method");
  }
  if (![0, 2, 3, 4, 6].includes(colorType)) {
    throw new Error("X PNG attachment used an unsupported color type");
  }
  if (colorType === 3 && ![1, 2, 4, 8].includes(bitDepth) || colorType !== 3 && ![8, 16].includes(bitDepth) && !(colorType === 0 && [1, 2, 4, 8, 16].includes(bitDepth))) {
    throw new Error("X PNG attachment used an unsupported bit depth");
  }
  let palette = null;
  let transparency = null;
  const idat = [];
  for (const chunk of chunks.slice(1)) {
    if (chunk.type === "PLTE")
      palette = chunk.data;
    else if (chunk.type === "tRNS")
      transparency = chunk.data;
    else if (chunk.type === "IDAT")
      idat.push(chunk.data);
  }
  if (colorType === 3 && palette === null)
    throw new Error("X PNG attachment omitted PLTE");
  if (idat.length === 0)
    throw new Error("X PNG attachment omitted IDAT");
  let inflated;
  try {
    inflated = new Uint8Array(inflateSync(Buffer.concat(idat.map((part) => Buffer.from(part)))));
  } catch {
    throw new Error("X PNG attachment IDAT could not be inflated");
  }
  if (interlace === 0) {
    const raw = unfilter(inflated, width, height, bitDepth, colorType);
    return {
      width,
      height,
      rgba: expandToRgba(raw, width, height, bitDepth, colorType, palette, transparency)
    };
  }
  const rgba = new Uint8Array(width * height * 4);
  let offset = 0;
  for (const pass of ADAM7) {
    const size = passSize(width, height, pass);
    if (size.width === 0 || size.height === 0)
      continue;
    const expected = size.height * (scanlineWidth(size.width, bitDepth, colorType) + 1);
    const passBytes = inflated.subarray(offset, offset + expected);
    if (passBytes.byteLength !== expected) {
      throw new Error("X PNG attachment interlacing did not match IHDR");
    }
    const raw = unfilter(passBytes, size.width, size.height, bitDepth, colorType);
    const passRgba = expandToRgba(raw, size.width, size.height, bitDepth, colorType, palette, transparency);
    for (let row = 0;row < size.height; row += 1) {
      for (let column = 0;column < size.width; column += 1) {
        const source = (row * size.width + column) * 4;
        const destX = pass.x + column * pass.dx;
        const destY = pass.y + row * pass.dy;
        rgba.set(passRgba.subarray(source, source + 4), (destY * width + destX) * 4);
      }
    }
    offset += expected;
  }
  if (offset !== inflated.byteLength) {
    throw new Error("X PNG attachment interlacing left unread IDAT");
  }
  return { width, height, rgba };
}
function encodePixelsOnlyPng(input) {
  if (input.width < 1 || input.height < 1 || input.width > MAX_PNG_DIMENSION || input.height > MAX_PNG_DIMENSION || input.rgba.byteLength !== input.width * input.height * 4) {
    throw new Error("X PNG encoder received an invalid pixel buffer");
  }
  const ihdr = new Uint8Array(13);
  writeUint32(ihdr, 0, input.width);
  writeUint32(ihdr, 4, input.height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = input.width * 4;
  const filtered = new Uint8Array(input.height * (stride + 1));
  for (let row = 0;row < input.height; row += 1) {
    filtered[row * (stride + 1)] = 0;
    filtered.set(input.rgba.subarray(row * stride, row * stride + stride), row * (stride + 1) + 1);
  }
  const idat = new Uint8Array(deflateSync(Buffer.from(filtered), { level: 9 }));
  return concatBytes([
    PNG_SIGNATURE,
    writePngChunk("IHDR", ihdr),
    writePngChunk("IDAT", idat),
    writePngChunk("IEND", new Uint8Array)
  ]);
}
function pngChunkTypes(bytes) {
  return parsePngChunks(bytes).map((chunk) => chunk.type);
}
function reencodePixelsOnlyPng(bytes) {
  const decoded = decodePngToRgba(bytes);
  return encodePixelsOnlyPng(decoded);
}
function stripJpegProvenance(bytes) {
  if (bytes.byteLength < 4 || bytes[0] !== 255 || bytes[1] !== 216) {
    throw new Error("X JPEG attachment is not a complete JPEG");
  }
  const kept = [255, 216];
  let offset = 2;
  while (offset + 1 < bytes.byteLength) {
    if (bytes[offset] !== 255) {
      throw new Error("X JPEG attachment left its marker structure");
    }
    let marker = bytes[offset + 1] ?? 0;
    while (marker === 255 && offset + 2 < bytes.byteLength) {
      offset += 1;
      marker = bytes[offset + 1] ?? 0;
    }
    if (marker === 217) {
      kept.push(255, 217);
      break;
    }
    if (marker === 218) {
      kept.push(255, 218);
      offset += 2;
      const remaining = bytes.subarray(offset);
      const eoi = remaining.findIndex((value, index) => value === 255 && remaining[index + 1] === 217 && remaining[index - 1] !== 0);
      if (eoi < 0)
        throw new Error("X JPEG attachment omitted EOI");
      kept.push(...remaining.subarray(0, eoi), 255, 217);
      break;
    }
    if (offset + 4 > bytes.byteLength)
      throw new Error("X JPEG attachment contained a truncated marker");
    const length = (bytes[offset + 2] ?? 0) << 8 | (bytes[offset + 3] ?? 0);
    if (length < 2 || offset + 2 + length > bytes.byteLength) {
      throw new Error("X JPEG attachment contained a truncated marker");
    }
    const drop = marker >= 224 && marker <= 239 || marker === 254;
    if (!drop)
      kept.push(...bytes.subarray(offset, offset + 2 + length));
    offset += 2 + length;
  }
  if (kept.length < 4 || kept[kept.length - 2] !== 255 || kept[kept.length - 1] !== 217) {
    throw new Error("X JPEG attachment omitted EOI");
  }
  return Uint8Array.from(kept);
}
function imageBytesContainProvenance(bytes) {
  return IMAGE_PROVENANCE_MARKER.test(Buffer.from(bytes).toString("latin1"));
}
function rejectImageProvenanceMarkers(bytes, label) {
  if (imageBytesContainProvenance(bytes)) {
    throw new Error(`${label} still contained provenance after pixel-only re-encoding`);
  }
}
function scrubXUploadImage(bytes, mediaType) {
  const scrubbed = mediaType === "image/png" ? reencodePixelsOnlyPng(bytes) : stripJpegProvenance(bytes);
  rejectImageProvenanceMarkers(scrubbed, "X upload image");
  if (mediaType === "image/png") {
    const types = pngChunkTypes(scrubbed);
    if (types.some((type) => type !== "IHDR" && type !== "IDAT" && type !== "IEND")) {
      throw new Error("X upload image retained ancillary PNG chunks");
    }
  }
  return scrubbed;
}
function rejectGifProvenanceMarkers(bytes) {
  if (imageBytesContainProvenance(bytes)) {
    throw new Error("X GIF attachment contained provenance markers");
  }
}

// src/providers/x-made-with-ai.ts
var X_UNLABELED_COPY_POLICY_ERROR = "X applied Made with AI label; publish failed for unlabeled-copy policy";
var DISCLOSURE_KEY = /^(made_with_ai|content_disclosure|ai_generated_disclosure|ai_generated|is_ai_generated|has_ai_generated_media|ai_highlight(?:_label|_info)?|grok_generated|trained_algorithmic_media|digital_source_type)$/iu;
var DISCLOSURE_TEXT = /made with (?:ai|grok)|ai-generated content|trainedalgorithmicmedia|digitalsourcetype/iu;
var AUTHOR_TEXT_KEYS = new Set([
  "full_text",
  "description",
  "screen_name",
  "location",
  "username"
]);

class XUnlabeledCopyPolicyError extends Error {
  post;
  constructor(post) {
    super(X_UNLABELED_COPY_POLICY_ERROR);
    this.name = "XUnlabeledCopyPolicyError";
    this.post = post;
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function skipAuthorText(key, ancestors) {
  if (AUTHOR_TEXT_KEYS.has(key))
    return true;
  if (key === "name") {
    return ancestors.includes("user_results") || ancestors.includes("core") || ancestors.includes("user");
  }
  if (key !== "text")
    return false;
  return ancestors.includes("legacy") || ancestors.includes("note_tweet");
}
function annotationLooksLikeAi(value) {
  if (typeof value === "string")
    return DISCLOSURE_TEXT.test(value) || DISCLOSURE_KEY.test(value);
  if (!isRecord(value))
    return false;
  for (const [key, item] of Object.entries(value)) {
    if (DISCLOSURE_KEY.test(key))
      return true;
    if (typeof item === "string" && (DISCLOSURE_TEXT.test(item) || DISCLOSURE_KEY.test(item))) {
      return true;
    }
  }
  return false;
}
function walkTweet(value, ancestors) {
  if (typeof value === "string") {
    const key = ancestors.at(-1) ?? "";
    if (skipAuthorText(key, ancestors.slice(0, -1)))
      return false;
    return DISCLOSURE_TEXT.test(value) || DISCLOSURE_KEY.test(value);
  }
  if (typeof value === "boolean") {
    const key = ancestors.at(-1) ?? "";
    return value === true && DISCLOSURE_KEY.test(key);
  }
  if (Array.isArray(value)) {
    const key = ancestors.at(-1) ?? "";
    if ((key === "semantic_annotations" || key === "semantic_annotation_ids") && value.some(annotationLooksLikeAi)) {
      return true;
    }
    return value.some((item) => walkTweet(item, ancestors));
  }
  if (!isRecord(value))
    return false;
  for (const [key, item] of Object.entries(value)) {
    if (DISCLOSURE_KEY.test(key)) {
      if (item === true)
        return true;
      if (typeof item === "string" && item.length > 0 && item !== "false")
        return true;
      if (isRecord(item) || Array.isArray(item)) {
        if (walkTweet(item, [...ancestors, key]))
          return true;
      }
      continue;
    }
    if (walkTweet(item, [...ancestors, key]))
      return true;
  }
  return false;
}
function xTweetHasMadeWithAiLabel(value) {
  return walkTweet(value, []);
}
function rejectXTweetMadeWithAiLabel(value, post) {
  if (xTweetHasMadeWithAiLabel(value)) {
    throw new XUnlabeledCopyPolicyError(post);
  }
}

export { scrubXUploadImage, rejectGifProvenanceMarkers, X_UNLABELED_COPY_POLICY_ERROR, XUnlabeledCopyPolicyError, rejectXTweetMadeWithAiLabel };
