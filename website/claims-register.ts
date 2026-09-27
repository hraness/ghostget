/**
 * The public claims register at `/claims/` and its `/claims.json` endpoint,
 * both rendered from `verification/claims.json` at build time. The register is
 * parsed with the same strict parser `bun run verify:claims` runs, so the site
 * can only publish a register that CI accepts. The JSON endpoint is the raw
 * checked-in file, byte for byte.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  CLAIMS_REGISTER,
  LAYER_LABELS,
  LAYERS,
  parseClaimsRegister,
  statusLine,
  type Claim,
  type ClaimsRegister,
  type Status,
} from "../scripts/verification-claims";

export const CLAIMS_PAGE_PATH = "/claims/" as const;
/** The `website/dist` output name for the raw register served as JSON. */
export const CLAIMS_JSON_OUTPUT = "claims.json" as const;

/** The register's raw source text plus its parsed value, read once. */
export type ClaimsRegisterSource = Readonly<{
  json: string;
  register: ClaimsRegister;
}>;

export async function readClaimsRegisterSource(root: string): Promise<ClaimsRegisterSource> {
  const json = await readFile(join(root, CLAIMS_REGISTER), "utf8");
  return Object.freeze({
    json,
    register: parseClaimsRegister(JSON.parse(json) as unknown),
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function code(value: string): string {
  return `<code>${escapeHtml(value)}</code>`;
}

/**
 * Register prose uses Markdown inline code. Escape the text first, then turn
 * each balanced `x` pair into a `code` element; an unmatched backtick stays
 * literal rather than corrupting the page.
 */
function inlineText(value: string): string {
  return escapeHtml(value).replaceAll(/`([^`]+)`/gu, "<code>$1</code>");
}

function count(items: number, one: string, many: string): string {
  return `${items.toLocaleString("en-US")} ${items === 1 ? one : many}`;
}

function claimsWithStatus(register: ClaimsRegister, status: Status): readonly Claim[] {
  return register.claims.filter((claim) => claim.status === status);
}

/** The layer-by-status tally table, in the register's own layer order. */
function renderLayerTable(register: ClaimsRegister): string {
  const rows = LAYERS.map((layer) => {
    const inLayer = register.claims.filter((claim) => claim.layer === layer);
    if (inLayer.length === 0) return "";
    const tally = (status: Status): string =>
      String(inLayer.filter((claim) => claim.status === status).length);
    return `<tr><td>${LAYER_LABELS[layer]}</td><td align="right">${tally("evidenced")}</td><td align="right">${tally("planned")}</td><td align="right">${tally("not-verified")}</td></tr>`;
  }).filter((row) => row !== "").join("\n");
  return `<table>
<thead><tr><th scope="col">Kind of check</th><th scope="col" align="right">Evidenced</th><th scope="col" align="right">Planned</th><th scope="col" align="right">Not verified</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
}

function renderScopeList(register: ClaimsRegister): string {
  return `<ul class="guide-list">
${register.notVerified.map((item) => `<li>${inlineText(item)}</li>`).join("\n")}
</ul>`;
}

/** The claims no automated check covers, each named with its own stated gap. */
function renderNotVerifiedClaims(register: ClaimsRegister): string {
  const items = claimsWithStatus(register, "not-verified")
    .map((claim) => `<li id="unverified-${claim.id}"><a href="#claim-${claim.id}">${code(claim.id)}</a>: ${inlineText(claim.statement)} ${claim.notVerified.map(inlineText).join(" ")}</li>`)
    .join("\n");
  return `<h3 id="claims-without-check">Claims without an automated check</h3>
<ul class="guide-list">
${items}
</ul>`;
}

/** Which maintainer guides the register does not derive claims from, and why. */
function renderCoverage(register: ClaimsRegister): string {
  const parts: string[] = [];
  const exemptRules = register.rules.filter((rule) => rule.exempt !== null);
  if (exemptRules.length > 0) {
    const rows = exemptRules.map((rule) =>
      `<tr><td>${code(rule.guide)}</td><td>${inlineText(rule.anchor)}…</td><td>${inlineText(rule.exempt ?? "")}</td></tr>`
    ).join("\n");
    parts.push(
      `<h3 id="claims-exempt-guidelines">Guidelines exempt from the register</h3>`,
      `<p>These guidelines have no claim in the register, and no automated check covers them. The table gives the reason for each.</p>`,
      `<div class="table-scroll" role="region" tabindex="0">
<table>
<thead><tr><th scope="col">Guide</th><th scope="col">Guideline</th><th scope="col">Reason</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>`,
    );
  }
  const blocks = register.guides.flatMap((guide) =>
    guide.managedBlocks.map((block) => ({ block, guide: guide.path }))
  );
  if (blocks.length > 0) {
    const rows = blocks.map(({ block, guide }) =>
      `<tr><td>${code(guide)}</td><td>${code(block.name)}</td><td>${inlineText(block.reason)}</td></tr>`
    ).join("\n");
    parts.push(
      `<h3 id="claims-managed-blocks">Synced guideline blocks with no claims</h3>`,
      `<p>These synced blocks sit inside a scanned guidelines section but have no rules or claims, and no automated check covers them. The register pins each block's text, so any change makes the register check fail until someone reviews it.</p>`,
      `<div class="table-scroll" role="region" tabindex="0">
<table>
<thead><tr><th scope="col">Guide</th><th scope="col">Block</th><th scope="col">Reason</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>`,
    );
  }
  parts.push(
    `<h3 id="claims-excluded-guides">Maintainer guides the register does not cover</h3>`,
    `<ul class="guide-list">
${register.excludedGuides.map((excluded) => `<li>${code(excluded.prefix)}: ${inlineText(excluded.reason)}</li>`).join("\n")}
</ul>`,
  );
  return parts.join("\n");
}

function renderClaim(claim: Claim): string {
  const lines: string[] = [
    `<article class="claim" id="claim-${claim.id}">`,
    `<h4>${code(claim.id)}</h4>`,
    `<p>${inlineText(claim.statement)}</p>`,
    "<ul>",
    `<li>${escapeHtml(statusLine(claim))}</li>`,
    `<li>Source: ${code(claim.source.path)}: “${inlineText(claim.source.quote)}”</li>`,
  ];
  for (const quote of claim.alsoQuotes) {
    lines.push(`<li>Also covers: ${code(quote.path)}: “${inlineText(quote.quote)}”</li>`);
  }
  lines.push(
    `<li>Evidence: ${claim.evidence.length === 0 ? "none" : claim.evidence.map(code).join(", ")}</li>`,
  );
  if (claim.properties.length > 0) {
    lines.push(
      `<li>Property tests: ${claim.properties.map((named) => `${code(named.path)}: “${inlineText(named.test)}”`).join("; ")}</li>`,
    );
  }
  lines.push(
    `<li>Assumptions: ${claim.assumptions.length === 0 ? "none beyond those that apply to the whole register" : claim.assumptions.map(code).join(", ")}</li>`,
  );
  if (claim.notVerified.length === 1) {
    lines.push(`<li>Not verified: ${inlineText(claim.notVerified[0]!)}</li>`);
  } else {
    lines.push("<li>Not verified:<ul>");
    for (const item of claim.notVerified) {
      lines.push(`<li>${inlineText(item)}</li>`);
    }
    lines.push("</ul></li>");
  }
  lines.push("</ul>", "</article>");
  return lines.join("\n");
}

/** Every claim grouped under its register area, in sorted area order. */
function renderClaimsByArea(register: ClaimsRegister): string {
  const areas = [...new Set(register.claims.map((claim) => claim.area))].sort();
  return areas.map((area, index) => {
    const inArea = register.claims.filter((claim) => claim.area === area);
    return `<section class="claims-group" aria-labelledby="claims-area-${index}">
<h3 id="claims-area-${index}">${code(area)} <span class="claims-count">${count(inArea.length, "claim", "claims")}</span></h3>
${inArea.map(renderClaim).join("\n")}
</section>`;
  }).join("\n");
}

function renderAssumptionsTable(register: ClaimsRegister): string {
  const rows = register.assumptions.map((assumption) => {
    const users = register.claims.filter((claim) => claim.assumptions.includes(assumption.id)).length;
    return `<tr><td>${code(assumption.id)}</td><td>${inlineText(assumption.statement)}</td><td align="right">${String(users)}</td></tr>`;
  }).join("\n");
  return `<table>
<thead><tr><th scope="col">Assumption</th><th scope="col">Statement</th><th scope="col" align="right">Claims</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
}

/**
 * The `{{CLAIMS_*}}` values `claims.html` fills. Every key must appear in the
 * template; `build.ts` fails when one is missing or when a claim ever renders
 * an unresolved `{{...}}` of its own.
 */
export function claimsTemplateValues(
  register: ClaimsRegister,
  releaseBlobUrl: (path: string) => string,
): Readonly<Record<string, string>> {
  const claims = register.claims;
  const byStatus = (status: Status): number => claimsWithStatus(register, status).length;
  const exemptRules = register.rules.filter((rule) => rule.exempt !== null);
  const summary = `<p>The register holds ${count(claims.length, "claim", "claims")}: ${byStatus("evidenced").toLocaleString("en-US")} evidenced, ${byStatus("planned").toLocaleString("en-US")} planned, and ${byStatus("not-verified").toLocaleString("en-US")} not verified. It maps ${count(register.rules.length, "guideline", "guidelines")} from ${count(register.guides.length, "guide", "guides")}; ${(register.rules.length - exemptRules.length).toLocaleString("en-US")} list claims and ${exemptRules.length.toLocaleString("en-US")} are exempt.</p>
<p>The register's source file is <a href="${escapeHtml(releaseBlobUrl(CLAIMS_REGISTER))}">${code(CLAIMS_REGISTER)}</a>, the <a href="${escapeHtml(releaseBlobUrl(register.plan))}">verification plan</a> schedules the planned work, and the same file is served from this site as <a href="/claims.json"><code>/claims.json</code></a>.</p>`;
  return Object.freeze({
    "{{CLAIMS_ASSUMPTIONS_TABLE}}": renderAssumptionsTable(register),
    "{{CLAIMS_BY_AREA}}": renderClaimsByArea(register),
    "{{CLAIMS_COVERAGE}}": renderCoverage(register),
    "{{CLAIMS_LAYER_TABLE}}": renderLayerTable(register),
    "{{CLAIMS_NOT_VERIFIED_CLAIMS}}": renderNotVerifiedClaims(register),
    "{{CLAIMS_SCOPE_LIST}}": renderScopeList(register),
    "{{CLAIMS_SUMMARY}}": summary,
  });
}
