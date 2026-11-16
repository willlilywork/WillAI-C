fn main() {
    // Stage the Windows App SDK runtime and the WebView2 WinRT projection
    // alongside the executable for self-contained WinUI 3 deployment.
    windows_reactor_setup::as_self_contained();
}
