/** This public import is inert in Node and Bun. Constructing the trusted owner
 * host is explicit and requires Bun; no import reads accounts or starts sync. */
export * from "./messaging-automation-types";
import type { AutomationProviderId, MessagingAutomationHostApi, MessagingAutomationProvider, MessagingRuntimeInstallation } from "./messaging-automation-types";

export async function createMessagingAutomationHost(providers: readonly MessagingAutomationProvider[], environment?: Readonly<Record<string, string | undefined>>): Promise<MessagingAutomationHostApi> {
  const { MessagingAutomationHost } = await import("./messaging-automation");
  return new MessagingAutomationHost(providers, environment);
}
export async function installBundledMessagingRuntime(provider: AutomationProviderId, environment?: Readonly<Record<string, string | undefined>>): Promise<MessagingRuntimeInstallation> {
  return (await import("./providers/messaging-native-install")).installBundledMessagingRuntime(provider, environment);
}
