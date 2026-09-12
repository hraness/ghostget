// @bun
import {
  MESSAGING_AUTOMATION_PROTOCOL
} from "./index-01eeae9e.js";
import {
  __require
} from "./index-z1w83f81.js";

// src/messaging-automation-api.ts
async function createMessagingAutomationSession(options) {
  return (await import("./messaging-automation-factory-6e0j1qpj.js")).createMessagingAutomationSession(options);
}
async function createMessagingAutomationHost(providers, environment) {
  const { MessagingAutomationHost } = await import("./messaging-automation-v5wk7gzn.js");
  return new MessagingAutomationHost(providers, environment);
}
async function installBundledMessagingRuntime(provider, environment) {
  return (await import("./messaging-native-install-sjexg09p.js")).installBundledMessagingRuntime(provider, environment);
}
export {
  installBundledMessagingRuntime,
  createMessagingAutomationSession,
  createMessagingAutomationHost,
  MESSAGING_AUTOMATION_PROTOCOL
};
