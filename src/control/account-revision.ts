import { listAuthSnapshots, loadAuthSnapshotIfPresent, type AuthSnapshot } from "../auth";
import { canonicalJson, sha256 } from "../canonical-json";
import { authIncarnationReader, ensureReadProjectionAuthIncarnation, projectionAuthIdentityHash, withReadProjectionAuthAdmission, withSettledReadProjectionAuthAdmission, type AuthIncarnationReader } from "../read-projections";

/** An account editor revision binds both metadata and the exact account lifetime. */
export function connectionAccountRevision(snapshot: AuthSnapshot, environment: Readonly<Record<string, string | undefined>> = process.env): string {
  return withSettledReadProjectionAuthAdmission(snapshot.auth.id, environment, () => {
    const current = loadAuthSnapshotIfPresent(snapshot.auth.id, environment);
    if (current === null || current.contentSha256 !== snapshot.contentSha256) throw new Error("Account changed while its revision was being inspected.");
    return sha256(canonicalJson({
      schemaVersion: 1,
      metadata: snapshot.contentSha256,
      incarnation: projectionAuthIdentityHash(snapshot.auth.id, sha256(canonicalJson(snapshot.auth)), environment),
    }));
  });
}

/**
 * Snapshot listing revisions for every account in one bounded batch read: the
 * same digest inputs at the coherence listAuthSnapshots already provides. The
 * listing is a read path, so it holds only the incarnation read capability: it
 * takes no admission and creates nothing. An account without an incarnation
 * gets a revision bound to a null incarnation, which the admitted
 * connectionAccountRevision never produces, so a write against it fails closed
 * as a changed account and the next listing sees the incarnation that write
 * path created. A rotated or mid-write incarnation fails the same comparison.
 */
export function connectionAccountSnapshotRevisions(snapshots: readonly AuthSnapshot[], incarnations: AuthIncarnationReader): ReadonlyMap<string, string> {
  const identities = incarnations.identityHashesIfPresent(
    snapshots.map((snapshot) => ({ authId: snapshot.auth.id, exactAuthContentHash: sha256(canonicalJson(snapshot.auth)) })),
  );
  const revisions = new Map<string, string>();
  for (const snapshot of snapshots) {
    revisions.set(snapshot.auth.id, sha256(canonicalJson({
      schemaVersion: 1,
      metadata: snapshot.contentSha256,
      incarnation: identities.get(snapshot.auth.id) ?? null,
    })));
  }
  return revisions;
}

/**
 * Startup backfill for accounts saved before incarnations existed, so the
 * read-only snapshot never has to create one. Each creation runs under the
 * account's admission and only while the account is still configured. An
 * account whose admission is contended or whose state is unreadable is
 * returned instead of failing startup; its snapshot revision stays unmatched
 * until a write path creates the incarnation.
 */
export function ensureConnectionAccountIncarnations(environment: Readonly<Record<string, string | undefined>> = process.env): readonly string[] {
  const listed = listAuthSnapshots(environment);
  const present = authIncarnationReader(environment).identityHashesIfPresent(
    listed.map((snapshot) => ({ authId: snapshot.auth.id, exactAuthContentHash: sha256(canonicalJson(snapshot.auth)) })),
  );
  const unsettled: string[] = [];
  for (const snapshot of listed) {
    if (present.has(snapshot.auth.id)) continue;
    try {
      withReadProjectionAuthAdmission(snapshot.auth.id, environment, () => {
        if (loadAuthSnapshotIfPresent(snapshot.auth.id, environment) === null) return;
        ensureReadProjectionAuthIncarnation(snapshot.auth.id, environment);
      });
    } catch {
      unsettled.push(snapshot.auth.id);
    }
  }
  return Object.freeze(unsettled);
}
