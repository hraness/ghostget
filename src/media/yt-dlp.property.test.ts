import { expect, test } from "bun:test";
import fc from "fast-check";
import { assertProperty } from "../test-support";
import type { CaptureMode } from "./args";
import {
  buildYtDlpCaptureArgv,
  isSafeYtDlpCaptureExtension,
  parseYtDlpCaptureIdentity,
} from "./yt-dlp";

const CAPTURE_IDENTITY_PREFIX = "WRENCH_MEDIA_CAPTURE_IDENTITY_V1\t";
const FIELD_PATTERN = /%\(([^)|]+)\|([^)]*)\)j/gu;

const modeArbitrary = fc.constantFrom<CaptureMode>("archive", "audio", "video", "transcript");
const identityArbitrary = fc.stringMatching(/^[A-Za-z0-9_-]{1,64}$/u);
const safeExtensionArbitrary = fc.stringMatching(/^[a-z0-9]{1,16}$/u)
  .filter((value) => isSafeYtDlpCaptureExtension(value));

function printTemplate(mode: CaptureMode): string {
  const argv = buildYtDlpCaptureArgv({
    executable: "yt-dlp",
    url: "https://example.com/video",
    mode,
    captureDirectory: "/tmp/item/data/capture",
    temporaryDirectory: "/tmp/item/.tmp",
    caption: mode === "transcript" ? { source: "manual", language: "en" } : null,
    persistDescriptiveMetadata: true,
    inheritConfig: false,
  });
  const print = argv[argv.indexOf("--print") + 1] ?? "";
  return print.slice(print.indexOf(":") + 1);
}

/**
 * Models yt-dlp's `%(a,b|default)j` field: the first present alternative is
 * JSON-converted, and an absent field emits the default text raw.
 */
function renderLikeYtDlp(template: string, info: Readonly<Record<string, string>>): string {
  return template.replace(FIELD_PATTERN, (_match, fields: string, fallback: string) => {
    for (const field of fields.split(",")) {
      const value = info[field];
      if (value !== undefined) return JSON.stringify(value);
    }
    return fallback;
  });
}

test("property: the capture template renders valid JSON for every present or absent field", () => {
  assertProperty(
    fc.property(
      modeArbitrary,
      fc.option(fc.string({ maxLength: 64 }), { nil: undefined }),
      fc.option(fc.string({ maxLength: 64 }), { nil: undefined }),
      fc.option(fc.string({ maxLength: 64 }), { nil: undefined }),
      fc.option(fc.string({ maxLength: 16 }), { nil: undefined }),
      (mode, extractorKey, id, ext, extractor) => {
        const info: Record<string, string> = {};
        if (extractorKey !== undefined) info["extractor_key"] = extractorKey;
        if (extractor !== undefined) info["extractor"] = extractor;
        if (id !== undefined) info["id"] = id;
        if (ext !== undefined) info["ext"] = ext;
        const rendered = renderLikeYtDlp(printTemplate(mode), info);
        expect(rendered.startsWith(CAPTURE_IDENTITY_PREFIX)).toBeTrue();
        const value: unknown = JSON.parse(rendered.slice(CAPTURE_IDENTITY_PREFIX.length));
        expect(value).toEqual({
          extractor: extractorKey ?? extractor ?? null,
          id: id ?? null,
          ext: ext ?? null,
        });
      },
    ),
  );
});

test("property: a rendered identity parses exactly when its fields are admitted for the mode", () => {
  assertProperty(
    fc.property(
      modeArbitrary,
      fc.option(identityArbitrary, { nil: undefined }),
      fc.option(identityArbitrary, { nil: undefined }),
      fc.option(fc.oneof(safeExtensionArbitrary, fc.string({ maxLength: 20 })), { nil: undefined }),
      (mode, extractor, id, ext) => {
        const info: Record<string, string> = {};
        if (extractor !== undefined) info["extractor_key"] = extractor;
        if (id !== undefined) info["id"] = id;
        if (ext !== undefined) info["ext"] = ext;
        const stdout = `${renderLikeYtDlp(printTemplate(mode), info)}\n`;
        const admitted = extractor !== undefined
          && id !== undefined
          && (ext === undefined ? mode === "transcript" : isSafeYtDlpCaptureExtension(ext));
        const result = parseYtDlpCaptureIdentity(stdout, mode);
        if (admitted) {
          expect(result).toEqual({ ok: true, identity: { extractor, id, ext: ext ?? null } });
        } else {
          expect(result).toEqual({
            ok: false,
            diagnostic: "yt-dlp capture returned a malformed identity record",
          });
        }
      },
    ),
  );
});

test("property: a media mode never yields an identity without a safe extension", () => {
  assertProperty(
    fc.property(
      fc.constantFrom<CaptureMode>("archive", "audio", "video"),
      fc.jsonValue(),
      (mode, ext) => {
        const stdout = `${CAPTURE_IDENTITY_PREFIX}${JSON.stringify({ extractor: "Generic", id: "item", ext })}`;
        const result = parseYtDlpCaptureIdentity(stdout, mode);
        expect(result.ok).toBe(isSafeYtDlpCaptureExtension(ext));
        if (result.ok) expect(isSafeYtDlpCaptureExtension(result.identity.ext)).toBeTrue();
      },
    ),
  );
});
