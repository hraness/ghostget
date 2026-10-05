// @bun
import {
  AUTOMATION_BINDING_CHANGED_REASON,
  AutomationGroupBindingChangedError,
  MESSAGING_AUTOMATION_PROTOCOL
} from "./index-m84wqtz6.js";
import {
  __require
} from "./index-z1w83f81.js";

// src/messaging-automation-api.ts
async function createMessagingAutomationHost(providers, environment) {
  const { MessagingAutomationHost } = await import("./messaging-automation-s68zhpsa.js");
  return new MessagingAutomationHost(providers, environment);
}
async function installBundledMessagingRuntime(provider, environment) {
  return (await import("./messaging-native-install-efhe2e86.js")).installBundledMessagingRuntime(provider, environment);
}
export {
  installBundledMessagingRuntime,
  createMessagingAutomationHost,
  MESSAGING_AUTOMATION_PROTOCOL,
  AutomationGroupBindingChangedError,
  AUTOMATION_BINDING_CHANGED_REASON
};
