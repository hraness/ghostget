# ghostget.com

This directory owns the public GhostGet landing page. It is a deterministic,
dependency-free static build whose release facts come from the repository-root
package metadata. The published `@hraness/ghostget` package excludes this entire
directory through its explicit `files` allowlist.

The page is fully readable without JavaScript. A small progressive enhancement
adds copy feedback to the Agent Skill install command. Public content pages
serve HTML by default and Markdown when `Accept` prefers `text/markdown`.
`/llms.txt` is the agent site guide. On the canonical production host only, an
optional PostHog bootstrap records privacy-bounded page lifecycle events, the
two explicit repository links, `cta clicked` for the home page install and
getting-started links, and `install command copied` for the CLI and Agent Skill
commands. Events carry `site_id: "ghostget"`; events recorded before that id
changed carry the legacy `site_id` `wrench`, so a query that spans the change
should match both ids. The bootstrap never loads under Do Not Track. Set
`NEXT_PUBLIC_POSTHOG_KEY` to the shared project's public `phc_` token; `NEXT_PUBLIC_POSTHOG_HOST` defaults to
`https://us.i.posthog.com`.
The product-specific GhostGet mailing-list form renders on production builds.
Local and Preview builds keep the shared footer visible without rendering a
signup form.
The form retains the existing internal `wrench` audience ID so its subscribers
remain attached to the same list; the public name and origin are GhostGet.
No personal API key is used by the runtime build.

```sh
bun run website:check
```

The Vercel project uses the repository root and serves `website/dist`. Keep
Vercel System Environment Variables enabled and configure its Production Branch
as `main`. Project `prj_TZbDZ38ABPan158IqnczgsuTu6Ue` under team
`team_UAd1iD2XogJlbFg4h14mRaPM` must remain linked to GitHub repository ID
`1316443113` with `link.productionBranch=main`, `autoExposeSystemEnvs=true`,
and persistent `autoAssignCustomDomains=true`; this is not a per-release
switch. A false value can leave a candidate READY with GitHub success while the
apex and `www` stay on the old deployment. A staged candidate is recovered only
after pinning its exact identity and excluding competitors, using one
owner-authorized `vercel promote <exact-id-or-url>` followed by exact
target/domain readback; never a ref rewrite or individual alias assignment.
Checked-in workflows remain token-free and never mutate Vercel project
settings. The checked-in build command injects exact non-secret
marker `WRENCH_VERCEL_BUILD=release-bound-v1`. Local admission is allowed only
when that marker and every Vercel signal are absent; otherwise the exact marker,
`VERCEL=1`, valid `VERCEL_ENV`, and exact nonempty `VERCEL_GIT_COMMIT_REF` are
all required. Missing, malformed, or inconsistent platform state fails closed.
Production admission requires `VERCEL_GIT_COMMIT_REF=main`, while pull requests
and other refs produce previews only. Merging reviewed `main` history deploys
the site directly through the Vercel Git integration; there is no promotion
ref, writer workflow, or release marker between `main` and the live site, and
the site does not gate production on the latest release commit. Immutable
GitHub Release artifacts remain the sole admission for published downloads.
Root `middleware.ts` imports only `edge/negotiation.ts` for Accept q-values,
`406`, and markdown 404 bodies.

The shared footer also links to optional GhostGet development support on Hraness
Accounts. The link contains only the public product identity and web source. The
existing production-only newsletter form remains the signup surface; previews
keep that form disabled. Signup and payment require browser confirmation.
