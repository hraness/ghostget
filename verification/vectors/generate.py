#!/usr/bin/env python3
"""Generate Ghostget's golden vectors for canonical JSON, hashes, and encodings.

This generator is an independent reference: it uses only the CPython standard
library and restates each encoding from its specification or its documented
byte layout, never from Ghostget's TypeScript. `scripts/verification-vectors.test.ts`
compares the shipped TypeScript with every vector byte for byte, and the Rust
oracle under `verification/oracles/` is compared with the canonical JSON
vectors too.

Run from the repository root:

    python3 verification/vectors/generate.py          # rewrite the vector files
    python3 verification/vectors/generate.py --check  # fail if a file is stale

Output is deterministic: the random corpus uses a fixed seed, and nothing
depends on the platform, locale, hash seed, or clock.
"""

from __future__ import annotations

import hashlib
import ipaddress
import json
import math
import random
import struct
import sys
from pathlib import Path

GENERATOR_VERSION = 1
MINIMUM_PYTHON = (3, 11)
VECTOR_DIRECTORY = Path(__file__).resolve().parent
GENERATOR_PATH = "verification/vectors/generate.py"
COMMAND = "python3 verification/vectors/generate.py"
SEED = 8785


# ---------------------------------------------------------------------------
# RFC 8785 JSON Canonicalization Scheme
# ---------------------------------------------------------------------------


class NotIJson(ValueError):
    """The text is valid JSON syntax but outside I-JSON (RFC 7493)."""


def _reject_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
    names = [name for name, _ in pairs]
    if len(set(names)) != len(names):
        raise NotIJson("duplicate member name")
    return dict(pairs)


def _reject_constant(name: str) -> object:
    raise NotIJson(f"non-finite number {name}")


def _finite_float(text: str) -> float:
    value = float(text)
    if not math.isfinite(value):
        raise NotIJson("number outside the IEEE 754 double range")
    return value


def _check_scalar_values(value: object) -> None:
    """I-JSON forbids lone surrogates, which Python's json module admits."""
    if isinstance(value, str):
        if any(0xD800 <= ord(character) <= 0xDFFF for character in value):
            raise NotIJson("lone surrogate")
    elif isinstance(value, list):
        for item in value:
            _check_scalar_values(item)
    elif isinstance(value, dict):
        for name, item in value.items():
            _check_scalar_values(name)
            _check_scalar_values(item)


def parse_i_json(text: str) -> object:
    """Parse I-JSON; every number becomes an IEEE 754 double, as in JavaScript."""
    value = json.loads(
        text,
        object_pairs_hook=_reject_duplicates,
        parse_constant=_reject_constant,
        parse_float=_finite_float,
        parse_int=_finite_float,
    )
    _check_scalar_values(value)
    return value


def number_text(value: float) -> str:
    """ECMAScript Number::toString for a finite double (ECMA-262 6.1.6.1.20).

    Python's repr gives the shortest digit string that round-trips to the same
    double, choosing the closest such string, which is the digit selection
    ECMAScript requires. Only the layout differs, and it is rebuilt here.
    """
    if not math.isfinite(value):
        raise NotIJson("non-finite number")
    if value == 0:
        return "0"
    if value < 0:
        return "-" + number_text(-value)
    text = repr(value)
    mantissa, _, exponent_text = text.partition("e")
    exponent = int(exponent_text) if exponent_text else 0
    integer_part, _, fraction_part = mantissa.partition(".")
    all_digits = integer_part + fraction_part
    point = len(integer_part) + exponent
    stripped = all_digits.lstrip("0")
    point -= len(all_digits) - len(stripped)
    digits = stripped.rstrip("0")
    k = len(digits)
    n = point  # value = 0.d1 d2 ... dk x 10^n
    if k <= n <= 21:
        return digits + "0" * (n - k)
    if 0 < n <= 21:
        return digits[:n] + "." + digits[n:]
    if -6 < n <= 0:
        return "0." + "0" * (-n) + digits
    shown = n - 1
    sign = "+" if shown >= 0 else "-"
    head = digits[0] if k == 1 else digits[0] + "." + digits[1:]
    return f"{head}e{sign}{abs(shown)}"


_SHORT_ESCAPES = {
    '"': '\\"',
    "\\": "\\\\",
    "\b": "\\b",
    "\t": "\\t",
    "\n": "\\n",
    "\f": "\\f",
    "\r": "\\r",
}


def string_text(value: str) -> str:
    """RFC 8785 section 3.2.2.2 string serialization."""
    parts = ['"']
    for character in value:
        if character in _SHORT_ESCAPES:
            parts.append(_SHORT_ESCAPES[character])
        elif ord(character) < 0x20:
            parts.append(f"\\u{ord(character):04x}")
        else:
            parts.append(character)
    parts.append('"')
    return "".join(parts)


def utf16_order(name: str) -> bytes:
    """Big-endian UTF-16 bytes compare exactly as UTF-16 code units do."""
    return name.encode("utf-16-be")


def canonical(value: object) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, float):
        return number_text(value)
    if isinstance(value, str):
        return string_text(value)
    if isinstance(value, list):
        return "[" + ",".join(canonical(item) for item in value) + "]"
    if isinstance(value, dict):
        names = sorted(value, key=utf16_order)
        return "{" + ",".join(string_text(name) + ":" + canonical(value[name]) for name in names) + "}"
    raise TypeError(f"unexpected value {type(value).__name__}")


def script_literal(text: str) -> str:
    """Escape '<', '>', U+2028, and U+2029 for embedding in a script element."""
    return "".join(
        f"\\u{ord(character):04x}" if character in "<>\u2028\u2029" else character
        for character in text
    )


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# RFC 8785 section 3.2.2 and 3.2.3 examples, and Appendix B number samples.
RFC_EXAMPLES = [
    (
        "rfc8785-3.2.2-values",
        '{\n  "numbers": [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001],\n'
        '  "string": "\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/",\n'
        '  "literals": [null, true, false]\n}',
        '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],'
        '"string":"\u20ac$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
    ),
    (
        "rfc8785-3.2.3-sorting",
        '{\n  "\\u20ac": "Euro Sign",\n  "\\r": "Carriage Return",\n'
        '  "\\ufb33": "Hebrew Letter Dalet With Dagesh",\n  "1": "One",\n'
        '  "\\ud83d\\ude00": "Emoji: Grinning Face",\n  "\\u0080": "Control",\n'
        '  "\\u00f6": "Latin Small Letter O With Diaeresis"\n}',
        '{"\\r":"Carriage Return","1":"One","\u0080":"Control",'
        '"\u00f6":"Latin Small Letter O With Diaeresis","\u20ac":"Euro Sign",'
        '"\U0001f600":"Emoji: Grinning Face","\ufb33":"Hebrew Letter Dalet With Dagesh"}',
    ),
]

RFC_NUMBERS = [
    ("0000000000000000", "0"),
    ("8000000000000000", "0"),
    ("0000000000000001", "5e-324"),
    ("8000000000000001", "-5e-324"),
    ("7fefffffffffffff", "1.7976931348623157e+308"),
    ("ffefffffffffffff", "-1.7976931348623157e+308"),
    ("4340000000000000", "9007199254740992"),
    ("c340000000000000", "-9007199254740992"),
    ("4430000000000000", "295147905179352830000"),
    ("7fffffffffffffff", None),
    ("7ff0000000000000", None),
    ("44b52d02c7e14af5", "9.999999999999997e+22"),
    ("44b52d02c7e14af6", "1e+23"),
    ("44b52d02c7e14af7", "1.0000000000000001e+23"),
    ("444b1ae4d6e2ef4e", "999999999999999700000"),
    ("444b1ae4d6e2ef4f", "999999999999999900000"),
    ("444b1ae4d6e2ef50", "1e+21"),
    ("3eb0c6f7a0b5ed8c", "9.999999999999997e-7"),
    ("3eb0c6f7a0b5ed8d", "0.000001"),
    ("41b3de4355555553", "333333333.3333332"),
    ("41b3de4355555554", "333333333.33333325"),
    ("41b3de4355555555", "333333333.3333333"),
    ("41b3de4355555556", "333333333.3333334"),
    ("41b3de4355555557", "333333333.33333343"),
    ("becbf647612f3696", "-0.0000033333333333333333"),
    ("43143ff3c1cb0959", "1424953923781206.2"),
]


def bits_to_float(bits: str) -> float:
    return struct.unpack(">d", bytes.fromhex(bits))[0]


def float_to_bits(value: float) -> str:
    return struct.pack(">d", value).hex()


def number_vectors(generator: random.Random) -> list[dict[str, object]]:
    vectors: list[dict[str, object]] = []
    for bits, expected in RFC_NUMBERS:
        value = bits_to_float(bits)
        if expected is None:
            if math.isfinite(value):
                raise AssertionError(f"RFC 8785 sample {bits} should be non-finite")
            vectors.append({"source": "rfc8785-appendix-b", "bits": bits, "text": None})
            continue
        text = number_text(value)
        if text != expected:
            raise AssertionError(f"RFC 8785 sample {bits}: generated {text}, RFC states {expected}")
        vectors.append({"source": "rfc8785-appendix-b", "bits": bits, "text": text})
    boundaries = [
        1e21, 1e21 - 65536, 1e-6, 1e-7, 9.999999999999999e-7, 123e-20, 0.1, 0.2, 0.3, 1 / 3,
        2.0 ** 53 - 1, 2.0 ** 53 + 2, -(2.0 ** 63), 2.0 ** -1074 * 3, 2.2250738585072014e-308,
        4.35, 100.0, 1e20, 12345678901234567890.0, 5e-7, 5e-6,
    ]
    for value in boundaries:
        vectors.append({"source": "boundary", "bits": float_to_bits(value), "text": number_text(value)})
    while len(vectors) < 400:
        bits = generator.getrandbits(64).to_bytes(8, "big").hex()
        value = bits_to_float(bits)
        if not math.isfinite(value):
            continue
        vectors.append({"source": "random-bits", "bits": bits, "text": number_text(value)})
    # Every power of two: the doubles below one are half as far apart as those
    # above, so the shortest digits that parse back can lie on the far side of
    # the closest decimal of the same length.
    for exponent in range(-1074, 1024):
        value = math.ldexp(1.0, exponent)
        vectors.append({"source": "power-of-two", "bits": float_to_bits(value), "text": number_text(value)})
    for vector in vectors:
        if vector["text"] is not None and float(str(vector["text"])) != bits_to_float(str(vector["bits"])):
            raise AssertionError(f"number text {vector['text']} does not round-trip")
    return vectors


KEY_POOL = [
    "a", "b", "A", "B", "_", "-", "aa", "a_b", "a-b", "Z", "z", "1", "10", "2", "",
    "__proto__", "constructor", "toString", "\u00e4", "a\u0308", "\u00f6", "\u20ac",
    "\U0001f600", "\ufb33", "\uffff", "\u2028", "\u0000", "\r", "\u0080", "\ud7ff", "\ue000",
]


def random_string(generator: random.Random, maximum: int = 12) -> str:
    alphabet_ranges = [
        (0x00, 0x1F), (0x20, 0x7E), (0x7F, 0xFF), (0x100, 0x7FF), (0x800, 0xD7FF),
        (0xE000, 0xFFFF), (0x10000, 0x10FFFF), (0x2028, 0x2029), (0x3C, 0x3E),
    ]
    characters = []
    for _ in range(generator.randint(0, maximum)):
        low, high = generator.choice(alphabet_ranges)
        characters.append(chr(generator.randint(low, high)))
    return "".join(characters)


def random_number(generator: random.Random) -> float:
    choice = generator.randrange(6)
    if choice == 0:
        return float(generator.randint(-1000, 1000))
    if choice == 1:
        return float(2 ** 53 + generator.randint(-4, 4)) * generator.choice([1, -1])
    if choice == 2:
        return generator.choice([1, -1]) * 10.0 ** generator.randint(-30, 30)
    if choice == 3:
        return generator.uniform(-1e6, 1e6)
    while True:
        value = bits_to_float(generator.getrandbits(64).to_bytes(8, "big").hex())
        if math.isfinite(value):
            return value


def random_value(generator: random.Random, depth: int) -> object:
    kind = generator.randrange(7 if depth > 0 else 4)
    if kind == 0:
        return generator.choice([None, True, False])
    if kind == 1:
        return random_number(generator)
    if kind in (2, 3):
        return random_string(generator)
    if kind in (4, 5):
        names = generator.sample(KEY_POOL, generator.randint(0, 6))
        if generator.random() < 0.3:
            names.append(random_string(generator, 4))
        return {name: random_value(generator, depth - 1) for name in dict.fromkeys(names)}
    return [random_value(generator, depth - 1) for _ in range(generator.randint(0, 4))]


def shuffled_text(generator: random.Random, value: object) -> str:
    """A non-canonical JSON text of `value`: shuffled members and varied spacing."""
    def shuffle(item: object) -> object:
        if isinstance(item, dict):
            pairs = list(item.items())
            generator.shuffle(pairs)
            return {name: shuffle(member) for name, member in pairs}
        if isinstance(item, list):
            return [shuffle(member) for member in item]
        return item
    separators = generator.choice([(",", ":"), (", ", ": "), (" ,", " :")])
    return json.dumps(shuffle(value), ensure_ascii=generator.random() < 0.5, separators=separators, allow_nan=False)


def jcs_vectors(generator: random.Random) -> list[dict[str, object]]:
    cases: list[dict[str, object]] = []
    for name, text, expected in RFC_EXAMPLES:
        result = canonical(parse_i_json(text))
        if result != expected:
            raise AssertionError(f"{name}: generated {result!r}, RFC states {expected!r}")
        cases.append({"name": name, "input": text})
    fixed = [
        ("empty-object", "{}"),
        ("empty-array", "[]"),
        ("nested-empty", '{"b":[],"a":{}}'),
        ("proto-member", '{"__proto__":{"polluted":true},"constructor":1}'),
        ("utf16-versus-utf8-order", '{"\\uffff":1,"\\ud83d\\ude00":2,"\\ue000":3}'),
        ("script-sensitive", '{"html":"</script><!--","separators":"\\u2028\\u2029"}'),
        ("controls", '"\\u0000\\u0001\\u001f\\u007f\\b\\f\\n\\r\\t"'),
        ("exponent-forms", "[1E2,1e+2,1e-2,-0,0.0,-0.0,100e-2]"),
        ("integers-near-2-53", "[9007199254740991,9007199254740992,9007199254740993,-9007199254740993]"),
        ("large-integer", "[123456789012345678901234567890]"),
    ]
    for name, text in fixed:
        cases.append({"name": name, "input": text})
    index = 0
    while len(cases) < 250:
        value = random_value(generator, generator.randint(0, 4))
        cases.append({"name": f"random-{index:03d}", "input": shuffled_text(generator, value)})
        index += 1
    for case in cases:
        text = canonical(parse_i_json(str(case["input"])))
        case["canonical"] = text
        case["sha256"] = sha256_hex(text.encode("utf-8"))
        case["scriptLiteral"] = script_literal(text)
    return cases


REJECTED_INPUTS = [
    ("duplicate-member", '{"a":1,"a":2}'),
    ("lone-high-surrogate", '"\\ud800"'),
    ("lone-low-surrogate", '"\\udc00x"'),
    ("overflow", "1e400"),
    ("negative-overflow", "[-1e309]"),
]


def rejected_vectors() -> list[dict[str, str]]:
    cases = []
    for name, text in REJECTED_INPUTS:
        try:
            parse_i_json(text)
        except NotIJson:
            cases.append({"name": name, "input": text})
            continue
        raise AssertionError(f"{name} should be outside I-JSON")
    return cases


# ---------------------------------------------------------------------------
# Length-framed SHA-256 identities
# ---------------------------------------------------------------------------


def u64be(value: int) -> bytes:
    return value.to_bytes(8, "big")


def length_framed(components: list[str]) -> bytes:
    """Each component as its UTF-8 byte length (64-bit big-endian) and its bytes."""
    return b"".join(u64be(len(part.encode("utf-8"))) + part.encode("utf-8") for part in components)


def media_identity_sha256(domain: str, components: list[str]) -> str:
    return sha256_hex(b"wrench-media-identity-key\x00" + length_framed([domain, *components]))


def media_revision_sha256(domain: str, components: list[str]) -> str:
    return sha256_hex(b"wrench-media-revision-key\x00" + length_framed([domain, *components]))


def utf8_order_key(value: str) -> bytes:
    return value.encode("utf-8")


def compare_utf8(left: str, right: str) -> int:
    a, b = utf8_order_key(left), utf8_order_key(right)
    return (a > b) - (a < b)


RUNTIME_CLOSURE_PROFILE = "wrench-media-native-runtime-closure-v1"
REVISION_CONTENT_PROFILE = "wrench-media-retained-input-set-v1"
REVISION_CONTENT_ROLES = {
    "capture", "transcript_vtt", "transcript_text", "transcript_json",
    "provider_metadata", "description", "thumbnail",
}


def fake_sha(generator: random.Random) -> str:
    return generator.getrandbits(256).to_bytes(32, "big").hex()


def runtime_closure_sha256(platform: str, executable: str, dependencies: list[dict[str, object]]) -> str:
    ordered = sorted(
        dependencies,
        key=lambda item: (utf8_order_key(str(item["logicalName"])), int(item["bytes"]), utf8_order_key(str(item["sha256"]))),
    )
    components = [RUNTIME_CLOSURE_PROFILE, platform, "executable", executable, "dependency-count", str(len(ordered))]
    for item in ordered:
        components += ["dependency", str(item["logicalName"]), str(item["bytes"]), str(item["sha256"])]
    return sha256_hex(length_framed(components))


def revision_content_sha256(artifacts: list[dict[str, object]]) -> str:
    selected = sorted(
        (item for item in artifacts if item["role"] in REVISION_CONTENT_ROLES),
        key=lambda item: utf8_order_key(str(item["role"])),
    )
    components = [REVISION_CONTENT_PROFILE]
    for item in selected:
        components += [str(item["role"]), str(item["bytes"]), str(item["mediaType"]), str(item["sha256"])]
    return media_revision_sha256("retained-input-set", components)


LOGICAL_NAMES = [
    "libc.so.6", "libm.so.6", "libavcodec.so.61", "libSystem.B.dylib", "a", "A", "b",
    "\uffff.dylib", "\U0001f600.dylib", "caf\u00e9.so", "cafe\u0301.so",
]
MEDIA_TYPES = ["video/mp4", "audio/mpeg", "text/vtt; charset=utf-8", "application/json", "image/jpeg", "text/plain; charset=utf-8"]


def hash_vectors(generator: random.Random) -> dict[str, list[dict[str, object]]]:
    provider = []
    pairs = [
        ("youtube", "dQw4w9WgXcQ"), ("generic", "https://example.com/a"), ("", ""), ("a", "bc"), ("ab", "c"),
        ("Vimeo", "12345"), ("vimeo", "12345"), ("tiktok", "\U0001f600\u00e9"), ("x\u0000y", "z"),
    ]
    for _ in range(12):
        pairs.append((random_string(generator, 8), random_string(generator, 16)))
    for extractor, provider_id in pairs:
        digest = media_identity_sha256("source", [extractor, provider_id])
        provider.append({"extractor": extractor, "providerId": provider_id, "sha256": digest, "sourceAssetKey": f"source-v1-{digest}"})
    auth = []
    for name in ["work", "Work", "WORK", "a", "a.b-c_d", "0", "x" * 64]:
        auth.append({"name": name, "sha256": media_identity_sha256("auth-context", [name.lower()])})
    closures = []
    for index in range(16):
        platform = "linux" if index % 2 == 0 else "darwin"
        dependencies = []
        for _ in range(generator.randint(0, 6)):
            dependencies.append({
                "logicalName": generator.choice(LOGICAL_NAMES),
                "bytes": generator.choice([0, 1, 4096, generator.randint(0, 2 ** 40)]),
                "sha256": fake_sha(generator),
            })
        if index == 3 and dependencies:
            twin = dict(dependencies[0])
            twin["sha256"] = fake_sha(generator)
            dependencies.append(twin)
        generator.shuffle(dependencies)
        executable = fake_sha(generator)
        closures.append({
            "platform": platform,
            "executableSha256": executable,
            "dependencies": dependencies,
            "sha256": runtime_closure_sha256(platform, executable, dependencies),
        })
    revisions = []
    for _ in range(16):
        roles = generator.sample(sorted(REVISION_CONTENT_ROLES), generator.randint(1, 5))
        artifacts = [
            {
                "role": role,
                "bytes": generator.choice([0, 1, generator.randint(0, 2 ** 45)]),
                "sha256": fake_sha(generator),
                "mediaType": generator.choice(MEDIA_TYPES),
            }
            for role in roles
        ]
        if generator.random() < 0.5:
            artifacts.append({"role": "audio", "bytes": 7, "sha256": fake_sha(generator), "mediaType": "audio/mp4"})
        generator.shuffle(artifacts)
        revisions.append({"artifacts": artifacts, "sha256": revision_content_sha256(artifacts)})
    order = []
    samples = ["", "a", "b", "ab", "\u00e9", "e\u0301", "\uffff", "\U0001f600", "\ue000", "\u0080", "Z", "\u2028"]
    for left in samples:
        for right in samples:
            order.append({"left": left, "right": right, "sign": compare_utf8(left, right)})
    return {
        "providerIdentity": provider,
        "authContext": auth,
        "runtimeClosure": closures,
        "revisionContent": revisions,
        "utf8Order": order,
    }


# ---------------------------------------------------------------------------
# Public unicast address classification
# ---------------------------------------------------------------------------

# The IANA IPv4 and IPv6 special-purpose address registries, restated from
# the registries (kb/plans/kb-ip-classifier-proposal.md lists the same rows).
# IPv4 multicast and the reserved and broadcast space are refused too. IPv6 is
# admitted only inside the global unicast block 2000::/3, so every form that
# embeds an IPv4 address is refused whatever the embedded address is.
REFUSED_IPV4 = [
    "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
    "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.31.196.0/24",
    "192.52.193.0/24", "192.88.99.0/24", "192.168.0.0/16", "192.175.48.0/24",
    "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
]
GLOBAL_IPV6 = "2000::/3"
REFUSED_IPV6 = ["2001::/23", "2001:db8::/32", "2002::/16", "2620:4f:8000::/48", "3fff::/20"]


def reference_public(value: int, bits: int) -> bool:
    """Containment through ipaddress networks; text formatting stays local."""
    if bits == 32:
        address = ipaddress.IPv4Address(value)
        return not any(address in ipaddress.IPv4Network(block) for block in REFUSED_IPV4)
    address6 = ipaddress.IPv6Address(value)
    if address6 not in ipaddress.IPv6Network(GLOBAL_IPV6):
        return False
    return not any(address6 in ipaddress.IPv6Network(block) for block in REFUSED_IPV6)


def ipv4_text(value: int) -> str:
    return ".".join(str((value >> shift) & 0xFF) for shift in (24, 16, 8, 0))


def ipv6_words(value: int) -> list[int]:
    return [(value >> (112 - 16 * index)) & 0xFFFF for index in range(8)]


def ipv6_exploded(value: int) -> str:
    return ":".join(f"{word:04x}" for word in ipv6_words(value))


def ipv6_compressed(value: int) -> str:
    """RFC 5952: the longest run of two or more zero words becomes '::'."""
    words = ipv6_words(value)
    best_start, best_length, index = -1, 0, 0
    while index < 8:
        if words[index] == 0:
            end = index
            while end < 8 and words[end] == 0:
                end += 1
            if end - index > best_length and end - index >= 2:
                best_start, best_length = index, end - index
            index = end
        else:
            index += 1
    text = [f"{word:x}" for word in words]
    if best_start < 0:
        return ":".join(text)
    return ":".join(text[:best_start]) + "::" + ":".join(text[best_start + best_length:])


def ipv6_dotted(value: int) -> str:
    """The first six words in hex, the last 32 bits as a dotted quad."""
    return ":".join(f"{word:x}" for word in ipv6_words(value)[:6]) + ":" + ipv4_text(value & 0xFFFFFFFF)


def ipv6_texts(value: int) -> list[str]:
    compressed = ipv6_compressed(value)
    texts = [compressed, ipv6_exploded(value), compressed.upper(), ipv6_dotted(value)]
    unique: list[str] = []
    for text in texts:
        # Every text form must be one ipaddress reads as the same value.
        if int(ipaddress.IPv6Address(text)) != value:
            raise AssertionError(f"text form {text} does not round-trip")
        if text not in unique:
            unique.append(text)
    return unique


def block_edges(block: str, bits: int) -> list[int]:
    network = ipaddress.ip_network(block)
    first, last = int(network.network_address), int(network.broadcast_address)
    top = (1 << bits) - 1
    return [value for value in (first - 1, first, first + 1, last - 1, last, last + 1) if 0 <= value <= top]


def embedded_forms(value: int) -> dict[str, int]:
    """The IPv6 forms that carry one IPv4 address."""
    return {
        "mapped": (0xFFFF << 32) | value,
        "translated": (0xFFFF << 48) | value,
        "compatible": value,
        "nat64": (0x64FF9B << 96) | value,
        "nat64-local": (0x64FF9B0001 << 80) | value,
        "6to4": (0x2002 << 112) | (value << 80) | 1,
        "teredo": (0x20010000 << 96) | (value << 64) | (0xFFFFFFFF ^ value),
    }


def address_vectors(generator: random.Random) -> dict[str, object]:
    ipv4: dict[int, str] = {}
    for block in REFUSED_IPV4:
        for value in block_edges(block, 32):
            ipv4.setdefault(value, f"edge {block}")
    for text in ("1.1.1.1", "8.8.8.8", "93.184.216.34", "255.255.255.255", "0.0.0.0"):
        ipv4.setdefault(int(ipaddress.IPv4Address(text)), "named")
    for _ in range(200):
        ipv4.setdefault(generator.getrandbits(32), "random")

    ipv6: dict[int, str] = {}
    for block in [GLOBAL_IPV6, *REFUSED_IPV6, "::/8", "fc00::/7", "fe80::/10", "ff00::/8"]:
        for value in block_edges(block, 128):
            ipv6.setdefault(value, f"edge {block}")
    for text in ("::", "::1", "2606:4700:4700::1111", "2001:4860:4860::8888", "2001:200::1"):
        ipv6.setdefault(int(ipaddress.IPv6Address(text)), "named")
    for _ in range(150):
        inside = (0b001 << 125) | generator.getrandbits(125)
        ipv6.setdefault(inside, "random 2000::/3")
    for _ in range(50):
        ipv6.setdefault(generator.getrandbits(128), "random")

    embedded: list[dict[str, object]] = []
    embedded_sources = [int(ipaddress.IPv4Address(text)) for text in ("127.0.0.1", "10.0.0.1", "169.254.169.254", "8.8.8.8", "1.1.1.1")]
    embedded_sources += [generator.getrandbits(32) for _ in range(10)]
    for source in embedded_sources:
        for form, value in embedded_forms(source).items():
            if reference_public(value, 128):
                raise AssertionError(f"embedded {form} form of {ipv4_text(source)} must be refused")
            embedded.append({"ipv4": ipv4_text(source), "form": form, "texts": ipv6_texts(value), "public": False})

    return {
        "ipv4": [
            {"source": source, "value": value, "texts": [ipv4_text(value)], "public": reference_public(value, 32)}
            for value, source in sorted(ipv4.items())
        ],
        "ipv6": [
            {"source": source, "value": f"{value:032x}", "texts": ipv6_texts(value), "public": reference_public(value, 128)}
            for value, source in sorted(ipv6.items())
        ],
        "embedded": embedded,
        "rejectedText": [
            "", " 8.8.8.8", "8.8.8.8 ", "08.8.8.8", "8.8.8.08", "0x8.8.8.8", "8.8.8", "8.8.8.8.8", "256.1.1.1",
            "134744072", "8.8.8.8/32", "example.com", "2606:4700::1111%1", "fe80::1%en0", "[2606:4700::1111]",
            "2606:4700::1111/128", "1:2:3:4:5:6:7:8:9", "1::2::3", "12345::", ":2606:4700::1111",
            "2606:4700::1111:", ":::", "2606:4700:4700:0:0:0:0:1111::", "2606:4700::1.2.3.4:1111",
            "2606:4700::1.2.3", "2606:4700::01.2.3.4", "2606:4700::g", "８.8.8.8", "8.8.8.8\u0000",
        ],
    }


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


def document(description: str, body: dict[str, object]) -> str:
    header = {
        "schema": 1,
        "description": description,
        "generator": {
            "path": GENERATOR_PATH,
            "version": GENERATOR_VERSION,
            "runtime": "CPython 3.11 or later, standard library only",
            "command": COMMAND,
        },
    }
    return json.dumps({**header, **body}, ensure_ascii=True, indent=1, allow_nan=False) + "\n"


def outputs() -> dict[str, str]:
    generator = random.Random(SEED)
    jcs = document(
        "RFC 8785 canonical JSON: each input's canonical form, the SHA-256 of its UTF-8 bytes, and its script-literal escaping; ECMAScript number text for IEEE 754 bit patterns; and inputs outside I-JSON.",
        {"cases": jcs_vectors(generator), "numbers": number_vectors(generator), "rejected": rejected_vectors()},
    )
    hashes = document(
        "Length-framed SHA-256 identities for media provider and authorization-context keys, native runtime closures, and retained revision content, and UTF-8 byte ordering.",
        hash_vectors(generator),
    )
    # A separate stream keeps the earlier files unchanged when this corpus grows.
    addresses = document(
        "Public unicast verdicts for IPv4 and IPv6 addresses: the edges of every IANA special-purpose block, seeded random addresses, IPv6 forms that embed an IPv4 address, several text forms of each value, and text that is not one canonical address.",
        address_vectors(random.Random(SEED + 1)),
    )
    return {"jcs.json": jcs, "hashes.json": hashes, "addresses.json": addresses}


def main(arguments: list[str]) -> int:
    if sys.version_info < MINIMUM_PYTHON:
        print(f"generate.py requires Python {MINIMUM_PYTHON[0]}.{MINIMUM_PYTHON[1]} or later", file=sys.stderr)
        return 2
    if arguments not in ([], ["--check"]):
        print("usage: python3 verification/vectors/generate.py [--check]", file=sys.stderr)
        return 2
    stale = []
    for name, text in outputs().items():
        path = VECTOR_DIRECTORY / name
        if arguments == ["--check"]:
            if not path.is_file() or path.read_text(encoding="utf-8") != text:
                stale.append(name)
        else:
            path.write_text(text, encoding="utf-8")
    if stale:
        print(f"stale golden vectors: {', '.join(stale)}; run {COMMAND}", file=sys.stderr)
        return 1
    print("golden vectors are current" if arguments else "golden vectors written")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
