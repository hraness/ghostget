import { expect, test } from "bun:test";
import { assertProperty, fc } from "../test-support";

import {
  assertLinkedInContactInfoRequest,
  linkedInContactInfoTarget,
  linkedInProfileContactInfoGraphqlUrl,
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

test("LinkedIn contact-info targets and request paths stay bound to one vanity", () => {
  assertProperty(fc.property(vanity, (slug) => {
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
