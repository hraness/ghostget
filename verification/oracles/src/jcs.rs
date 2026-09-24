//! An RFC 8785 JSON Canonicalization Scheme (JCS) implementation written
//! independently of the TypeScript `canonicalJson`.
//!
//! The parser accepts only I-JSON (RFC 7493): RFC 8259 syntax, no duplicate
//! member names, no lone surrogates, and numbers that fit an IEEE 754 double.
//! The serializer follows RFC 8785 section 3.2: members sorted by their UTF-16
//! code units, strings escaped as ECMAScript `JSON.stringify` escapes them, and
//! numbers written with the ECMAScript `Number.prototype.toString` algorithm.
//! Number digits come from Rust's shortest round-trip formatting, not from a
//! JavaScript engine.

use std::fmt::Write as _;

/// A parsed JSON value. Object members keep their parsed order until
/// serialization sorts them.
#[derive(Debug, Clone, PartialEq)]
pub enum Json {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<Json>),
    Object(Vec<(String, Json)>),
}

/// Nesting deeper than this is rejected rather than risking stack exhaustion.
const MAX_DEPTH: usize = 512;

struct Parser<'a> {
    bytes: &'a [u8],
    position: usize,
}

impl Parser<'_> {
    fn fail<T>(&self, reason: &str) -> Result<T, String> {
        Err(format!("{reason} at byte {}", self.position))
    }

    fn skip_whitespace(&mut self) {
        while let Some(byte) = self.bytes.get(self.position) {
            if matches!(byte, b' ' | b'\t' | b'\n' | b'\r') {
                self.position += 1;
            } else {
                break;
            }
        }
    }

    fn expect_literal(&mut self, literal: &[u8], value: Json) -> Result<Json, String> {
        if self.bytes[self.position..].starts_with(literal) {
            self.position += literal.len();
            Ok(value)
        } else {
            self.fail("invalid literal")
        }
    }

    fn value(&mut self, depth: usize) -> Result<Json, String> {
        if depth > MAX_DEPTH {
            return self.fail("nesting too deep");
        }
        self.skip_whitespace();
        match self.bytes.get(self.position) {
            None => self.fail("unexpected end of input"),
            Some(b'n') => self.expect_literal(b"null", Json::Null),
            Some(b't') => self.expect_literal(b"true", Json::Bool(true)),
            Some(b'f') => self.expect_literal(b"false", Json::Bool(false)),
            Some(b'"') => self.string().map(Json::String),
            Some(b'[') => self.array(depth),
            Some(b'{') => self.object(depth),
            Some(b'-' | b'0'..=b'9') => self.number(),
            Some(_) => self.fail("unexpected character"),
        }
    }

    fn array(&mut self, depth: usize) -> Result<Json, String> {
        self.position += 1;
        let mut items = Vec::new();
        self.skip_whitespace();
        if self.bytes.get(self.position) == Some(&b']') {
            self.position += 1;
            return Ok(Json::Array(items));
        }
        loop {
            items.push(self.value(depth + 1)?);
            self.skip_whitespace();
            match self.bytes.get(self.position) {
                Some(b',') => self.position += 1,
                Some(b']') => {
                    self.position += 1;
                    return Ok(Json::Array(items));
                }
                _ => return self.fail("expected ',' or ']'"),
            }
        }
    }

    fn object(&mut self, depth: usize) -> Result<Json, String> {
        self.position += 1;
        let mut members: Vec<(String, Json)> = Vec::new();
        self.skip_whitespace();
        if self.bytes.get(self.position) == Some(&b'}') {
            self.position += 1;
            return Ok(Json::Object(members));
        }
        loop {
            self.skip_whitespace();
            if self.bytes.get(self.position) != Some(&b'"') {
                return self.fail("expected a member name");
            }
            let name = self.string()?;
            if members.iter().any(|(existing, _)| *existing == name) {
                return self.fail("duplicate member name");
            }
            self.skip_whitespace();
            if self.bytes.get(self.position) != Some(&b':') {
                return self.fail("expected ':'");
            }
            self.position += 1;
            let value = self.value(depth + 1)?;
            members.push((name, value));
            self.skip_whitespace();
            match self.bytes.get(self.position) {
                Some(b',') => self.position += 1,
                Some(b'}') => {
                    self.position += 1;
                    return Ok(Json::Object(members));
                }
                _ => return self.fail("expected ',' or '}'"),
            }
        }
    }

    fn hex4(&mut self) -> Result<u16, String> {
        let Some(digits) = self.bytes.get(self.position..self.position + 4) else {
            return self.fail("truncated \\u escape");
        };
        let mut value: u16 = 0;
        for digit in digits {
            let nibble = match digit {
                b'0'..=b'9' => digit - b'0',
                b'a'..=b'f' => digit - b'a' + 10,
                b'A'..=b'F' => digit - b'A' + 10,
                _ => return self.fail("invalid \\u escape"),
            };
            value = (value << 4) | u16::from(nibble);
        }
        self.position += 4;
        Ok(value)
    }

    fn string(&mut self) -> Result<String, String> {
        self.position += 1;
        let mut out = String::new();
        loop {
            let Some(&byte) = self.bytes.get(self.position) else {
                return self.fail("unterminated string");
            };
            match byte {
                b'"' => {
                    self.position += 1;
                    return Ok(out);
                }
                b'\\' => {
                    self.position += 1;
                    let Some(&escape) = self.bytes.get(self.position) else {
                        return self.fail("truncated escape");
                    };
                    self.position += 1;
                    match escape {
                        b'"' => out.push('"'),
                        b'\\' => out.push('\\'),
                        b'/' => out.push('/'),
                        b'b' => out.push('\u{8}'),
                        b'f' => out.push('\u{c}'),
                        b'n' => out.push('\n'),
                        b'r' => out.push('\r'),
                        b't' => out.push('\t'),
                        b'u' => {
                            let unit = self.hex4()?;
                            let scalar = if (0xd800..0xdc00).contains(&unit) {
                                if !self.bytes[self.position..].starts_with(b"\\u") {
                                    return self.fail("lone high surrogate");
                                }
                                self.position += 2;
                                let low = self.hex4()?;
                                if !(0xdc00..0xe000).contains(&low) {
                                    return self.fail("lone high surrogate");
                                }
                                0x10000
                                    + ((u32::from(unit) - 0xd800) << 10)
                                    + (u32::from(low) - 0xdc00)
                            } else if (0xdc00..0xe000).contains(&unit) {
                                return self.fail("lone low surrogate");
                            } else {
                                u32::from(unit)
                            };
                            match char::from_u32(scalar) {
                                Some(character) => out.push(character),
                                None => return self.fail("invalid scalar value"),
                            }
                        }
                        _ => return self.fail("invalid escape"),
                    }
                }
                0x00..=0x1f => return self.fail("unescaped control character"),
                _ => {
                    // The input is a &str, so the bytes up to the next quote,
                    // backslash, or control character are valid UTF-8.
                    let start = self.position;
                    while let Some(&next) = self.bytes.get(self.position) {
                        if next == b'"' || next == b'\\' || next < 0x20 {
                            break;
                        }
                        self.position += 1;
                    }
                    match std::str::from_utf8(&self.bytes[start..self.position]) {
                        Ok(text) => out.push_str(text),
                        Err(_) => return self.fail("invalid UTF-8"),
                    }
                }
            }
        }
    }

    fn digits(&mut self) -> usize {
        let start = self.position;
        while matches!(self.bytes.get(self.position), Some(b'0'..=b'9')) {
            self.position += 1;
        }
        self.position - start
    }

    fn number(&mut self) -> Result<Json, String> {
        let start = self.position;
        if self.bytes.get(self.position) == Some(&b'-') {
            self.position += 1;
        }
        match self.bytes.get(self.position) {
            Some(b'0') => self.position += 1,
            Some(b'1'..=b'9') => {
                self.digits();
            }
            _ => return self.fail("invalid number"),
        }
        if self.bytes.get(self.position) == Some(&b'.') {
            self.position += 1;
            if self.digits() == 0 {
                return self.fail("invalid fraction");
            }
        }
        if matches!(self.bytes.get(self.position), Some(b'e' | b'E')) {
            self.position += 1;
            if matches!(self.bytes.get(self.position), Some(b'+' | b'-')) {
                self.position += 1;
            }
            if self.digits() == 0 {
                return self.fail("invalid exponent");
            }
        }
        let text = std::str::from_utf8(&self.bytes[start..self.position])
            .map_err(|_| "invalid number".to_string())?;
        // Rust's float parsing is correctly rounded.
        let value: f64 = text
            .parse()
            .map_err(|_| format!("invalid number at byte {start}"))?;
        if !value.is_finite() {
            return Err(format!(
                "number outside the IEEE 754 double range at byte {start}"
            ));
        }
        Ok(Json::Number(value))
    }
}

/// Parse one I-JSON text.
pub fn parse(text: &str) -> Result<Json, String> {
    let mut parser = Parser {
        bytes: text.as_bytes(),
        position: 0,
    };
    let value = parser.value(0)?;
    parser.skip_whitespace();
    if parser.position != parser.bytes.len() {
        return parser.fail("trailing content");
    }
    Ok(value)
}

/// Write a string as RFC 8785 section 3.2.2.2 requires.
pub fn write_string(out: &mut String, value: &str) {
    out.push('"');
    for character in value.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{9}' => out.push_str("\\t"),
            '\u{a}' => out.push_str("\\n"),
            '\u{c}' => out.push_str("\\f"),
            '\u{d}' => out.push_str("\\r"),
            control if u32::from(control) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", u32::from(control));
            }
            other => out.push(other),
        }
    }
    out.push('"');
}

/// The ECMAScript `Number::toString(x)` text of a finite double
/// (ECMA-262 section 6.1.6.1.20), as RFC 8785 section 3.2.2.3 requires.
pub fn number_text(value: f64) -> String {
    assert!(value.is_finite(), "number_text requires a finite value");
    if value == 0.0 {
        // Both +0 and -0.
        return "0".to_string();
    }
    if value < 0.0 {
        return format!("-{}", number_text(-value));
    }
    // ECMAScript requires the fewest significant digits that identify the
    // value and, when several such digit strings exist, the one closest to
    // the value, with ties going to the even digit. `{:.p$e}` rounds the exact
    // binary value to p + 1 significant digits, ties to even, which gives the
    // closest candidate of that length. When it does not parse back to the
    // value, a neighbour one unit away in the last digit still may: at a power
    // of two the doubles below are half as far apart as those above, so the
    // interval that parses back is lopsided. Only the neighbour on the far
    // side of the value can parse back, because the interval is convex. The
    // shortest-digits `{:e}` form is not used: it may break an exact tie
    // upward, as for 1424953923781206.25.
    let (digits, exponent) = (0..17)
        .find_map(|precision| shortest_candidate(value, precision))
        .expect("17 significant digits identify every double");
    let digits = digits.trim_end_matches('0');
    let digits = if digits.is_empty() { "0" } else { digits };
    let k = i32::try_from(digits.len()).expect("digit count");
    // value = 0.d1 d2 ... dk x 10^n
    let n = exponent + 1;
    if k <= n && n <= 21 {
        let zeros = usize::try_from(n - k).expect("zero count");
        return format!("{digits}{}", "0".repeat(zeros));
    }
    if 0 < n && n <= 21 {
        let split = usize::try_from(n).expect("split");
        return format!("{}.{}", &digits[..split], &digits[split..]);
    }
    if -6 < n && n <= 0 {
        let zeros = usize::try_from(-n).expect("zero count");
        return format!("0.{}{digits}", "0".repeat(zeros));
    }
    let shown = n - 1;
    let sign = if shown < 0 { '-' } else { '+' };
    let magnitude = shown.unsigned_abs();
    if k == 1 {
        format!("{digits}e{sign}{magnitude}")
    } else {
        format!("{}.{}e{sign}{magnitude}", &digits[..1], &digits[1..])
    }
}

/// The significant digits and decimal exponent of a `precision + 1` digit
/// string that parses back to `value`: the correctly rounded one, or else the
/// neighbour one unit away in the last digit that does. `None` when no string
/// of that length identifies the value.
fn shortest_candidate(value: f64, precision: usize) -> Option<(String, i32)> {
    let rounded = format!("{value:.precision$e}");
    let (mantissa, exponent) = rounded.split_once('e').expect("scientific notation");
    let exponent: i32 = exponent.parse().expect("integer exponent");
    let digits: String = mantissa.chars().filter(char::is_ascii_digit).collect();
    if rounded.parse::<f64>() == Ok(value) {
        return Some((digits, exponent));
    }
    let units: u64 = digits.parse().expect("at most 17 digits");
    let scale = exponent - i32::try_from(precision).expect("precision");
    [units + 1, units - 1].into_iter().find_map(|neighbour| {
        let text = neighbour.to_string();
        (format!("{text}e{scale}").parse::<f64>() == Ok(value)).then(|| {
            let exponent = scale + i32::try_from(text.len()).expect("digit count") - 1;
            (text, exponent)
        })
    })
}

fn utf16_key(value: &str) -> Vec<u16> {
    value.encode_utf16().collect()
}

fn write_canonical(out: &mut String, value: &Json) {
    match value {
        Json::Null => out.push_str("null"),
        Json::Bool(true) => out.push_str("true"),
        Json::Bool(false) => out.push_str("false"),
        Json::Number(number) => out.push_str(&number_text(*number)),
        Json::String(text) => write_string(out, text),
        Json::Array(items) => {
            out.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_canonical(out, item);
            }
            out.push(']');
        }
        Json::Object(members) => {
            let mut sorted: Vec<(Vec<u16>, &String, &Json)> = members
                .iter()
                .map(|(name, item)| (utf16_key(name), name, item))
                .collect();
            sorted.sort_by(|left, right| left.0.cmp(&right.0));
            out.push('{');
            for (index, (_, name, item)) in sorted.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_string(out, name);
                out.push(':');
                write_canonical(out, item);
            }
            out.push('}');
        }
    }
}

/// The RFC 8785 canonical form of a JSON value.
pub fn canonical(value: &Json) -> String {
    let mut out = String::new();
    write_canonical(&mut out, value);
    out
}

/// Parse an I-JSON text and return its RFC 8785 canonical form.
pub fn canonicalize(text: &str) -> Result<String, String> {
    parse(text).map(|value| canonical(&value))
}
