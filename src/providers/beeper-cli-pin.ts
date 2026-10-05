export type BeeperCliArtifactPin = Readonly<{
  platform: "darwin" | "linux";
  arch: "arm64" | "x64";
  archiveSha256: string;
  executableSha256: string;
  downloadUrl: string;
}>;

export const BEEPER_CLI_DARWIN_ARM64_ARTIFACT_PIN = Object.freeze({
  platform: "darwin",
  arch: "arm64",
  archiveSha256:
    "688ccde7e7d044d33980cd06474bf1ae7215ccf8ca79967262fa3bfb85a2589a",
  executableSha256:
    "48aa895449129c793a212ea19f69a534adc34a8adc4037ca1d7da9e648716425",
  downloadUrl:
    "https://github.com/beeper/cli/releases/download/v0.6.2/beeper-cli-0.6.2-macos-arm64.zip",
} as const);

export const BEEPER_CLI_PIN = Object.freeze({
  id: "beeper-cli",
  implementation: "github.com/beeper/cli",
  version: "0.6.2",
  commit: "a416af06023449a87312dc11e54643fd9dc94b8c",
  releaseManifestSha256:
    "5c52b533180151b97e26138ef687b6b819170687b34a478184e5648335356950",
  releaseManifestUrl:
    "https://github.com/beeper/cli/releases/download/v0.6.2/binaries.json",
  releaseUrl: "https://github.com/beeper/cli/releases/tag/v0.6.2",
  sourceUrl:
    "https://github.com/beeper/cli/tree/a416af06023449a87312dc11e54643fd9dc94b8c",
  // Frozen v0.14 specialized-export identity. New local-cli contracts bind
  // the complete artifact table below; the released schema-1 receipt keeps
  // these exact Darwin arm64 field names and values.
  darwinArm64ArchiveSha256:
    BEEPER_CLI_DARWIN_ARM64_ARTIFACT_PIN.archiveSha256,
  darwinArm64BinarySha256:
    BEEPER_CLI_DARWIN_ARM64_ARTIFACT_PIN.executableSha256,
  downloadUrl: BEEPER_CLI_DARWIN_ARM64_ARTIFACT_PIN.downloadUrl,
  artifacts: Object.freeze([
    BEEPER_CLI_DARWIN_ARM64_ARTIFACT_PIN,
    Object.freeze({
      platform: "darwin",
      arch: "x64",
      archiveSha256:
        "4113a1979cfbd7839f14743158e70c12efa941313afb77ab2b11a08309196186",
      executableSha256:
        "83bb89edb6eeb9c61ebdb6ec940e0db30c90ecbca61d60a7408fe336e255f22e",
      downloadUrl:
        "https://github.com/beeper/cli/releases/download/v0.6.2/beeper-cli-0.6.2-macos-x64.zip",
    }),
    Object.freeze({
      platform: "linux",
      arch: "arm64",
      archiveSha256:
        "2bd37043a4ed863621edc59e28aaa652e8193e55abca0e9477f5aeae1c65d629",
      executableSha256:
        "102b8725bd99b03905dcff9fff645f3742e1697ce8d43ab9d8656896aafd12a8",
      downloadUrl:
        "https://github.com/beeper/cli/releases/download/v0.6.2/beeper-cli-0.6.2-linux-arm64.tar.gz",
    }),
    Object.freeze({
      platform: "linux",
      arch: "x64",
      archiveSha256:
        "a881e1d2bc91e31218b251716644ec5f8d161d5ccb30e7eab66cf2ba6410511d",
      executableSha256:
        "723cc3a6c556fa21b6ba11db8377d6a29776aca1660da48f0072883d6452ae3d",
      downloadUrl:
        "https://github.com/beeper/cli/releases/download/v0.6.2/beeper-cli-0.6.2-linux-x64.tar.gz",
    }),
  ] satisfies readonly BeeperCliArtifactPin[]),
} as const);

