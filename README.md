# WillAI-C — Rust Native Rewrite

WillAI-C is being rebuilt from a clean codebase as a native Windows desktop application written in Rust.

The previous Electron, Node.js, React, TypeScript, and Vite desktop implementation has been retired from this branch. The new application shell, state, product logic, browser integration, data layer, and feature code are intended to be Rust.

## Technology baseline

- **Application language:** Rust (edition 2024).
- **Native UI:** Microsoft's `windows-reactor`, a Rust component model over native WinUI 3 controls.
- **Embedded browser:** Microsoft's `windows-webview` hosted inside the Reactor native view tree.
- **Browser engine:** Microsoft Edge WebView2 (Chromium).
- **Initial target:** Windows 10/11 x64.

Remote websites continue to use their own HTML, CSS, and JavaScript. Those are provider websites, not WillAI-C application code.

## Why this stack

The application window, workspace shell, controls, and browser host belong to one native WinUI 3 visual tree. WebView2 is hosted as a child control in the designated workspace region. The application does not create a second floating browser window or rely on an independently positioned browser surface.

Official project references:
- [windows-reactor](https://docs.rs/windows-reactor/latest/windows_reactor/)
- [windows-webview](https://github.com/microsoft/windows-rs/blob/master/docs/crates/windows-webview.md)
- [windows-reactor-setup](https://github.com/microsoft/windows-rs/blob/master/docs/crates/windows-reactor-setup.md)

## Requirements

- Windows 10/11 x64.
- Rust stable toolchain with the MSVC target.
- Visual Studio Build Tools with **Desktop development with C++** and Windows SDK.
- Microsoft Edge WebView2 Runtime (Evergreen).

## Build

```powershell
rustup update stable
rustup target add x86_64-pc-windows-msvc
cargo fmt --all -- --check
cargo test
cargo run
```

Release build:

```powershell
cargo build --release
```

## Current state

This first Rust foundation is not a feature-equivalent replacement for 0.3.1 yet. It currently contains:
- Rust Cargo project and Windows MSVC toolchain configuration.
- Native WinUI 3 workspace-first shell.
- Provider selection for ChatGPT, Claude, and DeepSeek.
- WebView2 browser view composed inside the native layout tree.
- Basic browser navigation controls.
- HTTP(S)-only address normalization and Rust unit tests.

Prompt submission, response capture, SQLite persistence, structured Working Nodes, Model Context, and the remaining product capabilities must be reimplemented on this architecture. They are not claimed as implemented.

See `docs/ARCHITECTURE.md`, `docs/PRODUCT_SCOPE.md`, `docs/INTERFACE_DESIGN.md`, and `docs/CONTINUATION_STATUS.md`.
