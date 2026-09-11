// @bun
// src/provider-subject.ts
function isGmailAccountSubject(value) {
  if (value.length < 3 || value.length > 254 || !/^[\x21-\x7e]+$/u.test(value)) {
    return false;
  }
  const separator = value.indexOf("@");
  if (separator < 1 || separator !== value.lastIndexOf("@"))
    return false;
  const local = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..") || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/u.test(local) || domain.length > 253 || !domain.includes(".")) {
    return false;
  }
  return domain.split(".").every((label) => label.length >= 1 && label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/u.test(label));
}
function isXAccountSubject(value) {
  return /^[0-9]{1,19}$/u.test(value);
}
function isLinkedInProviderActorSubject(value) {
  return /^urn:li:(?:person:[A-Za-z0-9_-]{1,256}|organization:[0-9]{1,32})$/u.test(value);
}

export { isGmailAccountSubject, isXAccountSubject, isLinkedInProviderActorSubject };
