import { describe, expect, test } from "bun:test";

import { assertLinkedInWebR1RequestAllowed } from "./linkedin-web";
import {
  LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID,
  assertLinkedInContactInfoRequest,
  linkedInContactInfoPath,
  linkedInContactInfoTarget,
  linkedInContactInfoUrl,
  projectLinkedInContactInfo,
  projectLinkedInProfileContactBinding,
} from "./linkedin-web-contact";

const VIEWER = "urn:li:fsd_profile:123456789";
const PROFILE_URN = "urn:li:fsd_profile:ACoAAFixtureProfile";
const PROFILE_URL = "https://www.linkedin.com/in/example/";
const OBSERVED_AT = "2026-09-08T18:00:00.000Z";
const CONNECTED_AT_MS = Date.parse("2023-10-03T00:00:00.000Z");

function bootstrapHtml(value: unknown): string {
  const encoded = JSON.stringify(value).replace(/[&<>"=\\]/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "=": "&#61;",
    "\\": "&#92;",
  })[character] ?? character);
  return `<html><body><code style="display: none" id="bpr-guid-123">${encoded}</code></body></html>`;
}

function profileHtml(
  distance: string | number = "DISTANCE_1",
  options: {
    readonly vanity?: string;
    readonly urn?: string;
  } = {},
): string {
  return bootstrapHtml({
    $type: "com.linkedin.voyager.identity.profile.Profile",
    publicIdentifier: options.vanity ?? "example",
    entityUrn: options.urn ?? PROFILE_URN,
    memberDistance: distance,
  });
}

function contactPayload(overrides: Readonly<Record<string, unknown>> = {}): unknown {
  return {
    $type: "com.linkedin.voyager.identity.profile.ProfileContactInfo",
    emailAddress: "connection@example.test",
    connectedAt: CONNECTED_AT_MS,
    ...overrides,
  };
}

describe("LinkedIn contacts.read target and request binding", () => {
  test("normalizes one exact public connection profile URL", () => {
    expect(linkedInContactInfoTarget("https://www.linkedin.com/in/example")).toEqual({
      slug: "example",
      url: PROFILE_URL,
    });
    expect(linkedInContactInfoPath("example")).toBe(
      "/voyager/api/identity/profiles/example/profileContactInfo",
    );
    expect(linkedInContactInfoUrl("example").href).toBe(
      "https://www.linkedin.com/voyager/api/identity/profiles/example/profileContactInfo",
    );
    expect(LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID).toBe(
      "com.linkedin.sdui.flagshipnav.profile.ProfileContactDetailsOverlay",
    );
  });

  test("allows only the reviewed profile page and profileContactInfo GET routes", () => {
    expect(() => assertLinkedInContactInfoRequest({
      method: "GET",
      url: PROFILE_URL,
    })).not.toThrow();
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "GET",
      url: PROFILE_URL,
    })).not.toThrow();
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "GET",
      url: linkedInContactInfoUrl("example"),
    })).not.toThrow();
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "POST",
      url: PROFILE_URL,
    })).toThrow("LinkedIn contact-info reads require GET");
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "GET",
      url: "https://www.linkedin.com/in/example/?trk=unsafe",
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "GET",
      url: "https://www.linkedin.com/voyager/api/identity/profiles/example/contactInfo",
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "GET",
      url: "https://www.linkedin.com/flagship-web/rsc-action/actions/navigation?screenId=com.linkedin.sdui.flagshipnav.profile.ProfileContactDetailsOverlay",
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
  });
});

describe("LinkedIn contacts.read 1st-degree binding", () => {
  test("binds DISTANCE_1 to the requested vanity", () => {
    expect(projectLinkedInProfileContactBinding({
      profileHtml: profileHtml(),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toEqual({
      vanity: "example",
      profileUrn: PROFILE_URN,
      url: PROFILE_URL,
      relationship: "first-degree",
    });
  });

  test("refuses the signed-in self profile", () => {
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: profileHtml("SELF", { urn: VIEWER }),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("use profiles.read for the signed-in self profile");
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: profileHtml("DISTANCE_1", { urn: VIEWER }),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("use profiles.read for the signed-in self profile");
  });

  test("fails closed when LinkedIn hides Contact info from a non-1st viewer", () => {
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: profileHtml("DISTANCE_2"),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("not a 1st-degree connection");
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: profileHtml("DISTANCE_3"),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("not a 1st-degree connection");
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: profileHtml("OUT_OF_NETWORK"),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("not a 1st-degree connection");
  });
});

describe("LinkedIn contacts.read Contact-info projection", () => {
  test("projects Voyager email and connected-since without inventing hidden fields", () => {
    expect(projectLinkedInContactInfo({
      profileHtml: profileHtml(),
      contactPayload: contactPayload(),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
      observedAt: OBSERVED_AT,
    })).toEqual({
      schemaVersion: 1,
      provider: "linkedin",
      profile: {
        vanity: "example",
        profileUrn: PROFILE_URN,
        url: PROFILE_URL,
        relationship: "first-degree",
      },
      viewer: { subject: VIEWER },
      observedAt: OBSERVED_AT,
      completeness: "complete",
      contact: {
        email: "connection@example.test",
        profileUrl: PROFILE_URL,
        connectedSince: "2023-10-03",
        phones: [],
        websites: [],
        birthday: null,
      },
    });
  });

  test("projects labeled overlay rows including phone, website, and birthday when present", () => {
    expect(projectLinkedInContactInfo({
      profileHtml: profileHtml(),
      contactPayload: {
        fields: [
          { label: "Email", value: "connection@example.test" },
          { label: "Connected since", value: "Oct 3, 2023" },
          { label: "Phone", value: "+1 212 555 0100" },
          { label: "Website", value: "https://example.test/" },
          { label: "Birthday", value: { month: 4, day: 9 } },
        ],
      },
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
      observedAt: OBSERVED_AT,
    })).toEqual({
      schemaVersion: 1,
      provider: "linkedin",
      profile: {
        vanity: "example",
        profileUrn: PROFILE_URN,
        url: PROFILE_URL,
        relationship: "first-degree",
      },
      viewer: { subject: VIEWER },
      observedAt: OBSERVED_AT,
      completeness: "complete",
      contact: {
        email: "connection@example.test",
        profileUrl: PROFILE_URL,
        connectedSince: "2023-10-03",
        phones: ["+1 212 555 0100"],
        websites: ["https://example.test/"],
        birthday: "04-09",
      },
    });
  });

  test("marks completeness partial when LinkedIn omitted every optional contact field", () => {
    expect(projectLinkedInContactInfo({
      profileHtml: profileHtml(),
      contactPayload: {
        $type: "com.linkedin.voyager.identity.profile.ProfileContactInfo",
      },
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
      observedAt: OBSERVED_AT,
    })).toMatchObject({
      completeness: "partial",
      contact: {
        email: null,
        profileUrl: PROFILE_URL,
        connectedSince: null,
        phones: [],
        websites: [],
        birthday: null,
      },
    });
  });

  test("rejects ambiguous emails and extra live-looking addresses", () => {
    expect(() => projectLinkedInContactInfo({
      profileHtml: profileHtml(),
      contactPayload: [
        contactPayload(),
        { $type: "com.linkedin.voyager.identity.profile.ProfileContactInfo", emailAddress: "other@example.test" },
      ],
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
      observedAt: OBSERVED_AT,
    })).toThrow("LinkedIn contact-info email was ambiguous");
    const projected = projectLinkedInContactInfo({
      profileHtml: profileHtml(),
      contactPayload: contactPayload(),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
      observedAt: OBSERVED_AT,
    });
    expect(JSON.stringify(projected)).not.toContain("tess.bloch");
    expect(JSON.stringify(projected)).not.toContain("@gmail.com");
  });
});
