#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Provider {
    ChatGPT,
    Claude,
    DeepSeek,
}

impl Provider {
    pub const ALL: [Self; 3] = [Self::ChatGPT, Self::Claude, Self::DeepSeek];

    pub const fn label(self) -> &'static str {
        match self {
            Self::ChatGPT => "ChatGPT",
            Self::Claude => "Claude",
            Self::DeepSeek => "DeepSeek",
        }
    }

    pub const fn start_url(self) -> &'static str {
        match self {
            Self::ChatGPT => "https://chatgpt.com/",
            Self::Claude => "https://claude.ai/new",
            Self::DeepSeek => "https://chat.deepseek.com/",
        }
    }
}

/// Normalize a user-entered browser address and reject non-web schemes.
///
/// This is deliberately limited to HTTP(S). Provider pages are untrusted remote
/// content and must never be able to turn the browser surface into a local-file
/// or script-protocol launcher.
pub fn normalize_address(input: &str) -> Result<String, &'static str> {
    let address = input.trim();

    if address.is_empty() {
        return Err("Enter a website address.");
    }

    if address.chars().any(char::is_whitespace) {
        return Err("The address cannot contain whitespace.");
    }

    if address.contains("://") {
        let lower = address.to_ascii_lowercase();
        if lower.starts_with("https://") || lower.starts_with("http://") {
            return Ok(address.to_string());
        }

        return Err("Only HTTP and HTTPS addresses are allowed.");
    }

    if address.starts_with("javascript:")
        || address.starts_with("file:")
        || address.starts_with("data:")
    {
        return Err("Only HTTP and HTTPS addresses are allowed.");
    }

    Ok(format!("https://{address}"))
}

#[cfg(test)]
mod tests {
    use super::{normalize_address, Provider};

    #[test]
    fn providers_have_explicit_start_pages() {
        assert_eq!(Provider::ChatGPT.start_url(), "https://chatgpt.com/");
        assert_eq!(Provider::Claude.start_url(), "https://claude.ai/new");
        assert_eq!(Provider::DeepSeek.start_url(), "https://chat.deepseek.com/");
    }

    #[test]
    fn adds_https_when_scheme_is_omitted() {
        assert_eq!(
            normalize_address("example.com/path").unwrap(),
            "https://example.com/path"
        );
    }

    #[test]
    fn preserves_http_and_https_addresses() {
        assert_eq!(
            normalize_address("http://localhost:8080").unwrap(),
            "http://localhost:8080"
        );
        assert_eq!(
            normalize_address("https://example.com").unwrap(),
            "https://example.com"
        );
    }

    #[test]
    fn rejects_non_web_schemes_and_invalid_input() {
        assert!(normalize_address("javascript:alert(1)").is_err());
        assert!(normalize_address("file:///C:/Windows/win.ini").is_err());
        assert!(normalize_address("data:text/html,hello").is_err());
        assert!(normalize_address("   ").is_err());
        assert!(normalize_address("example .com").is_err());
    }
}
