// @bun
// src/messaging-automation-types.ts
var MESSAGING_AUTOMATION_PROTOCOL = "ghostget.messaging-automation/1";
var AUTOMATION_BINDING_CHANGED_REASON = "ghostget.binding-changed.v1";

class AutomationGroupBindingChangedError extends Error {
  identity;
  coordinate;
  constructor(identity, coordinate) {
    super(AUTOMATION_BINDING_CHANGED_REASON);
    this.identity = identity;
    this.coordinate = coordinate;
    this.name = "AutomationGroupBindingChangedError";
  }
}

export { MESSAGING_AUTOMATION_PROTOCOL, AUTOMATION_BINDING_CHANGED_REASON, AutomationGroupBindingChangedError };
