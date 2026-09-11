import { loadAuthSnapshotIfPresent, type AuthSnapshot } from "../auth";
import { canonicalJson, sha256 } from "../canonical-json";
import { projectionAuthIdentityHash, withSettledReadProjectionAuthAdmission } from "../read-projections";

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
