import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { connect as connectTls } from "node:tls";

/**
 * Aggregate run telemetry. One bounded POST per CLI invocation reports the
 * product name and version only — never arguments, paths, account data, or
 * output. A locally minted install token joins daily-active counts; it is
 * not synced, not an account identity, and rotates only when the user
 * deletes it. HRANESS_TELEMETRY=off or GHOSTGET_TELEMETRY=off disables it
 * entirely.
 *
 * The request rides an unref'd TLS socket: telemetry never holds the process
 * open, never delays an exit, and never changes a command's output or exit
 * status. A drop is acceptable — the signal is aggregate.
 */
const TELEMETRY_HOST = "account.hraness.com";
const TELEMETRY_PATH = "/api/telemetry/cli";
const TELEMETRY_TIMEOUT_MS = 1_500;
const INSTALL_TOKEN_PATTERN = /^[a-f0-9]{32}$/u;

export function ghostgetTelemetryDisabled(
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  return environment.HRANESS_TELEMETRY === "off"
    || environment.GHOSTGET_TELEMETRY === "off";
}

function telemetryConfigDirectory(
  environment: Readonly<Record<string, string | undefined>>,
): string {
  const xdg = environment.XDG_CONFIG_HOME;
  if (
    typeof xdg === "string" && xdg.length > 0 && xdg.length < 512
    && xdg.startsWith("/")
  ) {
    return join(xdg, "hraness");
  }
  return join(homedir(), ".config", "hraness");
}

async function installToken(
  environment: Readonly<Record<string, string | undefined>>,
): Promise<string | null> {
  const directory = telemetryConfigDirectory(environment);
  const path = join(directory, "telemetry-install");
  try {
    const existing = (await readFile(path, "utf8")).trim();
    if (INSTALL_TOKEN_PATTERN.test(existing)) return existing;
  } catch {}
  const token = randomUUID().replaceAll("-", "");
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(path, `${token}\n`, { mode: 0o600 });
    return token;
  } catch {
    return null;
  }
}

function sendTelemetryPost(body: string): void {
  try {
    const socket = connectTls({
      host: TELEMETRY_HOST,
      port: 443,
      servername: TELEMETRY_HOST,
    });
    socket.unref();
    socket.setTimeout(TELEMETRY_TIMEOUT_MS, () => socket.destroy());
    socket.on("secureConnect", () => {
      socket.write(
        `POST ${TELEMETRY_PATH} HTTP/1.1\r\n`
        + `host: ${TELEMETRY_HOST}\r\n`
        + "content-type: application/json\r\n"
        + `content-length: ${Buffer.byteLength(body)}\r\n`
        + "connection: close\r\n\r\n"
        + body,
      );
    });
    socket.on("data", () => socket.destroy());
    socket.on("error", () => socket.destroy());
    socket.on("close", () => socket.destroy());
  } catch {}
}

export async function reportGhostgetCliRun(
  version: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<void> {
  if (ghostgetTelemetryDisabled(environment)) return;
  try {
    const install = await installToken(environment);
    sendTelemetryPost(JSON.stringify({
      cli: "ghostget",
      ...(install === null ? {} : { install }),
      v: 1,
      version,
    }));
  } catch {}
}
