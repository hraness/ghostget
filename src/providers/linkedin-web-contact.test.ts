import { describe, expect, test } from "bun:test";

import { encodeRestliV2Value, assertLinkedInWebR1RequestAllowed } from "./linkedin-web";
import {
  LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID,
  LINKEDIN_CONTACT_DETAILS_PAGE_KEY,
  LINKEDIN_CONTACT_NAVIGATION_REQUEST_METADATA_TYPE,
  LINKEDIN_CONTACT_NAVIGATION_REQUESTED_ARGUMENTS_TYPE,
  LINKEDIN_PROFILE_CONTACT_INFO_QUERY_NAME,
  assertLinkedInContactInfoRequest,
  buildLinkedInContactNavigationBody,
  buildLinkedInProfileContactDetailsNavigationPostPath,
  buildLinkedInProfileContactDetailsOverlayPath,
  buildLinkedInProfileContactInfoGraphqlPath,
  buildLinkedInProfileContactInfoOverlayPath,
  extractLinkedInContactNavigationAction,
  linkedInContactInfoTarget,
  linkedInContactNavigationActionError,
  linkedInProfileContactDetailsNavigationPostUrl,
  linkedInProfileContactDetailsOverlayUrl,
  linkedInProfileContactInfoGraphqlUrl,
  linkedInProfileContactInfoOverlayUrl,
  projectLinkedInContactInfo,
  projectLinkedInEmbeddedContactFields,
  projectLinkedInOverlayContactFields,
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

function comoFlightHtml(rows: readonly unknown[]): string {
  const flight = rows.map((row, index) => {
    if (typeof row === "string" && /^\d+:/u.test(row)) return row;
    return `${index + 1}:${typeof row === "string" ? row : JSON.stringify(row)}`;
  }).join("\n");
  return comoHtml([flight]);
}

const RSC_FLIGHT_ROW = /(?:^|\n)(\d+):/u;

function nonFlightComoSlotArray(
  slot6: string,
  identity: Readonly<Record<string, unknown>> = {
    vanityName: "example",
    vieweeProfileId: "ACoAAFixtureProfile",
    isSelfView: false,
  },
): unknown[] {
  return [null, null, null, null, null, identity, slot6];
}

function multiEscapedProfileViewSlot(options: {
  readonly distance?: string;
  readonly memberUrn?: string;
} = {}): string {
  const distance = options.distance ?? "1";
  const memberUrn = options.memberUrn ?? "urn:li:member:987654321";
  return `networkDistance\\":${distance},\\"vieweeMemberUrn\\":\\"${memberUrn}\\",\\"breadcrumbType\\":\\"PROFILE_VIEW\\"`;
}

const CONTACT_QUERY_ID =
  "voyagerIdentityDashProfileContactInfo.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const GRAPHQL_PATH = buildLinkedInProfileContactInfoGraphqlPath({
  profileUrn: PROFILE_URN,
});
const GRAPHQL_URL = linkedInProfileContactInfoGraphqlUrl({
  profileUrn: PROFILE_URN,
});
const OVERLAY_PATH = buildLinkedInProfileContactInfoOverlayPath({
  profileUrl: PROFILE_URL,
});
const OVERLAY_URL = linkedInProfileContactInfoOverlayUrl({
  profileUrl: PROFILE_URL,
});
const REJECTED_NAVIGATION_OVERLAY_URL = linkedInProfileContactDetailsOverlayUrl({
  profileUrn: PROFILE_URN,
});
const REJECTED_NAVIGATION_OVERLAY_PATH = buildLinkedInProfileContactDetailsOverlayPath({
  profileUrn: PROFILE_URN,
});
const OVERLAY_SDUIID = LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID;
const STOLEN_SDUIID = "fixture-sduiid-contact-overlay-1";
const NAVIGATION_POST_PATH = buildLinkedInProfileContactDetailsNavigationPostPath();
const NAVIGATION_POST_URL = linkedInProfileContactDetailsNavigationPostUrl({
  sduiid: OVERLAY_SDUIID,
});
const OVERLAY_CONTACT_FLIGHT = [
  `1:I["${LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID}"]`,
  `2:${JSON.stringify({
    fields: [
      { label: "Email", value: "connection@example.test" },
      { label: "Connected since", value: "October 3, 2023" },
    ],
  })}`,
].join("\n");

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
    expect(OVERLAY_PATH).toBe("/in/example/overlay/contact-info/");
    expect(OVERLAY_URL.href).toBe(`https://www.linkedin.com${OVERLAY_PATH}`);
    expect(REJECTED_NAVIGATION_OVERLAY_PATH).toBe(
      `/flagship-web/rsc-action/actions/navigation?screenId=${encodeURIComponent(LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID)}&profileUrn=${encodeURIComponent(PROFILE_URN)}`,
    );
    expect(NAVIGATION_POST_PATH).toBe(
      `/flagship-web/rsc-action/actions/navigation?screenId=${encodeURIComponent(LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID)}&sduiid=${encodeURIComponent(OVERLAY_SDUIID)}`,
    );
    expect(OVERLAY_SDUIID).toBe(LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID);
    expect(NAVIGATION_POST_URL.href).toBe(`https://www.linkedin.com${NAVIGATION_POST_PATH}`);
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
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
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
      url: OVERLAY_URL,
    })).not.toThrow();
    expect(() => assertLinkedInContactInfoRequest({
      method: "GET",
      url: OVERLAY_URL,
    })).not.toThrow();
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "GET",
      url: REJECTED_NAVIGATION_OVERLAY_URL,
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
    expect(() => assertLinkedInContactInfoRequest({
      method: "GET",
      url: REJECTED_NAVIGATION_OVERLAY_URL,
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "GET",
      url: "https://www.linkedin.com/flagship-web/rsc-action/actions/navigation?screenId=com.linkedin.sdui.flagshipnav.profile.ProfileContactDetailsOverlay",
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "GET",
      url: `https://www.linkedin.com/flagship-web/rsc-action/actions/navigation?profileUrn=${encodeURIComponent(PROFILE_URN)}&screenId=${encodeURIComponent(LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID)}`,
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "GET",
      url: `${OVERLAY_URL.href}?trk=unsafe`,
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "GET",
      url: "https://www.linkedin.com/in/example/overlay/contact-info",
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "GET",
      url: `https://www.linkedin.com/flagship-web/rsc-action/actions/navigation?screenId=com.linkedin.sdui.flagshipnav.profile.ProfileView&profileUrn=${encodeURIComponent(PROFILE_URN)}`,
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "POST",
      url: OVERLAY_URL,
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "POST",
      url: NAVIGATION_POST_URL,
    })).not.toThrow();
    expect(() => assertLinkedInContactInfoRequest({
      method: "POST",
      url: NAVIGATION_POST_URL,
      body: buildLinkedInContactNavigationBody({
        clientArguments: { payload: { vanityName: "example" } },
      }),
    })).not.toThrow();
    expect(() => assertLinkedInContactInfoRequest({
      method: "GET",
      url: NAVIGATION_POST_URL,
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "GET",
      url: NAVIGATION_POST_URL,
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
    expect(() => assertLinkedInContactInfoRequest({
      method: "POST",
      url: `https://www.linkedin.com/flagship-web/rsc-action/actions/navigation?screenId=${encodeURIComponent(LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID)}&sduiid=${STOLEN_SDUIID}&profileUrn=${encodeURIComponent(PROFILE_URN)}`,
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
    expect(() => assertLinkedInContactInfoRequest({
      method: "POST",
      url: `https://www.linkedin.com/flagship-web/rsc-action/actions/navigation?sduiid=${STOLEN_SDUIID}&screenId=${encodeURIComponent(LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID)}`,
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
    expect(() => assertLinkedInContactInfoRequest({
      method: "POST",
      url: `https://www.linkedin.com/flagship-web/rsc-action/actions/navigation?screenId=com.linkedin.sdui.flagshipnav.profile.ProfileView&sduiid=${STOLEN_SDUIID}`,
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
    expect(() => assertLinkedInContactInfoRequest({
      method: "POST",
      url: `https://www.linkedin.com/flagship-web/rsc-action/actions/navigation?screenId=${encodeURIComponent(LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID)}&sduiid=${STOLEN_SDUIID}`,
    })).toThrow("LinkedIn contact-info navigation sduiid must equal ProfileContactDetailsOverlay");
    expect(() => assertLinkedInContactInfoRequest({
      method: "POST",
      url: NAVIGATION_POST_URL,
      body: { clientArguments: { trackingId: "unreviewed" }, isModal: true },
    })).toThrow("unreviewed keys");
    expect(() => assertLinkedInWebR1RequestAllowed("contacts.read", {
      method: "GET",
      url: "https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true&queryName=voyagerFeedDashProfileUpdates&variables=(profileUrn:urn:li:fsd_profile:ACoAAFixtureProfile)",
    })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
  });
});

describe("LinkedIn contacts.read navigation action binding", () => {
  const actionRecord = {
    actionName: "NavigateToScreen",
    screenId: LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID,
    sduiid: OVERLAY_SDUIID,
    clientArguments: {
      payload: { vanityName: "example" },
    },
  };

  test("extracts a unique page-bound ProfileContactDetailsOverlay action", () => {
    const html = comoFlightHtml([
      { vanityName: "example", vieweeProfileId: "ACoAAFixtureProfile", isSelfView: false },
      actionRecord,
    ]);
    expect(extractLinkedInContactNavigationAction({
      profileHtml: html,
      publicIdentifier: "example",
      profileUrn: PROFILE_URN,
    })).toEqual({
      kind: "action",
      action: {
        sduiid: OVERLAY_SDUIID,
        clientArguments: { payload: { vanityName: "example" } },
        isModal: true,
      },
    });
  });

  test("binds sduiid to the overlay screenId when dormant NavigateToScreen omits it", () => {
    const dormant = comoFlightHtml([
      { publicIdentifier: "example", entityUrn: PROFILE_URN, memberDistance: 1 },
      {
        actionName: "NavigateToScreen",
        screenId: LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID,
        pageKey: LINKEDIN_CONTACT_DETAILS_PAGE_KEY,
        requestedArguments: {
          payload: {
            vanityName: "example",
            givenName: "Ada",
            familyName: "Example",
            isVanityNameResolved: true,
          },
        },
      },
    ]);
    expect(extractLinkedInContactNavigationAction({
      profileHtml: dormant,
      publicIdentifier: "example",
      profileUrn: PROFILE_URN,
    })).toEqual({
      kind: "action",
      action: {
        sduiid: OVERLAY_SDUIID,
        clientArguments: {
          payload: {
            vanityName: "example",
            givenName: "Ada",
            familyName: "Example",
            isVanityNameResolved: true,
          },
        },
        isModal: true,
      },
    });
    const hrefOnly = profileHtml() +
      `/flagship-web/rsc-action/actions/navigation?screenId=${encodeURIComponent(LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID)}&sduiid=${encodeURIComponent(OVERLAY_SDUIID)}`;
    expect(extractLinkedInContactNavigationAction({
      profileHtml: hrefOnly,
      publicIdentifier: "example",
      profileUrn: PROFILE_URN,
    })).toEqual({
      kind: "action",
      action: {
        sduiid: OVERLAY_SDUIID,
        clientArguments: { payload: { vanityName: "example" } },
        isModal: true,
      },
    });
  });

  test("keeps requestMetadata a sibling and copies reviewed proto.sdui types", () => {
    const live = {
      actionName: "NavigateToScreen",
      screenId: LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID,
      pageKey: LINKEDIN_CONTACT_DETAILS_PAGE_KEY,
      requestedArguments: {
        $type: LINKEDIN_CONTACT_NAVIGATION_REQUESTED_ARGUMENTS_TYPE,
        requestedStateKeys: [],
        payload: {
          vanityName: "example",
          givenName: "Ada",
          familyName: "Example",
          isVanityNameResolved: true,
        },
        requestMetadata: {
          $type: LINKEDIN_CONTACT_NAVIGATION_REQUEST_METADATA_TYPE,
        },
      },
    };
    const extracted = extractLinkedInContactNavigationAction({
      profileHtml: comoFlightHtml([
        { publicIdentifier: "example", entityUrn: PROFILE_URN, memberDistance: 1 },
        live,
      ]),
      publicIdentifier: "example",
      profileUrn: PROFILE_URN,
    });
    expect(extracted).toEqual({
      kind: "action",
      action: {
        sduiid: OVERLAY_SDUIID,
        clientArguments: {
          $type: LINKEDIN_CONTACT_NAVIGATION_REQUESTED_ARGUMENTS_TYPE,
          requestedStateKeys: [],
          payload: {
            vanityName: "example",
            givenName: "Ada",
            familyName: "Example",
            isVanityNameResolved: true,
          },
          requestMetadata: {
            $type: LINKEDIN_CONTACT_NAVIGATION_REQUEST_METADATA_TYPE,
          },
        },
        isModal: true,
      },
    });
    expect(() => assertLinkedInContactInfoRequest({
      method: "POST",
      url: NAVIGATION_POST_URL,
      body: extracted.kind === "action"
        ? buildLinkedInContactNavigationBody(extracted.action)
        : undefined,
    })).not.toThrow();
    const lifted = extractLinkedInContactNavigationAction({
      profileHtml: comoFlightHtml([
        { publicIdentifier: "example", entityUrn: PROFILE_URN, memberDistance: 1 },
        {
          ...live,
          requestedArguments: {
            $type: LINKEDIN_CONTACT_NAVIGATION_REQUESTED_ARGUMENTS_TYPE,
            requestedStateKeys: [],
            payload: {
              vanityName: "example",
              givenName: "Ada",
              familyName: "Example",
              isVanityNameResolved: true,
              requestMetadata: {
                $type: LINKEDIN_CONTACT_NAVIGATION_REQUEST_METADATA_TYPE,
              },
            },
          },
        },
      ]),
      publicIdentifier: "example",
      profileUrn: PROFILE_URN,
    });
    expect(lifted).toEqual(extracted);
    expect(JSON.parse(buildLinkedInContactNavigationBody({
      clientArguments: extracted.kind === "action" ? extracted.action.clientArguments : { payload: {} },
    })).clientArguments.requestMetadata).toEqual({
      $type: LINKEDIN_CONTACT_NAVIGATION_REQUEST_METADATA_TYPE,
    });
    expect(JSON.parse(buildLinkedInContactNavigationBody({
      clientArguments: extracted.kind === "action" ? extracted.action.clientArguments : { payload: {} },
    })).clientArguments.payload.requestMetadata).toBeUndefined();
  });

  test("stays absent when profile HTML only mentions the overlay screen", () => {
    expect(extractLinkedInContactNavigationAction({
      profileHtml: profileHtml(),
      publicIdentifier: "example",
      profileUrn: PROFILE_URN,
    })).toEqual({ kind: "absent" });
    expect(extractLinkedInContactNavigationAction({
      profileHtml: comoFlightHtml([
        { publicIdentifier: "example", entityUrn: PROFILE_URN, memberDistance: 1 },
        {
          fields: [{
            label: `${LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID} decorative copy that exceeds the sixty-four character field-label bound`,
            value: "skip this decorative SDUI string",
          }],
        },
      ]),
      publicIdentifier: "example",
      profileUrn: PROFILE_URN,
    })).toEqual({ kind: "absent" });
  });

  test("fails closed for stolen, unbound, or unreviewed navigation actions", () => {
    const stolen = extractLinkedInContactNavigationAction({
      profileHtml: comoFlightHtml([
        { publicIdentifier: "example", entityUrn: PROFILE_URN, memberDistance: 1 },
        { ...actionRecord, sduiid: STOLEN_SDUIID },
      ]),
      publicIdentifier: "example",
      profileUrn: PROFILE_URN,
    });
    expect(stolen).toEqual({ kind: "unreviewed-sduiid" });
    expect(linkedInContactNavigationActionError(stolen as Exclude<typeof stolen, { kind: "action" | "absent" }>).message)
      .toContain("sduiid must equal ProfileContactDetailsOverlay");
    expect(extractLinkedInContactNavigationAction({
      profileHtml: comoFlightHtml([
        { publicIdentifier: "example", entityUrn: PROFILE_URN, memberDistance: 1 },
        {
          ...actionRecord,
          clientArguments: { payload: { vanityName: "other" } },
        },
      ]),
      publicIdentifier: "example",
      profileUrn: PROFILE_URN,
    })).toEqual({ kind: "unbound-client-arguments" });
    expect(extractLinkedInContactNavigationAction({
      profileHtml: comoFlightHtml([
        { publicIdentifier: "example", entityUrn: PROFILE_URN, memberDistance: 1 },
        {
          ...actionRecord,
          clientArguments: {
            payload: { vanityName: "example" },
            trackingId: "no",
          },
        },
      ]),
      publicIdentifier: "example",
      profileUrn: PROFILE_URN,
    })).toEqual({
      kind: "unreviewed-client-arguments",
      keys: ["trackingId"],
    });
    const navigate = {
      actionName: "NavigateToScreen",
      screenId: LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID,
      pageKey: LINKEDIN_CONTACT_DETAILS_PAGE_KEY,
    };
    expect(extractLinkedInContactNavigationAction({
      profileHtml: comoFlightHtml([
        { publicIdentifier: "example", entityUrn: PROFILE_URN, memberDistance: 1 },
        {
          ...navigate,
          requestedArguments: {
            $type: "proto.graphql.UnreviewedArguments",
            payload: { vanityName: "example" },
          },
        },
      ]),
      publicIdentifier: "example",
      profileUrn: PROFILE_URN,
    })).toEqual({
      kind: "unreviewed-client-arguments",
      keys: ["$type"],
    });
    expect(extractLinkedInContactNavigationAction({
      profileHtml: comoFlightHtml([
        { publicIdentifier: "example", entityUrn: PROFILE_URN, memberDistance: 1 },
        {
          ...navigate,
          requestedArguments: {
            $type: LINKEDIN_CONTACT_NAVIGATION_REQUESTED_ARGUMENTS_TYPE,
            payload: { vanityName: "example" },
            requestMetadata: {
              $type: LINKEDIN_CONTACT_NAVIGATION_REQUEST_METADATA_TYPE,
            },
            extraProto: true,
          },
        },
      ]),
      publicIdentifier: "example",
      profileUrn: PROFILE_URN,
    })).toEqual({
      kind: "unreviewed-client-arguments",
      keys: ["extraProto"],
    });
    expect(extractLinkedInContactNavigationAction({
      profileHtml: comoFlightHtml([
        { publicIdentifier: "example", entityUrn: PROFILE_URN, memberDistance: 1 },
        {
          ...navigate,
          requestedArguments: {
            $type: LINKEDIN_CONTACT_NAVIGATION_REQUESTED_ARGUMENTS_TYPE,
            payload: {
              vanityName: "example",
              requestMetadata: {
                $type: LINKEDIN_CONTACT_NAVIGATION_REQUEST_METADATA_TYPE,
                screenId: LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID,
              },
            },
            requestMetadata: {
              $type: LINKEDIN_CONTACT_NAVIGATION_REQUEST_METADATA_TYPE,
            },
          },
        },
      ]),
      publicIdentifier: "example",
      profileUrn: PROFILE_URN,
    })).toEqual({
      kind: "unreviewed-client-arguments",
      keys: ["requestMetadata"],
    });
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

  test("binds 1st-degree from an RSC flight array assignment with vanity-joined networkDistance", () => {
    const html = comoFlightHtml([
      'I["com.linkedin.sdui.flagshipnav.profile.ProfileView"]',
      {
        publicIdentifier: "example",
        vieweeMemberUrn: PROFILE_URN,
        networkDistance: 1,
        screenId: LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID,
      },
    ]);
    expect(html).toContain("__como_rehydration__=[");
    expect(html).not.toContain("bpr-guid-");
    expect(html).not.toContain("voyagerIdentityDashProfileContactInfo.");
    expect(projectLinkedInProfileContactBinding({
      profileHtml: html,
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toEqual({
      vanity: "example",
      profileUrn: PROFILE_URN,
      url: PROFILE_URL,
      relationship: "first-degree",
    });
  });

  function nestDepth(leaf: unknown, depth: number): unknown {
    let value = leaf;
    for (let index = 0; index < depth; index += 1) {
      value = [null, ["$", `$L${String(index)}`, null, value]];
    }
    return value;
  }

  test("binds a Como tree deeper than 32 when vanity joins vieweeProfileId", () => {
    const html = comoFlightHtml([
      'I["PROFILE_VIEW"]',
      nestDepth({
        vanityName: "example",
        vieweeProfileId: "ACoAAFixtureProfile",
        isSelfView: false,
      }, 20),
      JSON.stringify(JSON.stringify({ networkDistance: 1 })),
    ]);
    expect(projectLinkedInProfileContactBinding({
      profileHtml: html,
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toEqual({
      vanity: "example",
      profileUrn: PROFILE_URN,
      url: PROFILE_URL,
      relationship: "first-degree",
    });
  });

  test("joins vieweeProfileId and vanity when classic URN keys are absent", () => {
    expect(projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        'I["PROFILE_VIEW"]',
        { vanityName: "example", vieweeProfileId: "ACoAAFixtureProfile", isSelfView: false },
        { breadcrumb: "{\"networkDistance\":1}" },
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toMatchObject({
      vanity: "example",
      profileUrn: PROFILE_URN,
      relationship: "first-degree",
    });
  });

  test("reads first-degree distance from a PROFILE_VIEW breadcrumb string row", () => {
    expect(projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        'I["com.linkedin.sdui.flagshipnav.profile.ProfileView"]',
        { vanityName: "example", vieweeProfileId: "ACoAAFixtureProfile", isSelfView: false },
        'networkDistance":1',
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toMatchObject({
      profileUrn: PROFILE_URN,
      relationship: "first-degree",
    });
    expect(projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        { vanityName: "example", vieweeProfileId: "ACoAAFixtureProfile" },
        ["networkDistance", 1],
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toMatchObject({ relationship: "first-degree", profileUrn: PROFILE_URN });
  });

  test("joins vieweeProfileId identity to distance on a sibling vieweeMemberUrn record", () => {
    expect(projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        'I["PROFILE_VIEW"]',
        { vanityName: "example", vieweeProfileId: "ACoAAFixtureProfile", isSelfView: false },
        { vieweeMemberUrn: "urn:li:member:987654321", networkDistance: 1 },
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toMatchObject({
      vanity: "example",
      profileUrn: PROFILE_URN,
      relationship: "first-degree",
    });
    expect(projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        { vanityName: "example", vieweeProfileId: "ACoAAFixtureProfile", isSelfView: false },
        { vieweeMemberUrn: "urn:li:fsd_profile:987654321", networkDistance: 1 },
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toMatchObject({
      profileUrn: PROFILE_URN,
      relationship: "first-degree",
    });
  });

  test("joins unique breadcrumb distance beside vieweeMemberUrn that is not the bound fsd_profile URN", () => {
    expect(projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        'I["com.linkedin.sdui.flagshipnav.profile.ProfileView"]',
        { vanityName: "example", vieweeProfileId: "ACoAAFixtureProfile", isSelfView: false },
        'networkDistance":1,"vieweeMemberUrn":"urn:li:member:987654321"',
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toMatchObject({
      profileUrn: PROFILE_URN,
      relationship: "first-degree",
    });
    expect(projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        { vanityName: "example", vieweeProfileId: "ACoAAFixtureProfile" },
        'networkDistance":1,"vieweeMemberUrn":"urn:li:member:987654321","extra":"urn:li:fsd_profile:123456789"',
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toMatchObject({
      profileUrn: PROFILE_URN,
      relationship: "first-degree",
    });
    expect(projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        { vanityName: "example", vieweeProfileId: "ACoAAFixtureProfile" },
        'networkDistance":1,"vieweeMemberUrn":"urn:li:fsd_profile:987654321"',
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toMatchObject({
      profileUrn: PROFILE_URN,
      relationship: "first-degree",
    });
    expect(projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        { vanityName: "example", vieweeProfileId: "ACoAAFixtureProfile" },
        'networkDistance":1,"vieweeMemberUrn":"urn:li:fsd_profile:987654321","vanityName":"example"',
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toMatchObject({
      profileUrn: PROFILE_URN,
      relationship: "first-degree",
    });
  });

  test("binds 1st-degree from a multi-escaped PROFILE_VIEW breadcrumb distance", () => {
    const escapedRow =
      'networkDistance\\":1,\\"vieweeMemberUrn\\":\\"urn:li:member:987654321\\",\\"breadcrumbType\\":\\"PROFILE_VIEW\\"';
    expect(escapedRow).toContain("networkDistance\\\"");
    expect(projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        'I["PROFILE_VIEW"]',
        { vanityName: "example", vieweeProfileId: "ACoAAFixtureProfile", isSelfView: false },
        escapedRow,
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toMatchObject({
      vanity: "example",
      profileUrn: PROFILE_URN,
      relationship: "first-degree",
    });
    expect(projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        { vanityName: "example", vieweeProfileId: "ACoAAFixtureProfile" },
        { payload: escapedRow },
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toMatchObject({
      profileUrn: PROFILE_URN,
      relationship: "first-degree",
    });
    expect(projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        { vanityName: "example", vieweeProfileId: "ACoAAFixtureProfile" },
        'networkDistance\\\\":1,\\\\"vieweeMemberUrn\\\\":\\\\"urn:li:member:987654321\\\\"',
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toMatchObject({
      profileUrn: PROFILE_URN,
      relationship: "first-degree",
    });
  });

  test("binds 1st-degree from a non-flight Como string slot carrying multi-escaped PROFILE_VIEW distance", () => {
    const slot6 = multiEscapedProfileViewSlot();
    expect(RSC_FLIGHT_ROW.test(slot6)).toBe(false);
    const slots = nonFlightComoSlotArray(slot6);
    expect(slots).toHaveLength(7);
    expect(slots[6]).toBe(slot6);
    const html = comoHtml(slots);
    expect(html).toContain("__como_rehydration__=[");
    expect(html).not.toContain("bpr-guid-");
    expect(html).not.toMatch(/__como_rehydration__=\["\d+:/u);
    expect(projectLinkedInProfileContactBinding({
      profileHtml: html,
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toEqual({
      vanity: "example",
      profileUrn: PROFILE_URN,
      url: PROFILE_URL,
      relationship: "first-degree",
    });
    const parsedSlot = JSON.stringify({
      networkDistance: 1,
      vieweeMemberUrn: "urn:li:member:987654321",
      vanityName: "example",
      breadcrumbType: "PROFILE_VIEW",
    }).replaceAll("\"", "\\\"");
    expect(RSC_FLIGHT_ROW.test(parsedSlot)).toBe(false);
    expect(projectLinkedInProfileContactBinding({
      profileHtml: comoHtml(nonFlightComoSlotArray(parsedSlot)),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toMatchObject({
      vanity: "example",
      profileUrn: PROFILE_URN,
      relationship: "first-degree",
    });
  });

  test("fails closed when a non-flight Como string slot is self, non-1st, or contradictory", () => {
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: comoHtml(nonFlightComoSlotArray(multiEscapedProfileViewSlot({ distance: "2" }))),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("not a 1st-degree connection");
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: comoHtml(nonFlightComoSlotArray(
        multiEscapedProfileViewSlot({
          distance: "0",
          memberUrn: "urn:li:fsd_profile:123456789",
        }),
        { vanityName: "example", vieweeProfileId: "123456789", isSelfView: false },
      )),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("use profiles.read for the signed-in self profile");
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: comoHtml([
        null,
        null,
        null,
        null,
        null,
        { vanityName: "example", vieweeProfileId: "ACoAAFixtureProfile", isSelfView: false },
        multiEscapedProfileViewSlot({ distance: "1", memberUrn: "urn:li:member:111" }),
        multiEscapedProfileViewSlot({ distance: "2", memberUrn: "urn:li:member:222" }),
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("omitted or contradicted its relationship distance");
  });

  test("prefers a unique vieweeMemberUrn distance over an identity-free breadcrumb", () => {
    expect(projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        { vanityName: "example", vieweeProfileId: "ACoAAFixtureProfile" },
        { vieweeMemberUrn: "urn:li:member:987654321", networkDistance: 1 },
        'networkDistance":2',
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toMatchObject({
      profileUrn: PROFILE_URN,
      relationship: "first-degree",
    });
  });

  test("fails closed when vieweeMemberUrn or breadcrumb distances contradict", () => {
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        { vanityName: "example", vieweeProfileId: "ACoAAFixtureProfile" },
        { vieweeMemberUrn: "urn:li:member:111", networkDistance: 1 },
        { vieweeMemberUrn: "urn:li:member:222", networkDistance: 2 },
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("omitted or contradicted its relationship distance");
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        { vanityName: "example", vieweeProfileId: "ACoAAFixtureProfile" },
        'networkDistance":1',
        'networkDistance":2',
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("omitted or contradicted its relationship distance");
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        { vanityName: "example", vieweeProfileId: "ACoAAFixtureProfile" },
        'networkDistance\\":1,\\"vieweeMemberUrn\\":\\"urn:li:member:111\\"',
        'networkDistance\\":2,\\"vieweeMemberUrn\\":\\"urn:li:member:222\\"',
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("omitted or contradicted its relationship distance");
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        { vanityName: "example", vieweeProfileId: "ACoAAFixtureProfile" },
        'networkDistance\\":2,\\"vieweeMemberUrn\\":\\"urn:li:member:987654321\\"',
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("not a 1st-degree connection");
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        { vanityName: "example", vieweeProfileId: "123456789", isSelfView: false },
        'networkDistance\\":0,\\"vieweeMemberUrn\\":\\"urn:li:fsd_profile:123456789\\"',
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("use profiles.read for the signed-in self profile");
  });

  test("fails closed for deep Como trees that are self or not first-degree", () => {
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        nestDepth({
          vanityName: "example",
          vieweeProfileId: "ACoAAFixtureProfile",
          isSelfView: false,
        }, 20),
        JSON.stringify(JSON.stringify({ networkDistance: 2 })),
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("not a 1st-degree connection");
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        nestDepth({
          vanityName: "example",
          vieweeProfileId: "123456789",
          isSelfView: true,
        }, 20),
        'networkDistance":0',
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("use profiles.read for the signed-in self profile");
  });

  test("joins flight vanity to a sibling vieweeMemberUrn plus networkDistance", () => {
    expect(projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([
        'I["PROFILE_VIEW"]',
        { publicIdentifier: "example" },
        { vieweeMemberUrn: PROFILE_URN, networkDistance: 1 },
      ]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toMatchObject({
      vanity: "example",
      profileUrn: PROFILE_URN,
      relationship: "first-degree",
    });
  });

  test("fails closed when Como bootstrap is missing, empty, or has no JSON roots", () => {
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: "<html><body>no bootstrap</body></html>",
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("omitted its bootstrap payloads");
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: comoHtml([]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("omitted its bootstrap payloads");
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml(['I["ProfileView"]', 'I["ProfileContactDetailsOverlay"]']),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("omitted its bootstrap payloads");
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
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([{
        publicIdentifier: "example",
        vieweeMemberUrn: PROFILE_URN,
        networkDistance: 2,
      }]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("not a 1st-degree connection");
    expect(() => projectLinkedInProfileContactBinding({
      profileHtml: comoFlightHtml([{
        publicIdentifier: "example",
        vieweeMemberUrn: VIEWER,
        networkDistance: 0,
      }]),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    })).toThrow("use profiles.read for the signed-in self profile");
  });

  test("resolves one unique decorated Contact-info queryId from the page", () => {
    expect(resolveLinkedInProfileContactInfoQueryId(profileHtml())).toBeUndefined();
    expect(resolveLinkedInProfileContactInfoQueryId(
      comoFlightHtml([{ publicIdentifier: "example", networkDistance: 1 }]),
    )).toBeUndefined();
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

  test("skips long SDUI field labels and still projects a neighboring Email pair", () => {
    const longLabel = "com.linkedin.sdui.flagshipnav.profile.ProfileContactDetailsOverlay decorative copy that exceeds the sixty-four character field-label bound";
    expect(longLabel.length).toBeGreaterThan(64);
    const html = comoHtml({
      publicIdentifier: "example",
      entityUrn: PROFILE_URN,
      networkDistance: 1,
      fields: [
        { label: longLabel, value: "skip this decorative SDUI string" },
        { label: "Email", value: "connection@example.test" },
        { label: "Connected since", value: "October 3, 2023" },
      ],
      rows: [
        longLabel,
        "not-an-email",
        "Email",
        "connection@example.test",
      ],
    });
    expect(projectLinkedInEmbeddedContactFields(html, "example")).toMatchObject({
      email: "connection@example.test",
      connectedSince: "2023-10-03",
    });
    expect(projectLinkedInEmbeddedContactFields(comoHtml({
      publicIdentifier: "example",
      entityUrn: PROFILE_URN,
      networkDistance: 1,
      fields: [{ label: longLabel, value: "skip this decorative SDUI string" }],
    }), "example")).toBeUndefined();
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

  test("projects Email and full-month Connected since from an RSC overlay flight", () => {
    expect(projectLinkedInOverlayContactFields(OVERLAY_CONTACT_FLIGHT, "example")).toMatchObject({
      email: "connection@example.test",
      connectedSince: "2023-10-03",
    });
    expect(projectLinkedInContactInfo({
      profileHtml: profileHtml(),
      contactPayload: OVERLAY_CONTACT_FLIGHT,
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
      observedAt: OBSERVED_AT,
    })).toMatchObject({
      completeness: "complete",
      contact: {
        email: "connection@example.test",
        connectedSince: "2023-10-03",
        profileUrl: PROFILE_URL,
      },
    });
  });

  test("treats an HTML-200 profile shell as omitted Contact-info fields", () => {
    const shell = [
      "<!DOCTYPE html><html><head><title>Profile</title></head>",
      "<body><main id=\"profile-stickiness-container\">signed-in profile chrome</main></body></html>",
    ].join("");
    expect(() => projectLinkedInOverlayContactFields(shell, "example")).toThrow(
      "LinkedIn contact-info overlay omitted its contact fields",
    );
    expect(() => projectLinkedInOverlayContactFields(shell, "example")).not.toThrow(
      "LinkedIn contact-info payload must be a JSON object or array",
    );
    expect(() => projectLinkedInContactInfo({
      profileHtml: profileHtml(),
      contactPayload: shell,
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
      observedAt: OBSERVED_AT,
    })).toThrow("LinkedIn contact-info overlay omitted its contact fields");
    expect(projectLinkedInProfileContactBinding({
      profileHtml: profileHtml(),
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
    }).relationship).toBe("first-degree");
  });

  test("projects Email from overlay HTML that still carries Como Contact-info fields", () => {
    const html = comoHtml({
      publicIdentifier: "example",
      entityUrn: PROFILE_URN,
      networkDistance: 1,
      fields: [
        { label: "Email", value: "connection@example.test" },
        { label: "Connected since", value: "October 3, 2023" },
      ],
    });
    expect(projectLinkedInOverlayContactFields(html, "example")).toMatchObject({
      email: "connection@example.test",
      connectedSince: "2023-10-03",
    });
    expect(projectLinkedInContactInfo({
      profileHtml: profileHtml(),
      contactPayload: html,
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
      observedAt: OBSERVED_AT,
    }).contact.email).toBe("connection@example.test");
  });

  test("rejects leftover overlay HTML with more than one mailto address", () => {
    expect(() => projectLinkedInOverlayContactFields(
      "<html><body><a href=\"mailto:one@example.test\"></a><a href=\"mailto:two@example.test\"></a></body></html>",
      "example",
    )).toThrow("LinkedIn contact-info email was ambiguous");
  });

  test("projects Email from SDUI text pairs and a mailto href in overlay payloads", () => {
    const textPairs = [
      "1:I[\"ProfileContactDetailsOverlay\"]",
      `2:${JSON.stringify(["Email", "connection@example.test", "Connected since", "October 3, 2023"])}`,
    ].join("\n");
    expect(projectLinkedInOverlayContactFields(textPairs, "example")).toMatchObject({
      email: "connection@example.test",
      connectedSince: "2023-10-03",
    });
    expect(projectLinkedInOverlayContactFields(
      '1:{"href":"mailto:connection@example.test"}',
      "example",
    ).email).toBe("connection@example.test");
    expect(projectLinkedInOverlayContactFields(
      '<html><body><a href="mailto:connection@example.test">Email</a></body></html>',
      "example",
    ).email).toBe("connection@example.test");
    expect(projectLinkedInContactInfo({
      profileHtml: profileHtml(),
      contactPayload: [
        { text: "Email" },
        { text: "connection@example.test" },
        { text: "Connected since" },
        { text: "October 3, 2023" },
      ],
      profileUrl: PROFILE_URL,
      expectedViewerSubject: VIEWER,
      observedAt: OBSERVED_AT,
    }).contact).toMatchObject({
      email: "connection@example.test",
      connectedSince: "2023-10-03",
    });
  });
});
