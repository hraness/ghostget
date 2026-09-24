---
title: Propose a checked IP address classifier for @hraness/kb
description: A proposal to @hraness/kb for an IP classifier whose deny table follows the IANA special-purpose registries and whose bit-level lookup is machine-checked, so Ghostget's web gateway claim about private addresses can become evidenced.
type: plan
area: verification
status: proposed
repository_scopes:
  - kb/plans/kb-ip-classifier-proposal.md
  - verification/claims.json
tags:
  - verification
  - web-gateway
  - ssrf
  - formal-methods
---

# Propose a checked IP address classifier for @hraness/kb

## Outcome

`@hraness/kb` ships an IP address classifier whose deny table is taken row by
row from the IANA IPv4 and IPv6 special-purpose address registries, whose
IPv6 policy admits only global unicast space, and whose bit-level lookup is
checked against that table for every 32-bit and 128-bit address. Ghostget then
pins that release, runs the classifier's golden vectors in its own
`verification` job, and moves `gateway-rejects-private-addresses` in
`verification/claims.json` from planned to evidenced.

This document is the Phase 7 proposal that
`kb/plans/formal-verification-assurance.md` calls for. Ghostget does not own
the classifier. The kb maintainers decide whether and how to adopt it; nothing
here is filed in the kb repository.

## Context

The web gateway resolves a host, then refuses to connect when
`isPrivateAddress` from `@hraness/kb/clip/network` reports the resolved
address as non-public. Ghostget reaches it through `src/pinned-https.ts`,
`src/derive.ts`, `src/model.ts`, and `src/derivation-network-proxy.ts`. That
function is the real SSRF boundary: `publicUrl` in
`src/control/validation.ts` refuses IP literals and reserved names, but it
cannot see where a public name resolves.

`isPrivateAddress` in `@hraness/kb` 0.19.6 is a hand-written chain of octet and
16-bit group comparisons. Probing it on 2026-09-23 against the registries
gave these results.

Addresses it reports as public that should be refused:

| Address | Why it should be refused |
| --- | --- |
| `::ffff:0:7f00:1` | The IPv4-translated form `::ffff:0:0:0/96` (RFC 2765, SIIT) of `127.0.0.1`. It is neither the mapped nor the compatible form, so the embedded address is never checked. |
| `::1:2:3:4:5` | Inside `::/8`, which the IPv6 address space registry reserves. Only the loopback, unspecified, mapped, and compatible forms are handled. |
| `4000::1`, `e000::1` | Outside `2000::/3`, the only IPv6 space IANA allocates for global unicast. |
| `192.88.99.1` | The deprecated 6to4 relay anycast block `192.88.99.0/24` (RFC 7526), still listed in the IPv4 registry. |

Public addresses it refuses:

| Address | Why it should be admitted |
| --- | --- |
| `192.0.1.1`, `192.0.43.10` | The code refuses all of `192.0.0.0/16`. The registry reserves only `192.0.0.0/24` and `192.0.2.0/24` inside it. |

These cases it handles correctly: `::ffff:10.0.0.1`, `64:ff9b::808:808`,
`2002:0a00:0001::1`, `fe80::1%en0`, `::`, and `::1` are refused, and `::8.8.8.8`
is admitted.

None of the over-admitted addresses is routable on the public internet today,
so the practical exposure depends on local routing: a host with a SIIT or
NAT64 translator, or an unusual local route, could reach an internal service
through one of them. The over-block refuses real public hosts in
`192.0.0.0/16`.

## Scope

In scope:

- The address classifier: IPv4 and IPv6 literals, including scoped IPv6 and
  every IPv6 form that embeds an IPv4 address.
- The deny table, its provenance, and its checks.
- The golden vectors that consumers such as Ghostget run.

Out of scope:

- Host name rules such as `localhost` suffixes, which `isPrivateHostname` and
  `publicUrl` cover.
- DNS resolution, pinning, and rebinding, which `createPinnedLookup` and the
  gateway's pinned transport cover.
- Local interface addresses, which `isAssignedLocalAddress` already compares.

## Decisions

- Refuse every block that the special-purpose registries list, whatever its
  "Globally Reachable" column says. The gateway retrieves web pages, and none
  of these blocks serves one.
- Admit IPv6 only inside `2000::/3`, then refuse the listed special-purpose
  blocks inside it. An allowlist of global unicast space fails closed when
  IANA assigns something new outside it.
- Refuse every IPv6 form that embeds an IPv4 address instead of classifying
  the embedded address: the mapped `::ffff:0:0/96`, translated
  `::ffff:0:0:0/96`, compatible `::/96`, NAT64 `64:ff9b::/96` and
  `64:ff9b:1::/48`, 6to4 `2002::/16`, and Teredo `2001::/32` forms. The
  resolver returns native IPv4 records for public IPv4 hosts, so admitting
  these forms buys nothing and adds a translation path to reason about. The
  mapped and compatible forms fall outside `2000::/3` and are refused by the
  allowlist; 6to4 and Teredo are refused by the table.
- Refuse any literal that is not canonical: dotted quads with leading zeros,
  fewer than four parts, or hexadecimal parts, and IPv6 text that the parser
  cannot read back to the same 128 bits. A resolver never returns these, so
  refusing them costs nothing.
- Keep one table, generated from the registries' CSV exports, as the single
  source for the implementation, the checks, and the vectors. Record the
  registry revision dates beside it.
- Check the lookup with Kani over a Rust reference model, then tie the
  TypeScript implementation to that model with generated vectors. Lean's
  `bv_decide` would prove the same statements, but it depends on the
  `Lean.ofReduceBool` axiom, which Ghostget's proof rules refuse; kernel-only
  Lean proofs over 128-bit vectors are possible but far more work for the same
  statements.

## Deny table

The IPv4 Special-Purpose Address Registry (RFC 6890 and later updates), plus
multicast and the limited broadcast address:

| Block | Name |
| --- | --- |
| `0.0.0.0/8` | "This network" |
| `10.0.0.0/8` | Private-Use |
| `100.64.0.0/10` | Shared Address Space |
| `127.0.0.0/8` | Loopback |
| `169.254.0.0/16` | Link Local |
| `172.16.0.0/12` | Private-Use |
| `192.0.0.0/24` | IETF Protocol Assignments, including DS-Lite `192.0.0.0/29` and the PCP, TURN, and NAT64 discovery anycast addresses |
| `192.0.2.0/24` | Documentation (TEST-NET-1) |
| `192.31.196.0/24` | AS112-v4 |
| `192.52.193.0/24` | AMT |
| `192.88.99.0/24` | Deprecated 6to4 Relay Anycast |
| `192.168.0.0/16` | Private-Use |
| `192.175.48.0/24` | Direct Delegation AS112 Service |
| `198.18.0.0/15` | Benchmarking |
| `198.51.100.0/24` | Documentation (TEST-NET-2) |
| `203.0.113.0/24` | Documentation (TEST-NET-3) |
| `224.0.0.0/4` | Multicast |
| `240.0.0.0/4` | Reserved, including `255.255.255.255/32` Limited Broadcast |

IPv6 admits only `2000::/3`, which leaves out `::/8` (with loopback,
unspecified, mapped, translated, and compatible forms), `64:ff9b::/96`,
`64:ff9b:1::/48`, `100::/64`, `5f00::/16`, `fc00::/7`, `fe80::/10`, the
deprecated `fec0::/10`, and `ff00::/8`. Inside `2000::/3` the table refuses:

| Block | Name |
| --- | --- |
| `2001::/23` | IETF Protocol Assignments, including Teredo `2001::/32`, benchmarking `2001:2::/48`, AMT `2001:3::/32`, AS112-v6 `2001:4:112::/48`, ORCHIDv2 `2001:20::/28`, and the anycast addresses in `2001:1::/48` |
| `2001:db8::/32` | Documentation |
| `2002::/16` | 6to4 |
| `2620:4f:8000::/48` | Direct Delegation AS112 Service |
| `3fff::/20` | Documentation |

Before adoption, regenerate both tables from the live registries, because
IANA adds rows. Phase 1 commits the exports, so a later refresh shows every
changed row as a diff.

## Work

### Phase 1: table and reference model

- Commit the registry CSV exports and a generator that emits the deny table as
  data for both the TypeScript classifier and a Rust reference crate.
- Write the Rust reference: `classify_v4(u32)` and `classify_v6(u128)`, each a
  prefix-table lookup that returns public or the refusing row.
- Write the TypeScript classifier to read the same generated table. Keep
  `isPrivateAddress` as a thin wrapper so every consumer keeps its import.

### Phase 2: Kani proofs

Prove these for symbolic inputs, with no unwinding bound that could cut a
path short:

- P1, v4 soundness: if `classify_v4(a)` is public, no table row contains `a`.
- P2, v4 completeness: if no table row contains `a`, `classify_v4(a)` is
  public. This is the check that catches the `192.0.0.0/16` over-block.
- P3, v6 policy: `classify_v6(a)` is public exactly when `a` is inside
  `2000::/3` and no table row contains `a`.
- P4, embedded forms: every address in the mapped, translated, compatible,
  NAT64, 6to4, and Teredo blocks is refused.
- P5, table shape: rows are well-formed prefixes whose host bits are zero.

Seed each proof with a mutant it must reject: the `/16` over-block for P2,
dropping `::ffff:0:0:0/96` for P4, admitting `4000::/3` for P3, and a row with
host bits set for P5. A Kani timeout or an unfinished run is not evidence.

### Phase 3: parser and vectors

- The Rust reference emits golden vectors: for every row, its first and last
  address and the addresses one below and one above it, each in canonical and
  alternate text forms (compressed and expanded IPv6, scoped IPv6, dotted
  IPv4 suffixes), with the expected decision.
- The TypeScript test reproduces every vector, and a property test compares
  random 32-bit and 128-bit values between the TypeScript classifier and the
  vectors' prefix rules.
- A parser property checks that each admitted literal parses to one address
  and prints back to the same canonical text, and that every non-canonical
  literal is refused.
- Optionally compare with Python's `ipaddress` module (`is_global`) as a third
  opinion, recording where its policy differs from this table rather than
  failing on it.

### Phase 4: Ghostget adoption

- Pin the kb release that ships the classifier, at its immutable release URL.
- Copy the classifier's golden vectors into `verification/vectors/` with their
  source release, and run them through the classifier as Ghostget imports it,
  in `verification-vectors.test.ts`.
- Move `gateway-rejects-private-addresses` to evidenced with those vectors and
  the test as evidence, and keep its note that DNS and TLS behaviour stay
  assumptions.

## Verification

- kb: the Kani proofs and their mutants pass in kb's CI, and the vector and
  parser tests pass.
- Ghostget: `bun run verify:oracles` reproduces the vectors against the pinned
  release, and `bun run ./scripts/verification-claims.ts check` passes with
  the claim evidenced.

## Recovery

- The new classifier refuses a superset of what the old one refuses, except
  for the `192.0.0.0/16` addresses outside its reserved `/24` blocks and the
  returned 6bone block `3ffe::/16`, which the old code still refuses. If a
  consumer depends on reaching a newly refused address, pin the previous kb
  release while the owner decides; do not add an exception to the table.
- Revert a failing proof job by PR, never by skipping it.
