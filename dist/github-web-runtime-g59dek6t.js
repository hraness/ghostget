// @bun
import {
  ReadEffectFailure,
  readAttempt,
  runReadEffect,
  withReadResource
} from "./index-mfj1vvc7.js";
import {
  ProviderReadResponseRejectedError,
  ProviderReadThrottledError,
  ProviderReadTransportError,
  failedProviderRead
} from "./index-4smh9n9x.js";
import {
  pinnedHttpsFetch
} from "./index-j3ysa35f.js";
import {
  readFailureProjection
} from "./index-aka7rgdj.js";
import {
  OperationDeadlineError
} from "./index-vtj5zdgf.js";
import"./index-n4szk3nw.js";
import"./index-z1w83f81.js";

// src/providers/github-web-runtime.ts
import * as Effect3 from "effect/Effect";

// src/providers/github-read-platform.ts
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

// src/providers/github-web.ts
var GITHUB_WEB_OPERATION_NAMES = Object.freeze([
  "profiles.read",
  "organizations.read"
]);
var GITHUB_WEB_OPERATIONS = Object.freeze({
  "profiles.read": Object.freeze({
    effect: "read",
    risk: "R1",
    state: "observed",
    reason: "fixed credential-free REST user read binds the requested username, immutable numeric account ID, and canonical profile URL before projecting exact follower, following, and public repository counts"
  }),
  "organizations.read": Object.freeze({
    effect: "read",
    risk: "R1",
    state: "observed",
    reason: "fixed credential-free REST organization read binds the requested organization, immutable numeric account ID, canonical public URL, exact follower count, and declared public repository count before a bounded completed public-repository pagination sums every exact stargazer count"
  })
});
var GITHUB_APP_ORIGIN = "https://github.com";
var GITHUB_API_ORIGIN = "https://api.github.com";
var GITHUB_REPOSITORIES_PER_PAGE = 100;
var GITHUB_MAX_ORGANIZATION_REPOSITORIES = 1e4;
var GITHUB_MAX_ORGANIZATION_REPOSITORY_PAGES = Math.ceil(GITHUB_MAX_ORGANIZATION_REPOSITORIES / GITHUB_REPOSITORIES_PER_PAGE);
function record(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}
function boundedString(value, label, maximum) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r\n]/u.test(value)) {
    throw new Error(`${label} must be bounded text`);
  }
  return value;
}
function optionalString(value, label, maximum) {
  if (value === undefined || value === null || value === "")
    return null;
  return boundedString(value, label, maximum);
}
function boundedInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a bounded integer`);
  }
  return value;
}
function exactCountMetric(value, label) {
  return Object.freeze({
    status: "available",
    value: boundedInteger(value, label),
    precision: "exact",
    unit: "count"
  });
}
function githubUsername(value, label = "GitHub username") {
  if (typeof value !== "string" || value.length < 1 || value.length > 39 || /[\0\r\n]/u.test(value)) {
    throw new Error(`${label} must be one canonical GitHub username`);
  }
  const username = value.toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/u.test(username) || username.includes("--")) {
    throw new Error(`${label} must be one canonical GitHub username`);
  }
  return username;
}
function githubOrganization(value, label = "GitHub organization") {
  return githubUsername(value, label);
}
function exactObservedAt(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error("GitHub statistics observedAt must be an exact UTC observation time");
  }
  return value;
}
function exactResponseUrl(value, origin, pathname, label, targetLabel) {
  const raw = boundedString(value, label, 512);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be one exact URL`);
  }
  if (url.origin !== origin || url.pathname.toLowerCase() !== pathname.toLowerCase() || url.search !== "" || url.hash !== "" || url.username !== "" || url.password !== "") {
    throw new Error(`${label} did not bind the requested GitHub ${targetLabel}`);
  }
  return url.href;
}
function projectGitHubProfileStats(value, expectedUsername, observedAt) {
  const username = githubUsername(expectedUsername);
  const profile = record(value, "GitHub profile stats");
  const responseUsername = githubUsername(profile.login, "GitHub profile stats login");
  if (responseUsername !== username) {
    throw new Error("GitHub profile stats response did not bind the requested username");
  }
  if (profile.type !== "User") {
    throw new Error("GitHub profile stats response is not one user profile");
  }
  const id = boundedInteger(profile.id, "GitHub profile stats ID", 1);
  exactResponseUrl(profile.url, GITHUB_API_ORIGIN, `/users/${responseUsername}`, "GitHub profile stats API URL", "profile");
  const profileUrl = exactResponseUrl(profile.html_url, GITHUB_APP_ORIGIN, `/${responseUsername}`, "GitHub profile stats public URL", "profile");
  return Object.freeze({
    schemaVersion: 1,
    provider: "github",
    target: Object.freeze({
      kind: "profile",
      id: String(id),
      url: profileUrl
    }),
    observedAt: exactObservedAt(observedAt),
    completeness: "complete",
    metrics: Object.freeze({
      followers: exactCountMetric(profile.followers, "GitHub followers"),
      following: exactCountMetric(profile.following, "GitHub following"),
      publicRepositories: exactCountMetric(profile.public_repos, "GitHub public repositories")
    }),
    metadata: Object.freeze({
      username: responseUsername,
      displayName: optionalString(profile.name, "GitHub profile stats display name", 1000),
      bio: optionalString(profile.bio, "GitHub profile stats bio", 1e4)
    })
  });
}
function parseGitHubOrganizationRead(value, expectedOrganization) {
  const organization = githubOrganization(expectedOrganization);
  const response = record(value, "GitHub organization stats");
  const responseOrganization = githubOrganization(response.login, "GitHub organization stats login");
  if (responseOrganization !== organization) {
    throw new Error("GitHub organization stats response did not bind the requested organization");
  }
  if (response.type !== "Organization") {
    throw new Error("GitHub organization stats response is not one organization");
  }
  const id = boundedInteger(response.id, "GitHub organization stats ID", 1);
  exactResponseUrl(response.url, GITHUB_API_ORIGIN, `/orgs/${responseOrganization}`, "GitHub organization stats API URL", "organization");
  const url = exactResponseUrl(response.html_url, GITHUB_APP_ORIGIN, `/${responseOrganization}`, "GitHub organization stats public URL", "organization");
  return Object.freeze({
    id,
    organization: responseOrganization,
    url,
    followers: boundedInteger(response.followers, "GitHub organization followers"),
    publicRepositories: boundedInteger(response.public_repos, "GitHub organization public repositories")
  });
}
function projectGitHubOrganizationRepository(value, organization) {
  const repository = record(value, "GitHub organization public repository");
  const owner = record(repository.owner, "GitHub organization repository owner");
  const ownerOrganization = githubOrganization(owner.login, "GitHub organization repository owner login");
  if (ownerOrganization !== organization.organization || boundedInteger(owner.id, "GitHub organization repository owner ID", 1) !== organization.id || owner.type !== "Organization") {
    throw new Error("GitHub organization repository did not bind the requested organization");
  }
  if (repository.private !== false || repository.visibility !== "public") {
    throw new Error("GitHub organization repository is not one public repository");
  }
  const name = boundedString(repository.name, "GitHub organization repository name", 100);
  const fullName = boundedString(repository.full_name, "GitHub organization repository full name", 256);
  if (fullName.toLowerCase() !== `${organization.organization}/${name}`.toLowerCase()) {
    throw new Error("GitHub organization repository did not bind its public name");
  }
  return Object.freeze({
    id: boundedInteger(repository.id, "GitHub organization repository ID", 1),
    stars: boundedInteger(repository.stargazers_count, "GitHub organization repository stargazers")
  });
}
function projectGitHubOrganizationStats(organization, totalStars, observedAt) {
  return Object.freeze({
    schemaVersion: 1,
    provider: "github",
    target: Object.freeze({
      kind: "organization",
      id: String(organization.id),
      url: organization.url
    }),
    observedAt: exactObservedAt(observedAt),
    completeness: "complete",
    metrics: Object.freeze({
      stars: exactCountMetric(totalStars, "GitHub organization stars"),
      followers: exactCountMetric(organization.followers, "GitHub organization followers")
    }),
    metadata: Object.freeze({
      organization: organization.organization,
      publicRepositories: organization.publicRepositories
    })
  });
}

// src/providers/github-read-model.ts
function parseJson(bytes, label) {
  if (bytes.byteLength === 0) {
    throw new Error(`${label} was empty`);
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} was not valid UTF-8`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} was not valid JSON`);
  }
}
function organizationRepositoriesUrl(organization, page) {
  const url = new URL(`/orgs/${organization}/repos`, GITHUB_API_ORIGIN);
  url.searchParams.set("type", "public");
  url.searchParams.set("per_page", String(GITHUB_REPOSITORIES_PER_PAGE));
  url.searchParams.set("page", String(page));
  return url;
}
function exactNextPageLink(raw, organization, expectedPage) {
  if (raw === null)
    return false;
  let next = false;
  for (const segment of raw.split(",")) {
    const match = /^<([^<>]+)>;\s*rel="(first|last|next|prev)"$/u.exec(segment.trim());
    if (match === null) {
      throw new Error("GitHub organization repository pagination header drifted");
    }
    if (match[2] !== "next")
      continue;
    if (next) {
      throw new Error("GitHub organization repository pagination repeated next page");
    }
    const nextTarget = match[1];
    if (nextTarget === undefined) {
      throw new Error("GitHub organization repository pagination next link was invalid");
    }
    let url;
    try {
      url = new URL(nextTarget);
    } catch {
      throw new Error("GitHub organization repository pagination next link was invalid");
    }
    const expected = organizationRepositoriesUrl(organization, expectedPage);
    const keys = [...url.searchParams.keys()].sort();
    if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.username !== "" || url.password !== "" || url.hash !== "" || keys.join(",") !== "page,per_page,type" || url.searchParams.getAll("page").join(",") !== String(expectedPage) || url.searchParams.getAll("per_page").join(",") !== String(GITHUB_REPOSITORIES_PER_PAGE) || url.searchParams.getAll("type").join(",") !== "public") {
      throw new Error("GitHub organization repository pagination next link drifted");
    }
    next = true;
  }
  return next;
}
function repositoryPage(value) {
  if (!Array.isArray(value) || value.length > GITHUB_REPOSITORIES_PER_PAGE) {
    throw new Error("GitHub organization repository page was not one bounded array");
  }
  return Object.freeze([...value]);
}

// src/providers/github-read-platform.ts
class GitHubReadPlatform extends Context.Tag("wrench/GitHubReadPlatform/v1")() {
}
var native = (work) => Effect.tryPromise({ try: work, catch: (cause) => new ReadEffectFailure({ cause }) });
function GitHubReadPlatformLive(recipe, dependencies, deadline) {
  return Layer.scoped(GitHubReadPlatform, Effect.gen(function* () {
    const operation = yield* Effect.acquireRelease(readAttempt(() => {
      if (deadline !== undefined)
        return { signal: deadline.signal, dispose: () => {} };
      const controller = new AbortController;
      const timeout = setTimeout(() => controller.abort(), recipe.timeoutMs);
      return { signal: controller.signal, dispose: () => clearTimeout(timeout) };
    }), (operation2) => Effect.sync(operation2.dispose));
    const fetch = dependencies?.fetch ?? pinnedHttpsFetch;
    const maximum = Math.min(recipe.maxOutputBytes, 2 * 1024 * 1024);
    return {
      observedAt: readAttempt(() => new Date(dependencies?.now?.() ?? Date.now()).toISOString()),
      request: (request) => Effect.gen(function* () {
        const timeout = yield* readAttempt(() => {
          deadline?.throwIfUnavailable(request.operationLabel);
          const remaining = Math.min(recipe.timeoutMs, deadline?.remainingTimeMs() ?? recipe.timeoutMs);
          if (remaining < 1000)
            throw new OperationDeadlineError(request.operationLabel, "timed-out");
          return remaining;
        });
        const response = yield* native(() => fetch(request.url, {
          method: "GET",
          headers: {
            accept: "application/vnd.github+json",
            "user-agent": request.userAgent,
            "x-github-api-version": "2026-03-10"
          },
          redirect: "error",
          signal: operation.signal
        }, timeout)).pipe(Effect.mapError((error) => {
          if (operation.signal.aborted) {
            try {
              deadline?.throwIfUnavailable(request.operationLabel);
            } catch (cause) {
              return new ReadEffectFailure({ cause });
            }
            return new ReadEffectFailure({ cause: new OperationDeadlineError(request.operationLabel, "timed-out") });
          }
          return new ReadEffectFailure({ cause: new ProviderReadTransportError(error.cause) });
        }));
        const metadata = yield* readAttempt(() => {
          if (response.status !== 200) {
            const retryAfter = response.headers.get("retry-after");
            if (response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || retryAfter !== null && /^(?:0|[1-9][0-9]{0,8})$/u.test(retryAfter)))
              throw new ProviderReadThrottledError;
            throw new ProviderReadResponseRejectedError(response.status);
          }
          const type = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
          if (type !== "application/json" && type?.endsWith("+json") !== true)
            throw new Error(`${request.apiLabel} returned an unreviewed content type`);
          const link = request.pagination ? response.headers.get("link") : null;
          if (link !== null && (link.length > 8 * 1024 || /[\0\r\n]/u.test(link)))
            throw new Error("GitHub organization repository pagination header exceeded its reviewed bounds");
          const declared = response.headers.get("content-length");
          if (declared !== null) {
            const length = Number(declared);
            if (!Number.isSafeInteger(length) || length < 0 || length > maximum)
              throw new Error(`${request.responseLabel} exceeded its byte limit`);
          }
          return link;
        }).pipe(Effect.catchTag("ReadEffectFailure", (primary) => native(() => response.body?.cancel() ?? Promise.resolve()).pipe(Effect.timeoutFail({
          duration: 500,
          onTimeout: () => new ReadEffectFailure({ cause: new Error("GitHub response cleanup did not settle") })
        }), Effect.matchEffect({
          onFailure: (cleanup) => Effect.fail(new ReadEffectFailure({ cause: primary.cause, cleanupCause: cleanup.cause })),
          onSuccess: () => Effect.fail(primary)
        }))));
        const bytes = response.body === null ? new Uint8Array : yield* withReadResource(readAttempt(() => response.body.getReader()), (reader) => Effect.gen(function* () {
          const chunks = [];
          let length = 0;
          while (true) {
            const result = yield* native(() => deadline === undefined ? reader.read() : deadline.run(() => reader.read(), request.responseLabel)).pipe(Effect.mapError((error) => error.cause instanceof OperationDeadlineError ? error : new ReadEffectFailure({ cause: new ProviderReadTransportError(error.cause) })));
            if (result.done)
              break;
            yield* readAttempt(() => {
              if (!(result.value instanceof Uint8Array))
                throw new Error(`${request.responseLabel} returned an unreviewed body chunk`);
              length += result.value.byteLength;
              if (length > maximum)
                throw new Error(`${request.responseLabel} exceeded its byte limit`);
              chunks.push(result.value);
            });
          }
          return yield* readAttempt(() => {
            const joined = new Uint8Array(length);
            let offset = 0;
            for (const chunk of chunks) {
              joined.set(chunk, offset);
              offset += chunk.byteLength;
            }
            return joined;
          });
        }).pipe(Effect.catchTag("ReadEffectFailure", (primary) => native(() => reader.cancel()).pipe(Effect.timeoutFail({
          duration: 500,
          onTimeout: () => new ReadEffectFailure({ cause: new Error("GitHub response cleanup did not settle") })
        }), Effect.matchEffect({
          onFailure: (cleanup) => Effect.fail(new ReadEffectFailure({ cause: primary.cause, cleanupCause: cleanup.cause })),
          onSuccess: () => Effect.fail(primary)
        })))), (reader) => readAttempt(() => reader.releaseLock()));
        return { value: yield* readAttempt(() => parseJson(bytes, request.responseLabel)), link: metadata };
      })
    };
  }));
}

// src/providers/github-read-program.ts
import * as Effect2 from "effect/Effect";
function githubOrganizationReadProgram(requestedOrganization) {
  return Effect2.gen(function* () {
    const platform = yield* GitHubReadPlatform;
    let stage = "target";
    return yield* Effect2.gen(function* () {
      const organizationResponse = yield* platform.request({
        url: new URL(`/orgs/${requestedOrganization}`, GITHUB_API_ORIGIN),
        userAgent: "wrench-github-organization-stats/1.1.0",
        operationLabel: "GitHub public organization statistics read deadline",
        apiLabel: "GitHub public organization API",
        responseLabel: "GitHub organization response",
        pagination: false
      });
      const organization = yield* readAttempt(() => parseGitHubOrganizationRead(organizationResponse.value, requestedOrganization));
      const pageCount = yield* readAttempt(() => {
        if (organization.publicRepositories > GITHUB_MAX_ORGANIZATION_REPOSITORIES)
          throw new Error("GitHub organization public repository count exceeded the reviewed pagination bound");
        const count = Math.ceil(organization.publicRepositories / GITHUB_REPOSITORIES_PER_PAGE);
        if (count > GITHUB_MAX_ORGANIZATION_REPOSITORY_PAGES)
          throw new Error("GitHub organization public repository page count exceeded the reviewed pagination bound");
        return count;
      });
      const repositoryIds = new Set;
      let totalStars = 0;
      stage = "supplemental";
      for (let page = 1;page <= pageCount; page += 1) {
        const response = yield* platform.request({
          url: organizationRepositoriesUrl(organization.organization, page),
          userAgent: "wrench-github-organization-stats/1.1.0",
          operationLabel: "GitHub public organization statistics read deadline",
          apiLabel: "GitHub public organization repository API",
          responseLabel: "GitHub organization repository response",
          pagination: true
        });
        yield* readAttempt(() => {
          const repositories = repositoryPage(response.value);
          const remaining = organization.publicRepositories - (page - 1) * GITHUB_REPOSITORIES_PER_PAGE;
          if (repositories.length !== Math.min(GITHUB_REPOSITORIES_PER_PAGE, remaining))
            throw new Error("GitHub organization repository page did not complete the declared public repository set");
          if (exactNextPageLink(response.link, organization.organization, page + 1) !== page < pageCount)
            throw new Error("GitHub organization repository pagination did not complete the declared public repository set");
          for (const value of repositories) {
            const repository = projectGitHubOrganizationRepository(value, organization);
            if (repositoryIds.has(repository.id))
              throw new Error("GitHub organization repository pagination repeated one repository");
            repositoryIds.add(repository.id);
            if (repository.stars > Number.MAX_SAFE_INTEGER - totalStars)
              throw new Error("GitHub organization star total exceeded a safe integer");
            totalStars += repository.stars;
          }
        });
      }
      const observedAt = yield* platform.observedAt;
      const output = yield* readAttempt(() => {
        if (repositoryIds.size !== organization.publicRepositories)
          throw new Error("GitHub organization repository pagination did not complete the declared public repository set");
        return projectGitHubOrganizationStats(organization, totalStars, observedAt);
      });
      return {
        status: "succeeded",
        output,
        finalUrl: output.target.url,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 }
      };
    }).pipe(Effect2.catchTag("ReadEffectFailure", (error) => {
      const failure = failedProviderRead("GitHub organization", error.cause, `https://github.com/${requestedOrganization}`, { stage, authenticated: false, targetStatusUnavailable: true });
      return Effect2.succeed(Object.hasOwn(error, "cleanupCause") ? { ...failure, readFailure: readFailureProjection("cleanup-required") } : failure);
    }));
  });
}

// src/providers/github-web-runtime.ts
var MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
var MAX_LINK_HEADER_BYTES = 8 * 1024;
var PROFILE_OPERATION_LABEL = "GitHub public profile read deadline";
var PROFILE_USER_AGENT = "wrench-github-profile-stats/1.0.0";
function remainingTimeoutMs(timeoutMs, deadline, label) {
  deadline?.throwIfUnavailable(label);
  const remaining = Math.min(timeoutMs, deadline?.remainingTimeMs() ?? timeoutMs);
  if (remaining < 1000) {
    throw new OperationDeadlineError(label, "timed-out");
  }
  return remaining;
}
function exactProfileInput(input) {
  const keys = Object.keys(input);
  if (keys.length !== 1 || keys[0] !== "username") {
    throw new Error("GitHub profiles.read accepts only input.username");
  }
  return githubUsername(input.username, "input.username");
}
function exactOrganizationInput(input) {
  const keys = Object.keys(input);
  if (keys.length !== 1 || keys[0] !== "organization") {
    throw new Error("GitHub organizations.read accepts only input.organization");
  }
  return githubOrganization(input.organization, "input.organization");
}
function jsonContentType(response) {
  const raw = response.headers.get("content-type");
  if (raw === null)
    return false;
  const type = raw.split(";", 1)[0]?.trim().toLowerCase();
  return type === "application/json" || type?.endsWith("+json") === true;
}
async function boundedBytes(response, maximum, deadline, label) {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const length2 = Number(declared);
    if (!Number.isSafeInteger(length2) || length2 < 0 || length2 > maximum) {
      response.body?.cancel().catch(() => {
        return;
      });
      throw new Error(`${label} exceeded its reviewed byte limit`);
    }
  }
  if (response.body === null)
    return new Uint8Array;
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;; ) {
      const item = await (async () => {
        try {
          return deadline === undefined ? await reader.read() : await deadline.run(() => reader.read(), label);
        } catch (error) {
          if (error instanceof OperationDeadlineError)
            throw error;
          throw new ProviderReadTransportError(error);
        }
      })();
      if (item.done)
        break;
      if (!(item.value instanceof Uint8Array) || item.value.byteLength > maximum - length) {
        reader.cancel().catch(() => {
          return;
        });
        throw new Error(`${label} exceeded its reviewed byte limit`);
      }
      chunks.push(item.value);
      length += item.value.byteLength;
    }
  } catch (error) {
    reader.cancel().catch(() => {
      return;
    });
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
function parseJson2(bytes, label) {
  if (bytes.byteLength === 0) {
    throw new Error(`${label} was empty`);
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} was not valid UTF-8`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} was not valid JSON`);
  }
}
function githubHeaders(userAgent) {
  return {
    accept: "application/vnd.github+json",
    "user-agent": userAgent,
    "x-github-api-version": "2026-03-10"
  };
}
async function requestGitHubJson(url, userAgent, maximum, fetch, signal, timeoutMs, deadline, operationLabel, apiLabel, responseLabel, readPaginationLink) {
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: githubHeaders(userAgent),
      redirect: "error",
      signal
    }, remainingTimeoutMs(timeoutMs, deadline, operationLabel));
  } catch (error) {
    if (signal.aborted) {
      if (deadline !== undefined)
        deadline.throwIfUnavailable(operationLabel);
      throw new OperationDeadlineError(operationLabel, "timed-out");
    }
    throw new ProviderReadTransportError(error);
  }
  if (response.status !== 200) {
    response.body?.cancel().catch(() => {
      return;
    });
    const retryAfter = response.headers.get("retry-after");
    if (response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || retryAfter !== null && /^(?:0|[1-9][0-9]{0,8})$/u.test(retryAfter)))
      throw new ProviderReadThrottledError;
    throw new ProviderReadResponseRejectedError(response.status);
  }
  if (!jsonContentType(response)) {
    response.body?.cancel().catch(() => {
      return;
    });
    throw new Error(`${apiLabel} returned an unreviewed content type`);
  }
  const link = readPaginationLink ? response.headers.get("link") : null;
  if (link !== null && (link.length > MAX_LINK_HEADER_BYTES || /[\0\r\n]/u.test(link))) {
    response.body?.cancel().catch(() => {
      return;
    });
    throw new Error("GitHub organization repository pagination header exceeded its reviewed bounds");
  }
  return Object.freeze({
    value: parseJson2(await boundedBytes(response, maximum, deadline, responseLabel), responseLabel),
    link
  });
}
function signalForOperation(recipe, deadline) {
  if (deadline !== undefined) {
    return Object.freeze({ signal: deadline.signal, dispose: () => {
      return;
    } });
  }
  const controller = new AbortController;
  const timeout = setTimeout(() => controller.abort(), recipe.timeoutMs);
  return Object.freeze({
    signal: controller.signal,
    dispose: () => clearTimeout(timeout)
  });
}
async function executeGitHubPublicProfileRead(recipe, input, dependencies, operationDeadline) {
  if (recipe.site !== "github" || recipe.action !== "profiles.read" || recipe.contractVersion !== 1 || GITHUB_WEB_OPERATIONS["profiles.read"].state !== "observed") {
    throw new Error("GitHub public profiles.read contract is not installed");
  }
  const username = exactProfileInput(input);
  const url = new URL(`/users/${username}`, GITHUB_API_ORIGIN);
  const fetch = dependencies?.fetch ?? pinnedHttpsFetch;
  const operation = signalForOperation(recipe, operationDeadline);
  try {
    const response = await requestGitHubJson(url, PROFILE_USER_AGENT, Math.min(recipe.maxOutputBytes, MAX_RESPONSE_BYTES), fetch, operation.signal, recipe.timeoutMs, operationDeadline, PROFILE_OPERATION_LABEL, "GitHub public profile API", "GitHub profile response", false);
    const output = projectGitHubProfileStats(response.value, username, new Date(dependencies?.now?.() ?? Date.now()).toISOString());
    return {
      status: "succeeded",
      output,
      finalUrl: output.target.url,
      dispatchStarted: false,
      dispatch: { planned: 0, started: 0, verified: 0 }
    };
  } catch (error) {
    return failedProviderRead("GitHub profile", error, `https://github.com/${username}`, {
      stage: "target",
      authenticated: false,
      targetStatusUnavailable: true
    });
  } finally {
    operation.dispose();
  }
}
async function executeGitHubPublicOrganizationRead(recipe, input, dependencies, operationDeadline) {
  if (recipe.site !== "github" || recipe.action !== "organizations.read" || recipe.contractVersion !== 1 || GITHUB_WEB_OPERATIONS["organizations.read"].state !== "observed") {
    throw new Error("GitHub public organizations.read contract is not installed");
  }
  const requestedOrganization = exactOrganizationInput(input);
  return runReadEffect(githubOrganizationReadProgram(requestedOrganization).pipe(Effect3.provide(GitHubReadPlatformLive(recipe, dependencies, operationDeadline))));
}
function probeGitHubWebSubject(_auth) {
  return Promise.reject(new Error("GitHub public statistics reads do not use an auth realm"));
}
function executeGitHubAuthenticatedOperation() {
  return Promise.reject(new Error("GitHub has no installed authenticated web operations"));
}
export {
  probeGitHubWebSubject,
  executeGitHubPublicProfileRead,
  executeGitHubPublicOrganizationRead,
  executeGitHubAuthenticatedOperation
};
