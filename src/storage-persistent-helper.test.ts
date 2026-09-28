import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAuth, saveAuth } from "./auth";
import type { GhostgetManifest } from "./model";
import { enablePersistentStateHelpers, installManifest } from "./storage";
import { providerPluginRegistry as registry } from "./provider-plugins";
import { prepareInvocation } from "./runtime";
import { describeOperationPermission, setOperationPermission } from "./operation-permission";
import { enableOperationPermissions, readOperationPolicy } from "./operation-permission-store";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

// The long-lived automation host opts into persistent helpers; the storage
// contract (reads, CAS writes, claims and fail-closed policy) must not change.
test("persistent state helpers keep private-state reads, CAS writes and fail-closed policy exact", () => {
  enablePersistentStateHelpers();
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-permission-test-"))); chmodSync(directory, 0o700); directories.push(directory);
  const environment = { GHOSTGET_STATE_HOME: directory }, options = { environment, registry };
  installManifest(JSON.parse(readFileSync(join(import.meta.dir, "assets/adapters/x/wrench-adapter.json"), "utf8")) as GhostgetManifest, { force: false, environment, registry });
  const auth = createAuth("permission-account", { oauthProvider: "x", tokenFile: join(directory, "token.json"), scopes: ["tweet.read", "tweet.write", "users.read"], subject: "12345" });
  saveAuth(auth, environment);
  prepareInvocation("x", "posts.read", { post_ids: ["2078889282404569267"] }, auth.id, environment, registry);
  expect(describeOperationPermission("x", "posts.read", auth.id, options).decision).toBe("unmanaged");
  enableOperationPermissions(0, environment);
  const before = describeOperationPermission("x", "posts.read", auth.id, options);
  expect(before.decision).toBe("deny");
  setOperationPermission({ adapterId: "x", operationId: "posts.read", authId: auth.id, decision: "allow", expectedRevision: before.revision, expectedCapabilityDigest: before.digest }, options);
  expect(describeOperationPermission("x", "posts.read", auth.id, options).decision).toBe("allow");
  // A stale compare-and-set still loses, and the next request still succeeds.
  expect(() => setOperationPermission({ adapterId: "x", operationId: "posts.read", authId: auth.id, decision: "deny", expectedRevision: before.revision, expectedCapabilityDigest: before.digest }, options)).toThrow("changed");
  expect(readOperationPolicy(environment).revision).toBe(before.revision + 1);
  // A removed policy still blocks rather than reading as unmanaged.
  rmSync(join(directory, "operation-permissions/policy.json"));
  expect(() => describeOperationPermission("x", "posts.read", auth.id, options)).toThrow("blocked");
});
