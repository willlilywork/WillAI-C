#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod browser;

fn main() -> windows_webview::Result<()> {
    app::run()
}
