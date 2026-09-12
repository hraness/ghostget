# Contents

- `protocol.ts` – browser-safe administrative and agent contracts.
- `helper.ts`, `service.ts` – process custody, transport and control composition.
- `approval-*.ts` – exact human request and one-use approval lifetimes.
- `web-*.ts`, `activity.ts` – bounded public retrieval and SQLite metadata.
- `interface*.ts` – OpenAPI parsing, inert drafts and conditional activation.
- `connections.ts` – subject-bound account setup.
- `vault-*.ts`, `credential-executor.ts`, `credential-gateway.ts` – private credential sources, exact grants, native process custody and authenticated retrieval.
- `vault.ts`, `credential-helper.ts` – historical X import implementation; new administrative imports are rejected.
- Colocated tests exercise boundary, lifetime and property laws.

# Guidelines

`protocol.ts` is the browser-safe shared contract. `helper.ts` owns private
administrative stdio and a separate owner-only agent socket. Agent requests
cannot grant approvals, alter policy, connect accounts, or resolve secrets.
Keep both protocols bounded and reject drift before dispatch.

`service.ts` composes current account, manifest and implementation identities.
Display optimizations must not cache authorization across a changed account,
policy, interface or executable closure. User OpenAPI documents remain inert
until exact conditional activation and never create arbitrary HTTP executors.

`web-policy.ts`, `web-gateway.ts` and `activity.ts` form one admission boundary:
durable metadata before dispatch, public pinned DNS, no redirects or ambient
credentials, policy rechecks, and durable terminal evidence before disclosure.
Request bodies, query values, secrets, response bodies and raw transport errors
must not enter activity storage. A cancellation or interrupted record does not
authorize a retry. Legacy provider dispatch journals remain separate.

The isolated vault helper owns SDK loading and credential use. Native AppKit
entry and macOS Keychain keep secrets out of renderer fields, arguments,
environment, agent responses and logs. A dedicated 1Password service account
must expose exactly the chosen vault; the user configures its Read Items-only
permissions. Bootstrap keys and ordinary credentials use separate namespaces.

Credential grants admit one exact HTTPS GET, Basic or Bearer authentication,
and selected non-secret scalar JSON pointers. Require the matching web rule,
stricter decision, fresh revision/digest and expiry at every effect/disclosure
boundary. The endpoint receives the credential and must be trusted; response
filtering cannot contain a malicious credential recipient. No arbitrary browser
form filling, passkey assertion, URL/header substitution or plaintext read API.

Persist creation intent before native dispatch and require a strict terminal
reply plus joined stdin/stdout/process before recording native completion.
Cleanup must prove the creating Bun incarnation dead and the native receipt
settled before exact-key deletion. Unknown outcomes require manual recovery;
PID death does not establish completed creation. Removal revokes grants before
storage cleanup. Lock/revoke can interrupt a manager, while other mutations
serialize; uncertain process custody blocks credential use until restart.
Connection and helper shutdown must settle owned work before custody is released.
