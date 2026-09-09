import { describe, expect, test } from "bun:test";

import { encodeRestliV2Value, assertLinkedInWebR1RequestAllowed } from "./linkedin-web";
import {
  LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID,
  LINKEDIN_PROFILE_CONTACT_INFO_QUERY_NAME,
  assertLinkedInContactInfoRequest,
  buildLinkedInProfileContactInfoGraphqlPath,
  linkedInContactInfoTarget,
  linkedInProfileContactInfoGraphqlUrl,
  projectLinkedInContactInfo,
  projectLinkedInEmbeddedContactFields,
  projectLinkedInProfileContactBinding,
  resolveLinkedInProfileContactInfoQueryId,
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

function comoHtml(value: unknown): string {
  return `<html><body><script>window.__como_rehydration__=${JSON.stringify(value)}</script></body></html>`;
}

const CONTACT_QUERY_ID =
  "voyagerIdentityDashProfileContactInfo.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const GRAPHQL_PATH = buildLinkedInProfileContactInfoGraphqlPath({
  profileUrn: PROFILE_URN,
});
const GRAPHQL_URL = linkedInProfileContactInfoGraphqlUrl({
  profileUrn: PROFILE_URN,
});

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
    expect(GRAPHQL_PATH).toBe(
      `/voyager/api/graphql?includeWebMetadata=true&queryName=${LINKEDIN_PROFILE_CONTACT_INFO_QUERY_NAME}&variables=(profileUrn:${encodeRestliV2Value(PROFILE_URN)})`,
    );
    expect(GRAPHQL_URL.href).toBe(`https://www.linkedin.com${GRAPHQL_PATH}`);
    expect(buildLinkedInProfileContactInfoGraphqlPath({
      profileUrn: PROFILE_URN,
      queryId: CONTACT_QUERY_ID,
    })).toContain(`queryId=${CONTACT_QUERY_ID}`);
    expect(LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID).toBe(
      "com.linkedin.sdui.flagshipnav.profile.ProfileContactDetailsOverlay",
    );
  });

  test("allows only the reviewed profile page and Contact-info GraphQL GET routes", () => {
    expect(() => assertLinkedInContactInfoRequest({
      method: "GET",
      url: PROFILE_URL,
    })).not.toThrow();
    expect(() => assertLinkedInContactInfoRequest({
      method: "GET",
      url: "https://www.linkedin.com/voyager/api/me",
    })).not.toThrow();
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "GET",
      url: PROFILE_URL,
    })).not.toThrow();
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "GET",
      url: GRAPHQL_URL,
    })).not.toThrow();
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "GET",
      url: linkedInProfileContactInfoGraphqlUrl({
        profileUrn: PROFILE_URN,
        queryId: CONTACT_QUERY_ID,
      }),
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
      url: "https://www.linkedin.com/voyager/api/identity/profiles/example/profileContactInfo",
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "GET",
      url: "https://www.linkedin.com/voyager/api/identity/profiles/example/contactInfo",
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "GET",
      url: "https://www.linkedin.com/flagship-web/rsc-action/actions/navigation?screenId=com.linkedin.sdui.flagshipnav.profile.ProfileContactDetailsOverlay",
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "GET",
      url: "https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true&queryName=voyagerFeedDashProfileUpdates&variables=(profileUrn:urn:li:fsd_profile:ACoAAFixtureProfile)",
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

  test("binds numeric networkDistance from Como rehydration without bpr-guid Profile embeds", () => {
    expect(projectLinkedInProfileContactBinding({
      profileHtml: comoHtml({
        publicIdentifier: "example",
        entityUrn: PROFILE_URN,
        networkDistance: 1,
      }),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toEqual({
      vanity: "example",
      profileUrn: PROFILE_URN,
      url: PROFILE_URL,
      relationship: "first-degree",
    });
    expect(projectLinkedInProfileContactBinding({
      profileHtml: comoHtml({
        data: {
          profile: {
            vanityName: "example",
            objectUrn: PROFILE_URN,
            distance: { value: "1" },
          },
        },
      }),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toMatchObject({ relationship: "first-degree", profileUrn: PROFILE_URN });
  });

  test("joins Como distance to the requested vanity and fails closed otherwise", () => {
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: comoHtml({
        publicIdentifier: "example",
        entityUrn: PROFILE_URN,
        networkDistance: 2,
      }),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("not a 1st-degree connection");
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: comoHtml({
        viewer: { entityUrn: VIEWER, networkDistance: 1 },
        other: { publicIdentifier: "otherperson", entityUrn: "urn:li:fsd_profile:ACoAAOtherProfile", networkDistance: 1 },
      }),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("did not bind the requested vanity");
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: comoHtml({
        publicIdentifier: "example",
        entityUrn: VIEWER,
        networkDistance: 1,
      }),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("use profiles.read for the signed-in self profile");
  });

  test("resolves one unique decorated Contact-info queryId from the page", () => {
    expect(resolveLinkedInProfileContactInfoQueryId(profileHtml())).toBeUndefined();
    expect(resolveLinkedInProfileContactInfoQueryId(
      `${comoHtml({ publicIdentifier: "example" })} ${CONTACT_QUERY_ID}`,
    )).toBe(CONTACT_QUERY_ID);
    expect(resolveLinkedInProfileContactInfoQueryId(
      `${CONTACT_QUERY_ID} voyagerIdentityDashProfileContactInfo.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`,
    )).toBeUndefined();
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

  test("projects email from a GraphQL Contact-info envelope", () => {
    expect(projectLinkedInContactInfo({
      profileHtml: profileHtml(),
      contactPayload: {
        data: {
          data: {
            identityDashProfileContactInfoByProfile: {
              emailAddress: "connection@example.test",
              connectedAt: CONNECTED_AT_MS,
            },
          },
        },
      },
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
      observedAt: OBSERVED_AT,
    }).contact).toMatchObject({
      email: "connection@example.test",
      connectedSince: "2023-10-03",
    });
  });

  test("projects labeled Email rows already embedded in Como rehydration", () => {
    const html = comoHtml({
      publicIdentifier: "example",
      entityUrn: PROFILE_URN,
      networkDistance: 1,
      fields: [
        { label: "Email", value: "connection@example.test" },
        { label: "Connected since", value: "Oct 3, 2023" },
      ],
    });
    expect(projectLinkedInEmbeddedContactFields(html, "example")).toMatchObject({
      email: "connection@example.test",
      connectedSince: "2023-10-03",
    });
    expect(projectLinkedInContactInfo({
      profileHtml: html,
      contactPayload: {
        emailAddress: "connection@example.test",
        connectedAt: "2023-10-03",
        profileUrl: PROFILE_URL,
      },
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
      observedAt: OBSERVED_AT,
    }).contact.email).toBe("connection@example.test");
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
