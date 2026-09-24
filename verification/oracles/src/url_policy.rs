//! The WHATWG URL components that the `url` crate parses, and an independent
//! reading of Ghostget's public web-gateway URL admission rules over those
//! components.
//!
//! The admission rules restate the policy that `publicUrl` in
//! `src/control/validation.ts` documents: one credential-free, fragment-free,
//! default-port HTTPS URL whose serialization equals its input, with a DNS
//! name of letter-digit-hyphen labels ending in an alphabetic top-level label,
//! no reserved suffix, a literal path without percent escapes, semicolons, or
//! empty segments, and no repeated query key. They are written from that
//! statement over the `url` crate's parse, so a disagreement with the
//! TypeScript implementation points at a parser or policy difference.

use url::Url;

use crate::jcs::write_string;

/// The WHATWG URL API getters for one parsed URL.
pub struct Components {
    pub href: String,
    pub protocol: String,
    pub username: String,
    pub password: String,
    pub hostname: String,
    pub port: String,
    pub pathname: String,
    pub search: String,
    pub hash: String,
    /// Decoded `application/x-www-form-urlencoded` query keys, in order.
    pub query_keys: Vec<String>,
}

pub fn components(url: &Url) -> Components {
    Components {
        href: url::quirks::href(url).to_string(),
        protocol: url::quirks::protocol(url).to_string(),
        username: url::quirks::username(url).to_string(),
        password: url::quirks::password(url).to_string(),
        hostname: url::quirks::hostname(url).to_string(),
        port: url::quirks::port(url).to_string(),
        pathname: url::quirks::pathname(url).to_string(),
        search: url::quirks::search(url).to_string(),
        hash: url::quirks::hash(url).to_string(),
        query_keys: url.query_pairs().map(|(key, _)| key.into_owned()).collect(),
    }
}

/// Characters that the ECMAScript `\s` class matches in a Unicode-mode
/// regular expression: WhiteSpace and LineTerminator.
fn is_ecmascript_whitespace(character: char) -> bool {
    matches!(
        character,
        '\u{9}' | '\u{a}' | '\u{b}' | '\u{c}' | '\u{d}' | ' ' | '\u{a0}' | '\u{1680}'
            | '\u{2000}'..='\u{200a}'
            | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'
    )
}

/// The control characters that the gateway's bounded string reader refuses.
fn is_refused_control(character: char) -> bool {
    matches!(character, '\u{0}'..='\u{8}' | '\u{b}' | '\u{c}' | '\u{e}'..='\u{1f}' | '\u{7f}')
}

/// Percent escapes that decode to a byte whose meaning differs between
/// servers: NUL, LF, CR, '/', '\', '.', and '%'.
fn has_ambiguous_escape(raw: &str) -> bool {
    let bytes = raw.as_bytes();
    bytes.windows(3).any(|window| {
        window[0] == b'%'
            && matches!(
                (window[1].to_ascii_lowercase(), window[2].to_ascii_lowercase()),
                (b'0', b'0') | (b'0', b'a') | (b'0', b'd') | (b'2', b'f') | (b'5', b'c') | (b'2', b'e') | (b'2', b'5')
            )
    })
}

fn is_ldh_label(label: &str) -> bool {
    let bytes = label.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 63
        && bytes.iter().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'-')
        && bytes[0] != b'-'
        && bytes[bytes.len() - 1] != b'-'
}

/// A lowercase DNS name of at least two labels whose last label is 2 to 63
/// ASCII letters.
fn is_public_dns_name(hostname: &str) -> bool {
    let labels: Vec<&str> = hostname.split('.').collect();
    let Some((top, rest)) = labels.split_last() else {
        return false;
    };
    !rest.is_empty()
        && (2..=63).contains(&top.len())
        && top.bytes().all(|byte| byte.is_ascii_lowercase())
        && rest.iter().all(|label| is_ldh_label(label))
}

const RESERVED_SUFFIXES: [&str; 7] = ["localhost", "local", "internal", "test", "invalid", "example", "onion"];

/// Why the policy refuses a URL, or `None` when it admits it.
pub fn refusal(raw: &str) -> Option<&'static str> {
    let length = raw.encode_utf16().count();
    if length == 0 || length > 8192 {
        return Some("length");
    }
    if raw.chars().any(is_refused_control) {
        return Some("control character");
    }
    if raw.chars().any(|character| is_ecmascript_whitespace(character) || character == '\\') {
        return Some("whitespace or backslash");
    }
    if has_ambiguous_escape(raw) {
        return Some("ambiguous percent escape");
    }
    let Ok(url) = Url::parse(raw) else {
        return Some("unparsable");
    };
    let parts = components(&url);
    if parts.protocol != "https:" {
        return Some("scheme");
    }
    if !parts.username.is_empty() || !parts.password.is_empty() {
        return Some("credentials");
    }
    if url.fragment().is_some_and(|fragment| !fragment.is_empty()) {
        return Some("fragment");
    }
    if !parts.port.is_empty() {
        return Some("port");
    }
    if parts.href != raw {
        return Some("not in serialized form");
    }
    let hostname = parts.hostname.as_str();
    if hostname.ends_with('.') || hostname.contains(':') {
        return Some("host form");
    }
    if hostname.split('.').all(|label| !label.is_empty() && label.bytes().all(|byte| byte.is_ascii_digit())) {
        return Some("numeric host");
    }
    let path = parts.pathname.as_str();
    if path.contains('%') || path.contains(';') || path.contains("//") {
        return Some("ambiguous path");
    }
    if !is_public_dns_name(hostname) {
        return Some("host name");
    }
    if RESERVED_SUFFIXES.iter().any(|suffix| hostname.ends_with(&format!(".{suffix}"))) {
        return Some("reserved suffix");
    }
    let mut seen = std::collections::HashSet::new();
    if !parts.query_keys.iter().all(|key| seen.insert(key.as_str())) {
        return Some("repeated query key");
    }
    None
}

/// One JSON line describing the parse and the admission decision for `raw`.
pub fn report(raw: &str) -> String {
    let mut out = String::from("{");
    match Url::parse(raw) {
        Ok(url) => {
            let parts = components(&url);
            out.push_str("\"parsed\":true");
            for (name, value) in [
                ("href", &parts.href),
                ("protocol", &parts.protocol),
                ("username", &parts.username),
                ("password", &parts.password),
                ("hostname", &parts.hostname),
                ("port", &parts.port),
                ("pathname", &parts.pathname),
                ("search", &parts.search),
                ("hash", &parts.hash),
            ] {
                out.push_str(",\"");
                out.push_str(name);
                out.push_str("\":");
                write_string(&mut out, value);
            }
            out.push_str(",\"queryKeys\":[");
            for (index, key) in parts.query_keys.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_string(&mut out, key);
            }
            out.push(']');
        }
        Err(_) => out.push_str("\"parsed\":false"),
    }
    match refusal(raw) {
        None => out.push_str(",\"admitted\":true"),
        Some(reason) => {
            out.push_str(",\"admitted\":false,\"reason\":");
            write_string(&mut out, reason);
        }
    }
    out.push('}');
    out
}
