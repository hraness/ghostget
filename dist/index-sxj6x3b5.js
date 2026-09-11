// @bun
// src/article-draft-images.ts
import { constants } from "fs";
import { open } from "fs/promises";
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function fileInput(value, label) {
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "kind,reference" || value.kind !== "file" || typeof value.reference !== "string" || value.reference.length < 1)
    throw new Error(`${label} must be one exact plan-bound file`);
  return Object.freeze({ kind: "file", reference: value.reference });
}
function articleDraftImageFileInput(value, label) {
  return fileInput(value, label);
}
function articleDraftImageFileInputs(value, maximumImages) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximumImages) {
    throw new Error(`input.inline_images must contain 1-${maximumImages} ordered plan-bound files`);
  }
  return Object.freeze(value.map((item, index) => fileInput(item, `input.inline_images[${index}]`)));
}
function sniffImage(bytes, label) {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10)
    return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP")
    return "image/webp";
  throw new Error(`${label} must contain exact JPEG, PNG, or WebP bytes`);
}
function filename(index, mediaType, prefix) {
  const extension = mediaType === "image/jpeg" ? "jpg" : mediaType === "image/png" ? "png" : "webp";
  return `${prefix}-${index + 1}.${extension}`;
}
async function readImage(path, index, maximumBytes, label, filenamePrefix, operationDeadline) {
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const handle = operationDeadline === undefined ? await open(path, constants.O_RDONLY | noFollow) : await operationDeadline.run(() => open(path, constants.O_RDONLY | noFollow), "authenticated web operation deadline");
  try {
    const before = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (!before.isFile() || before.size < 1 || before.size > maximumBytes) {
      throw new Error(`${label} must be a regular file no larger than ${maximumBytes} bytes`);
    }
    const raw = operationDeadline === undefined ? await handle.readFile() : await operationDeadline.run(() => handle.readFile(), "authenticated web operation deadline");
    const after = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || raw.byteLength !== before.size)
      throw new Error(`${label} changed while it was materialized`);
    const bytes = new Uint8Array(raw);
    const mediaType = sniffImage(bytes, label);
    return Object.freeze({
      bytes,
      mediaType,
      filename: filename(index, mediaType, filenamePrefix)
    });
  } finally {
    await handle.close();
  }
}
async function materializeImages(files, fileResolver, options) {
  if (fileResolver === undefined) {
    throw new Error(`${options.inputLabel} requires the plan-bound file resolver`);
  }
  const paths = options.operationDeadline === undefined ? await fileResolver(files) : await options.operationDeadline.run(() => fileResolver(files), "authenticated web operation deadline");
  options.operationDeadline?.throwIfUnavailable("authenticated web operation deadline");
  if (paths.length !== files.length || paths.some((path) => typeof path !== "string" || path.length < 1))
    throw new Error(`${options.inputLabel} resolver did not return every exact plan-bound path`);
  const images = [];
  for (const [index, path] of paths.entries()) {
    images.push(await readImage(path, index, options.maximumBytes, `${options.inputLabel}[${index}]`, options.filenamePrefix, options.operationDeadline));
  }
  return Object.freeze(images);
}
async function materializeArticleDraftImage(value, fileResolver, options) {
  const files = Object.freeze([articleDraftImageFileInput(value, options.inputLabel)]);
  const images = await materializeImages(files, fileResolver, options);
  const image = images[0];
  if (image === undefined)
    throw new Error(`${options.inputLabel} materialization omitted its exact file`);
  return image;
}
async function materializeArticleDraftImages(value, fileResolver, options) {
  const files = articleDraftImageFileInputs(value, options.maximumImages);
  return materializeImages(files, fileResolver, {
    maximumBytes: options.maximumBytes,
    inputLabel: "input.inline_images",
    filenamePrefix: "inline-image",
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline }
  });
}

export { articleDraftImageFileInput, articleDraftImageFileInputs, materializeArticleDraftImage, materializeArticleDraftImages };
