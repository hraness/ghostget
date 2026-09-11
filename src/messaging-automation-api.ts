/** This public import is inert in Node and Bun. Constructing the trusted owner
 * host is explicit and requires Bun; no import reads accounts or starts sync. */
export * from "./messaging-automation-types";
export type { MessagingAutomationSessionOptions } from "./messaging-automation-factory";

export async function createMessagingAutomationSession(options: import("./messaging-automation-factory").MessagingAutomationSessionOptions) {
  return (await import("./messaging-automation-factory")).createMessagingAutomationSession(options);
}
export async function createMessagingAutomationHost(providers: readonly import("./messaging-automation-types").MessagingAutomationProvider[], environment?: Readonly<Record<string, string | undefined>>) {
  const { MessagingAutomationHost } = await import("./messaging-automation");
  return new MessagingAutomationHost(providers, environment);
}
export async function installBundledMessagingRuntime(provider: "imessage" | "whatsapp", environment?: Readonly<Record<string, string | undefined>>) {
  return (await import("./providers/messaging-native-install")).installBundledMessagingRuntime(provider, environment);
}
