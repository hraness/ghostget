import * as Effect from "effect/Effect";
import { readAttempt, type ReadEffectFailure } from "../read-effect";
import type { WebSessionExecution } from "../web-session-execution";
import { GitHubReadPlatform } from "./github-read-platform";
import {
  exactNextPageLink,
  organizationRepositoriesUrl,
  repositoryPage
} from "./github-read-model";
import {
  GITHUB_API_ORIGIN,
  GITHUB_MAX_ORGANIZATION_REPOSITORIES,
  GITHUB_MAX_ORGANIZATION_REPOSITORY_PAGES,
  GITHUB_REPOSITORIES_PER_PAGE,
  parseGitHubOrganizationRead,
  projectGitHubOrganizationRepository,
  projectGitHubOrganizationStats
} from "./github-web";
import { failedProviderRead, type ProviderReadFailureStage } from "./read-failure";

export function githubOrganizationReadProgram(requestedOrganization: string): Effect.Effect<WebSessionExecution, ReadEffectFailure, GitHubReadPlatform> {
  return Effect.gen(function*() {
    const platform = yield* GitHubReadPlatform;
    let stage: ProviderReadFailureStage = "target";
    return yield* Effect.gen(function*() {
      const organizationResponse = yield* platform.request({
        url: new URL(`/orgs/${requestedOrganization}`, GITHUB_API_ORIGIN),
        userAgent: "wrench-github-organization-stats/1.1.0",
        operationLabel: "GitHub public organization statistics read deadline",
        apiLabel: "GitHub public organization API",
        responseLabel: "GitHub organization response",
        pagination: false,
      });
      const organization = yield* readAttempt(() => parseGitHubOrganizationRead(organizationResponse.value, requestedOrganization));
      const pageCount = yield* readAttempt(() => {
        if (organization.publicRepositories > GITHUB_MAX_ORGANIZATION_REPOSITORIES) throw new Error("GitHub organization public repository count exceeded the reviewed pagination bound");
        const count = Math.ceil(organization.publicRepositories / GITHUB_REPOSITORIES_PER_PAGE);
        if (count > GITHUB_MAX_ORGANIZATION_REPOSITORY_PAGES) throw new Error("GitHub organization public repository page count exceeded the reviewed pagination bound");
        return count;
      });
      const repositoryIds = new Set<number>();
      let totalStars = 0;
      stage = "supplemental";
      for (let page = 1; page <= pageCount; page += 1) {
        const response = yield* platform.request({
          url: organizationRepositoriesUrl(organization.organization, page),
          userAgent: "wrench-github-organization-stats/1.1.0",
          operationLabel: "GitHub public organization statistics read deadline",
          apiLabel: "GitHub public organization repository API",
          responseLabel: "GitHub organization repository response",
          pagination: true,
        });
        yield* readAttempt(() => {
          const repositories = repositoryPage(response.value);
          const remaining = organization.publicRepositories - (page - 1) * GITHUB_REPOSITORIES_PER_PAGE;
          if (repositories.length !== Math.min(GITHUB_REPOSITORIES_PER_PAGE, remaining)) throw new Error("GitHub organization repository page did not complete the declared public repository set");
          if (exactNextPageLink(response.link, organization.organization, page + 1) !== (page < pageCount)) throw new Error("GitHub organization repository pagination did not complete the declared public repository set");
          for (const value of repositories) {
            const repository = projectGitHubOrganizationRepository(value, organization);
            if (repositoryIds.has(repository.id)) throw new Error("GitHub organization repository pagination repeated one repository");
            repositoryIds.add(repository.id);
            if (repository.stars > Number.MAX_SAFE_INTEGER - totalStars) throw new Error("GitHub organization star total exceeded a safe integer");
            totalStars += repository.stars;
          }
        });
      }
      const observedAt = yield* platform.observedAt;
      const output = yield* readAttempt(() => {
        if (repositoryIds.size !== organization.publicRepositories) throw new Error("GitHub organization repository pagination did not complete the declared public repository set");
        return projectGitHubOrganizationStats(organization, totalStars, observedAt);
      });
      return {
        status: "succeeded" as const,
        output,
        finalUrl: output.target.url,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 }
      };
    }).pipe(Effect.catchTag(
      "ReadEffectFailure",
      error => Effect.succeed(failedProviderRead(
        "GitHub organization",
        error.cause,
        `https://github.com/${requestedOrganization}`,
        { stage, authenticated: false, targetStatusUnavailable: true }
      ))
    ));
  });
}
