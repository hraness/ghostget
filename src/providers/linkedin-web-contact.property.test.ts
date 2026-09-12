import { expect, test } from "bun:test";
import { assertProperty, fc } from "../test-support";

import {
  LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID,
  LINKEDIN_CONTACT_NAVIGATION_REQUEST_METADATA_TYPE,
  LINKEDIN_CONTACT_NAVIGATION_REQUESTED_ARGUMENTS_TYPE,
  assertLinkedInContactInfoRequest,
  buildLinkedInProfileContactDetailsNavigationPostPath,
  buildLinkedInAbsentContactNavigationAction,
  extractLinkedInContactNavigationAction,
  linkedInContactInfoTarget,
  linkedInProfileContactDetailsNavigationPostUrl,
  linkedInProfileContactDetailsOverlayUrl,
  linkedInProfileContactInfoGraphqlUrl,
  linkedInProfileContactInfoOverlayUrl,
  projectLinkedInContactInfo,
  projectLinkedInProfileContactBinding,
} from "./linkedin-web-contact";

const VIEWER = "urn:li:fsd_profile:123456789";
const PROFILE_URN = "urn:li:fsd_profile:ACoAAFixtureProfile";
const OBSERVED_AT = "2026-09-08T18:00:00.000Z";
const vanity = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/u);

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

function assertContactInfoRequestBinding(slug: string): void {
  const target = linkedInContactInfoTarget(`https://www.linkedin.com/in/${slug}`);
  expect(target.slug).toBe(slug.toLowerCase());
  expect(target.url).toBe(`https://www.linkedin.com/in/${slug.toLowerCase()}/`);
  expect(() => assertLinkedInContactInfoRequest({
    method: "GET",
    url: target.url,
  })).not.toThrow();
  expect(() => assertLinkedInContactInfoRequest({
    method: "GET",
    url: linkedInProfileContactInfoGraphqlUrl({ profileUrn: PROFILE_URN }),
  })).not.toThrow();
  expect(() => assertLinkedInContactInfoRequest({
    method: "GET",
    url: `https://www.linkedin.com/voyager/api/identity/profiles/${slug.toLowerCase()}/profileContactInfo`,
  })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
  const overlay = linkedInProfileContactInfoOverlayUrl({ profileUrl: target.url });
  expect(overlay.pathname).toBe(`/in/${slug.toLowerCase()}/overlay/contact-info/`);
  expect(overlay.search).toBe("");
  expect(overlay.href).toBe(`https://www.linkedin.com/in/${slug.toLowerCase()}/overlay/contact-info/`);
  expect(() => assertLinkedInContactInfoRequest({
    method: "GET",
    url: overlay,
  })).not.toThrow();
  expect(() => assertLinkedInContactInfoRequest({
    method: "GET",
    url: linkedInProfileContactDetailsOverlayUrl({ profileUrn: PROFILE_URN }),
  })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
  expect(() => assertLinkedInContactInfoRequest({
    method: "GET",
    url: "https://www.linkedin.com/flagship-web/rsc-action/actions/navigation?screenId=com.linkedin.sdui.flagshipnav.profile.ProfileContactDetailsOverlay",
  })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
  const navigation = linkedInProfileContactDetailsNavigationPostUrl({
    sduiid: LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID,
  });
  expect(navigation.pathname).toBe("/flagship-web/rsc-action/actions/navigation");
  expect([...navigation.searchParams.keys()]).toEqual(["screenId", "sduiid"]);
  expect(navigation.searchParams.get("screenId")).toBe(LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID);
  expect(navigation.searchParams.get("sduiid")).toBe(LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID);
  expect(navigation.searchParams.has("sduid")).toBeFalse();
  expect(navigation.href).not.toContain("sduid=");
  expect(() => assertLinkedInContactInfoRequest({
    method: "POST",
    url: navigation,
  })).not.toThrow();
  expect(() => assertLinkedInContactInfoRequest({
    method: "GET",
    url: navigation,
  })).toThrow("LinkedIn contact-info request escaped its exact reviewed route");
  expect(() => assertLinkedInContactInfoRequest({
    method: "POST",
    url: linkedInProfileContactDetailsNavigationPostUrl({
      sduiid: `fixture-${slug.toLowerCase()}-sduiid`,
    }),
  })).toThrow("sduiid must equal ProfileContactDetailsOverlay");
  expect(buildLinkedInProfileContactDetailsNavigationPostPath()).toContain(
    `sduiid=${encodeURIComponent(LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID)}`,
  );
}

test("LinkedIn contact-info targets and request paths stay bound to one vanity", () => {
  assertProperty(fc.property(vanity, assertContactInfoRequestBinding));
});

test("LinkedIn contact-info accepts vanity c- even though it occurs in the fixed navigation route", () => {
  assertContactInfoRequestBinding("c-");
});

test("LinkedIn contact-info navigation POST binds sduiid to the overlay screenId", () => {
  assertProperty(fc.property(vanity, (slug) => {
    const html = `<html><body><code style="display: none" id="bpr-guid-123">${JSON.stringify({
      $type: "com.linkedin.voyager.identity.profile.Profile",
      publicIdentifier: slug,
      entityUrn: PROFILE_URN,
      memberDistance: "DISTANCE_1",
      actionName: "NavigateToScreen",
      screenId: LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID,
      pageKey: "profile_view_base_contact_details",
      requestedArguments: {
        $type: LINKEDIN_CONTACT_NAVIGATION_REQUESTED_ARGUMENTS_TYPE,
        requestedStateKeys: [],
        payload: { vanityName: slug, givenName: "Ada", familyName: "Example", isVanityNameResolved: true },
      },
    }).replace(/[&<>"=\\]/gu, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "=": "&#61;",
      "\\": "&#92;",
    })[character] ?? character)}</code></body></html>`;
    const extracted = extractLinkedInContactNavigationAction({
      profileHtml: html,
      publicIdentifier: slug,
      profileUrn: PROFILE_URN,
    });
    expect(extracted).toEqual({
      kind: "action",
      action: {
        sduiid: LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID,
        clientArguments: {
          $type: LINKEDIN_CONTACT_NAVIGATION_REQUESTED_ARGUMENTS_TYPE,
          requestedStateKeys: [],
          payload: {
            vanityName: slug.toLowerCase(),
            givenName: "Ada",
            familyName: "Example",
            isVanityNameResolved: true,
            requestMetadata: {
              $type: LINKEDIN_CONTACT_NAVIGATION_REQUEST_METADATA_TYPE,
              states: [],
              screenId: LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID,
              knownTemplates: [],
            },
          },
        },
        isModal: true,
      },
    });
    if (extracted.kind !== "action") return;
    expect(linkedInProfileContactDetailsNavigationPostUrl({
      sduiid: extracted.action.sduiid,
    }).searchParams.get("sduiid")).toBe(LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID);
    expect(() => assertLinkedInContactInfoRequest({
      method: "POST",
      url: linkedInProfileContactDetailsNavigationPostUrl({ sduiid: extracted.action.sduiid }),
      body: {
        clientArguments: extracted.action.clientArguments,
        isModal: true,
      },
    })).not.toThrow();
    const stolen = `<html><body><code style="display: none" id="bpr-guid-123">${JSON.stringify({
      publicIdentifier: slug,
      entityUrn: PROFILE_URN,
      actionName: "NavigateToScreen",
      screenId: LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID,
      sduiid: `stolen-${slug}`,
    }).replace(/[&<>"=\\]/gu, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "=": "&#61;",
      "\\": "&#92;",
    })[character] ?? character)}</code></body></html>`;
    expect(extractLinkedInContactNavigationAction({
      profileHtml: stolen,
      publicIdentifier: slug,
      profileUrn: PROFILE_URN,
    })).toEqual({ kind: "unreviewed-sduiid" });
  }));
});

test("absent Contact-info navigation still builds the reviewed overlay click action", () => {
  const personName = fc.stringMatching(/^[A-Za-z]{1,20}$/u);
  assertProperty(fc.property(vanity, fc.option(personName, { nil: undefined }), fc.option(personName, { nil: undefined }), (slug, givenName, familyName) => {
    const html = bootstrapHtml({
      $type: "com.linkedin.voyager.identity.profile.Profile",
      publicIdentifier: slug,
      entityUrn: PROFILE_URN,
      memberDistance: "DISTANCE_1",
      ...(givenName === undefined ? {} : { firstName: givenName }),
      ...(familyName === undefined ? {} : { lastName: familyName }),
    });
    expect(extractLinkedInContactNavigationAction({
      profileHtml: html,
      publicIdentifier: slug,
      profileUrn: PROFILE_URN,
    })).toEqual({ kind: "absent" });
    const action = buildLinkedInAbsentContactNavigationAction({
      profileHtml: html,
      publicIdentifier: slug,
      profileUrn: PROFILE_URN,
    });
    expect(action).toEqual({
      sduiid: LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID,
      clientArguments: {
        $type: LINKEDIN_CONTACT_NAVIGATION_REQUESTED_ARGUMENTS_TYPE,
        requestedStateKeys: [],
        payload: {
          vanityName: slug.toLowerCase(),
          ...(givenName === undefined ? {} : { givenName }),
          ...(familyName === undefined ? {} : { familyName }),
          isVanityNameResolved: true,
          requestMetadata: {
            $type: LINKEDIN_CONTACT_NAVIGATION_REQUEST_METADATA_TYPE,
            states: [],
            screenId: LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID,
            knownTemplates: [],
          },
        },
      },
      isModal: true,
    });
    expect(() => assertLinkedInContactInfoRequest({
      method: "POST",
      url: linkedInProfileContactDetailsNavigationPostUrl({ sduiid: action.sduiid }),
      body: {
        clientArguments: action.clientArguments,
        isModal: true,
      },
    })).not.toThrow();
  }));
});

test("LinkedIn contact-info binding never invents a 1st-degree relationship", () => {
  assertProperty(fc.property(
    vanity,
    fc.constantFrom("DISTANCE_2", "DISTANCE_3", "OUT_OF_NETWORK", "SELF", 2, 3),
    (slug, distance) => {
      const html = bootstrapHtml({
        $type: "com.linkedin.voyager.identity.profile.Profile",
        publicIdentifier: slug,
        entityUrn: distance === "SELF" ? VIEWER : PROFILE_URN,
        memberDistance: distance,
      });
      expect(() => projectLinkedInProfileContactBinding({
        profileHtml: html,
        profileUrl: `https://www.linkedin.com/in/${slug}/`,
        expectedViewerSubject: VIEWER,
      })).toThrow(distance === "SELF"
        ? "use profiles.read for the signed-in self profile"
        : "not a 1st-degree connection");
      const como = `<html><body><script>window.__como_rehydration__=${JSON.stringify({
        publicIdentifier: slug,
        entityUrn: distance === "SELF" ? VIEWER : PROFILE_URN,
        networkDistance: distance === "SELF" ? 0 : distance === 2 || distance === "DISTANCE_2" ? 2 : 3,
      })}</script></body></html>`;
      expect(() => projectLinkedInProfileContactBinding({
        profileHtml: como,
        profileUrl: `https://www.linkedin.com/in/${slug}/`,
        expectedViewerSubject: VIEWER,
      })).toThrow(distance === "SELF"
        ? "use profiles.read for the signed-in self profile"
        : "not a 1st-degree connection");
      const flight = `<html><body><script>window.__como_rehydration__=${JSON.stringify([
        `1:I["ProfileView"]\n2:${JSON.stringify({
          publicIdentifier: slug,
          vieweeMemberUrn: distance === "SELF" ? VIEWER : PROFILE_URN,
          networkDistance: distance === "SELF" ? 0 : distance === 2 || distance === "DISTANCE_2" ? 2 : 3,
        })}`,
      ])}</script></body></html>`;
      expect(() => projectLinkedInProfileContactBinding({
        profileHtml: flight,
        profileUrl: `https://www.linkedin.com/in/${slug}/`,
        expectedViewerSubject: VIEWER,
      })).toThrow(distance === "SELF"
        ? "use profiles.read for the signed-in self profile"
        : "not a 1st-degree connection");
      let nested: unknown = {
        vanityName: slug,
        vieweeProfileId: distance === "SELF" ? "123456789" : "ACoAAFixtureProfile",
        isSelfView: distance === "SELF",
      };
      for (let index = 0; index < 36; index += 1) nested = [null, nested];
      const deep = `<html><body><script>window.__como_rehydration__=${JSON.stringify([
        `1:${JSON.stringify(nested)}\n2:${JSON.stringify(JSON.stringify({
          networkDistance: distance === "SELF" ? 0 : distance === 2 || distance === "DISTANCE_2" ? 2 : 3,
        }))}`,
      ])}</script></body></html>`;
      expect(() => projectLinkedInProfileContactBinding({
        profileHtml: deep,
        profileUrl: `https://www.linkedin.com/in/${slug}/`,
        expectedViewerSubject: VIEWER,
      })).toThrow(distance === "SELF"
        ? "use profiles.read for the signed-in self profile"
        : "not a 1st-degree connection");
      const memberFlight = `<html><body><script>window.__como_rehydration__=${JSON.stringify([
        `1:I["ProfileView"]\n2:${JSON.stringify({
          vanityName: slug,
          vieweeProfileId: distance === "SELF" ? "123456789" : "ACoAAFixtureProfile",
          isSelfView: distance === "SELF",
        })}\n3:${JSON.stringify({
          vieweeMemberUrn: distance === "SELF" ? VIEWER : "urn:li:member:987654321",
          networkDistance: distance === "SELF" ? 0 : distance === 2 || distance === "DISTANCE_2" ? 2 : 3,
        })}`,
      ])}</script></body></html>`;
      expect(() => projectLinkedInProfileContactBinding({
        profileHtml: memberFlight,
        profileUrl: `https://www.linkedin.com/in/${slug}/`,
        expectedViewerSubject: VIEWER,
      })).toThrow(distance === "SELF"
        ? "use profiles.read for the signed-in self profile"
        : "not a 1st-degree connection");
      const slotDistance = distance === "SELF" ? "0" : distance === 2 || distance === "DISTANCE_2" ? "2" : "3";
      const slotMember = distance === "SELF" ? VIEWER : "urn:li:member:987654321";
      const slot6 =
        `networkDistance\\":${slotDistance},\\"vieweeMemberUrn\\":\\"${slotMember}\\",\\"breadcrumbType\\":\\"PROFILE_VIEW\\"`;
      const nonFlight = `<html><body><script>window.__como_rehydration__=${JSON.stringify([
        null,
        null,
        null,
        null,
        null,
        {
          vanityName: slug,
          vieweeProfileId: distance === "SELF" ? "123456789" : "ACoAAFixtureProfile",
          isSelfView: distance === "SELF",
        },
        slot6,
      ])}</script></body></html>`;
      expect(() => projectLinkedInProfileContactBinding({
        profileHtml: nonFlight,
        profileUrl: `https://www.linkedin.com/in/${slug}/`,
        expectedViewerSubject: VIEWER,
      })).toThrow(distance === "SELF"
        ? "use profiles.read for the signed-in self profile"
        : "not a 1st-degree connection");
    },
  ));
});

test("LinkedIn contact-info binding joins unique vieweeMemberUrn distance to vieweeProfileId identity", () => {
  assertProperty(fc.property(vanity, (slug) => {
    const html = `<html><body><script>window.__como_rehydration__=${JSON.stringify([
      `1:I["ProfileView"]\n2:${JSON.stringify({
        vanityName: slug,
        vieweeProfileId: "ACoAAFixtureProfile",
        isSelfView: false,
      })}\n3:networkDistance":1,"vieweeMemberUrn":"urn:li:member:987654321","extra":"${VIEWER}"`,
    ])}</script></body></html>`;
    expect(projectLinkedInProfileContactBinding({
      profileHtml: html,
      profileUrl: `https://www.linkedin.com/in/${slug}/`,
      expectedViewerSubject: VIEWER,
    })).toMatchObject({
      vanity: slug.toLowerCase(),
      profileUrn: PROFILE_URN,
      relationship: "first-degree",
    });
    const escaped = `<html><body><script>window.__como_rehydration__=${JSON.stringify([
      `1:I["PROFILE_VIEW"]\n2:${JSON.stringify({
        vanityName: slug,
        vieweeProfileId: "ACoAAFixtureProfile",
        isSelfView: false,
      })}\n3:networkDistance\\":1,\\"vieweeMemberUrn\\":\\"urn:li:member:987654321\\",\\"breadcrumbType\\":\\"PROFILE_VIEW\\"`,
    ])}</script></body></html>`;
    expect(projectLinkedInProfileContactBinding({
      profileHtml: escaped,
      profileUrl: `https://www.linkedin.com/in/${slug}/`,
      expectedViewerSubject: VIEWER,
    })).toMatchObject({
      vanity: slug.toLowerCase(),
      profileUrn: PROFILE_URN,
      relationship: "first-degree",
    });
    const slot6 =
      'networkDistance\\":1,\\"vieweeMemberUrn\\":\\"urn:li:member:987654321\\",\\"breadcrumbType\\":\\"PROFILE_VIEW\\"';
    expect(/(?:^|\n)(\d+):/u.test(slot6)).toBe(false);
    const nonFlight = `<html><body><script>window.__como_rehydration__=${JSON.stringify([
      null,
      null,
      null,
      null,
      null,
      {
        vanityName: slug,
        vieweeProfileId: "ACoAAFixtureProfile",
        isSelfView: false,
      },
      slot6,
    ])}</script></body></html>`;
    expect(projectLinkedInProfileContactBinding({
      profileHtml: nonFlight,
      profileUrl: `https://www.linkedin.com/in/${slug}/`,
      expectedViewerSubject: VIEWER,
    })).toMatchObject({
      vanity: slug.toLowerCase(),
      profileUrn: PROFILE_URN,
      relationship: "first-degree",
    });
  }));
});

test("LinkedIn contact-info projection never invents an email", () => {
  assertProperty(fc.property(
    vanity,
    fc.option(fc.constant("connection@example.test"), { nil: undefined }),
    (slug, email) => {
      const html = bootstrapHtml({
        $type: "com.linkedin.voyager.identity.profile.Profile",
        publicIdentifier: slug,
        entityUrn: PROFILE_URN,
        memberDistance: "DISTANCE_1",
      });
      const projected = projectLinkedInContactInfo({
        profileHtml: html,
        contactPayload: {
          $type: "com.linkedin.voyager.identity.profile.ProfileContactInfo",
          ...(email === undefined ? {} : { emailAddress: email }),
        },
        profileUrl: `https://www.linkedin.com/in/${slug}/`,
        expectedViewerSubject: VIEWER,
        observedAt: OBSERVED_AT,
      });
      expect(projected.contact.email).toBe(email ?? null);
      expect(JSON.stringify(projected)).not.toContain("@gmail.com");
    },
  ));
});
