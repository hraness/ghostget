// @bun
import {
  MESSAGING_AUTOMATION_PROTOCOL
} from "./index-01eeae9e.js";
import {
  __require
} from "./index-z1w83f81.js";

// src/messaging-automation-api.ts
async function createMessagingAutomationHost(providers, environment) {
  const { MessagingAutomationHost } = await import("./messaging-automation-yr2eyk33.js");
  return new MessagingAutomationHost(providers, environment);
}
async function installBundledMessagingRuntime(provider, environment) {
  return (await import("./messaging-native-install-dnpfvdr1.js")).installBundledMessagingRuntime(provider, environment);
}
export {
  installBundledMessagingRuntime,
  createMessagingAutomationHost,
  MESSAGING_AUTOMATION_PROTOCOL
};
