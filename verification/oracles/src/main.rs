//! `ghostget-oracle` reads one request per line on standard input and writes
//! one answer line per request, in order, so a test can keep one process open
//! for a whole property run.
//!
//! - `ghostget-oracle jcs`: each line is a JSON text. The answer is
//!   `ok<TAB><RFC 8785 canonical form>` or `error<TAB><reason>`.
//! - `ghostget-oracle url`: each line is a JSON string holding one URL
//!   candidate. The answer is a JSON object with the `url` crate's WHATWG
//!   components and the admission decision.
//! - `ghostget-oracle version`: prints the oracle and `url` crate versions.

mod jcs;
mod url_policy;

use std::io::{BufRead, BufWriter, Write};

/// The `url` crate version that Cargo.toml pins.
const URL_CRATE_VERSION: &str = "2.5.8";

fn answer(mode: &str, line: &str) -> String {
    match mode {
        "jcs" => match jcs::canonicalize(line) {
            Ok(canonical) => format!("ok\t{canonical}"),
            Err(reason) => format!("error\t{reason}"),
        },
        "url" => match jcs::parse(line) {
            Ok(jcs::Json::String(raw)) => url_policy::report(&raw),
            _ => "{\"error\":\"each url request must be one JSON string\"}".to_string(),
        },
        _ => unreachable!("mode was checked"),
    }
}

fn main() {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let mode = match arguments.as_slice() {
        [mode] if mode == "jcs" || mode == "url" => mode.clone(),
        [mode] if mode == "version" => {
            println!(
                "ghostget-oracle {} url {URL_CRATE_VERSION}",
                env!("CARGO_PKG_VERSION")
            );
            return;
        }
        _ => {
            eprintln!("usage: ghostget-oracle jcs|url|version");
            std::process::exit(2);
        }
    };
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut output = BufWriter::new(stdout.lock());
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(line) => line,
            Err(error) => {
                eprintln!("ghostget-oracle: unreadable input: {error}");
                std::process::exit(1);
            }
        };
        let reply = answer(&mode, &line);
        if writeln!(output, "{reply}")
            .and_then(|()| output.flush())
            .is_err()
        {
            std::process::exit(1);
        }
    }
}
