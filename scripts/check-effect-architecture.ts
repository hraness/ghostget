import { resolve } from "node:path";
import { createArchitectureProgram, inspectEffectArchitecture } from "./effect-architecture";
const root = resolve(import.meta.dir, "..");
const findings = inspectEffectArchitecture(createArchitectureProgram(resolve(root, "tsconfig.json")), {
  root,
  modules: [
    "src/read-effect.ts", "src/read-effect-platform.ts", "src/read-effect-runtime.ts",
    "src/invocation-read-platform.ts", "src/invocation-read-program.ts", "src/invocation-read-runtime.ts",
    "src/read-admission-runtime.ts", "src/web-session-read-runtime.ts",
    "src/providers/github-read-platform.ts", "src/providers/github-read-program.ts", "src/providers/github-web-runtime.ts",
    "src/providers/linkedin-self-platform.ts", "src/providers/linkedin-self-program.ts", "src/providers/linkedin-web-runtime.ts",
    "src/providers/linkedin-company-platform.ts", "src/providers/linkedin-company-program.ts",
  ],
  adapters: ["src/read-effect-platform.ts", "src/invocation-read-platform.ts", "src/read-admission-runtime.ts", "src/web-session-read-runtime.ts", "src/providers/github-read-platform.ts", "src/providers/github-web-runtime.ts", "src/providers/linkedin-self-platform.ts", "src/providers/linkedin-web-runtime.ts", "src/providers/linkedin-company-platform.ts"],
  runtimeRoots: ["src/read-effect-runtime.ts", "src/invocation-read-runtime.ts", "src/read-admission-runtime.ts", "src/web-session-read-runtime.ts"],
  ignoredDirectories: ["scripts"],
});
for (const finding of findings) console.error(`${finding.file}:${finding.line} ${finding.rule}: ${finding.message}`);
if (findings.length > 0) process.exitCode = 1;
