use std::rc::Rc;

use windows_reactor::*;
use windows_webview::{EventRegistration, Result, WebView, webview_result};

use crate::browser::{Provider, normalize_address};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Surface {
    Workspace,
    Browser,
}

struct WillAiApp {
    provider: Provider,
    prompt_draft: String,
    address: String,
    surface: Surface,
    webview: Option<WebView>,
    navigation_registration: Option<EventRegistration>,
    status: String,
}

#[derive(Clone)]
enum Message {
    SelectProvider(Provider),
    PromptChanged(Rc<str>),
    OpenProvider,
    ReturnToWorkspace,
    AddressChanged(Rc<str>),
    Navigate,
    Back,
    Forward,
    Reload,
    BrowserInitialized(std::result::Result<WebView, IntegrationError>),
    NavigationCompleted(String, bool),
}

impl Component for WillAiApp {
    type Input = ();
    type Message = Message;

    fn create(_input: &(), _context: &ComponentContext<Self>) -> Self {
        Self {
            provider: Provider::ChatGPT,
            prompt_draft: String::new(),
            address: Provider::ChatGPT.start_url().to_string(),
            surface: Surface::Workspace,
            webview: None,
            navigation_registration: None,
            status: "Workspace ready".to_string(),
        }
    }

    fn update(&mut self, message: Message, context: &ComponentContext<Self>) {
        match message {
            Message::SelectProvider(provider) => {
                self.provider = provider;
                self.address = provider.start_url().to_string();
            }
            Message::PromptChanged(value) => self.prompt_draft = value.to_string(),
            Message::OpenProvider => {
                self.address = self.provider.start_url().to_string();
                self.status = format!(
                    "{} opened. The draft remains in the workspace; sending and capture are not wired in this foundation build.",
                    self.provider.label()
                );
                self.surface = Surface::Browser;

                if let Some(webview) = &self.webview {
                    if let Err(error) = webview.navigate(&self.address) {
                        self.status = format!("Navigation failed: {error}");
                    }
                }
            }
            Message::ReturnToWorkspace => {
                // Dropping the Reactor view and its WebView handle closes this
                // browser control. Reopening creates a new control in the same
                // managed view slot instead of leaving an independent window.
                self.navigation_registration = None;
                self.webview = None;
                self.surface = Surface::Workspace;
                self.status = "Workspace ready".to_string();
            }
            Message::AddressChanged(value) => self.address = value.to_string(),
            Message::Navigate => match normalize_address(&self.address) {
                Ok(address) => {
                    self.address = address.clone();
                    self.navigate_to(&address);
                }
                Err(error) => self.status = error.to_string(),
            },
            Message::Back => self.run_browser_command(WebView::go_back),
            Message::Forward => self.run_browser_command(WebView::go_forward),
            Message::Reload => self.run_browser_command(WebView::reload),
            Message::BrowserInitialized(result) => {
                if self.webview.is_some() {
                    return;
                }

                match result {
                    Ok(webview) => {
                        let observed_webview = webview.clone();
                        let sender = context.sender();

                        match webview.on_navigation_completed(move |args| {
                            let _ = sender.send(Message::NavigationCompleted(
                                observed_webview.source(),
                                args.is_success(),
                            ));
                        }) {
                            Ok(registration) => {
                                self.navigation_registration = Some(registration);
                            }
                            Err(error) => {
                                self.status = format!("Browser event setup failed: {error}");
                            }
                        }

                        self.webview = Some(webview.clone());
                        let initial_address = self.address.clone();
                        if let Err(error) = webview.navigate(&initial_address) {
                            self.status = format!("Browser navigation failed: {error}");
                        } else {
                            self.status = format!("Connecting to {}", self.provider.label());
                        }
                    }
                    Err(error) => {
                        self.status = format!("WebView2 initialization failed: {error:?}");
                    }
                }
            }
            Message::NavigationCompleted(source, succeeded) => {
                if !source.is_empty() {
                    self.address = source.clone();
                }

                self.status = if succeeded {
                    format!("Loaded {source}")
                } else {
                    format!("Navigation failed: {source}")
                };
            }
        }
    }

    fn view(&self, _input: &(), context: &mut ViewContext<Self>) -> View {
        context.window_title("WillAI-C");
        context.window_visuals(
            WindowVisuals::new()
                .backdrop(WindowBackdrop::Mica)
                .client_size(1360.0, 900.0),
        );

        let rail = StackPanel::new()
            .spacing(8.0)
            .margin(Thickness::uniform(12.0))
            .children((
                TextBlock::new().text("W"),
                Button::new()
                    .on_click(context.message(Message::ReturnToWorkspace))
                    .content("Workspace"),
                Button::new()
                    .on_click(context.message(Message::OpenProvider))
                    .content("Browser"),
            ));

        let header = StackPanel::new()
            .orientation(Orientation::Horizontal)
            .spacing(12.0)
            .margin(Thickness::uniform(12.0))
            .children((
                TextBlock::new().text("WillAI-C"),
                TextBlock::new().text(match self.surface {
                    Surface::Workspace => "New Conversation",
                    Surface::Browser => "Provider Session",
                }),
            ));

        let content = match self.surface {
            Surface::Workspace => self.workspace_view(context),
            Surface::Browser => self.browser_view(context),
        };

        Grid::new()
            .columns([GridLength::Auto, GridLength::STAR])
            .children((
                Border::new().grid_column(0).content(rail),
                Grid::new()
                    .grid_column(1)
                    .rows([GridLength::Auto, GridLength::STAR])
                    .children((
                        Border::new().grid_row(0).content(header),
                        Border::new().grid_row(1).content(content),
                    )),
            ))
            .into()
    }
}

impl WillAiApp {
    fn workspace_view(&self, context: &mut ViewContext<Self>) -> View {
        let provider_picker = StackPanel::new()
            .orientation(Orientation::Horizontal)
            .spacing(8.0)
            .children((
                Button::new()
                    .on_click(context.message(Message::SelectProvider(Provider::ChatGPT)))
                    .content(if self.provider == Provider::ChatGPT {
                        "✓ ChatGPT"
                    } else {
                        "ChatGPT"
                    }),
                Button::new()
                    .on_click(context.message(Message::SelectProvider(Provider::Claude)))
                    .content(if self.provider == Provider::Claude {
                        "✓ Claude"
                    } else {
                        "Claude"
                    }),
                Button::new()
                    .on_click(context.message(Message::SelectProvider(Provider::DeepSeek)))
                    .content(if self.provider == Provider::DeepSeek {
                        "✓ DeepSeek"
                    } else {
                        "DeepSeek"
                    }),
            ));

        StackPanel::new()
            .spacing(14.0)
            .margin(Thickness::uniform(32.0))
            .children((
                TextBlock::new().text("Start a new conversation"),
                TextBlock::new().text(
                    "Choose a provider. Its signed-in session opens inside the workspace, not in a separate browser window."
                ),
                TextBlock::new().text("AI provider"),
                provider_picker,
                TextBlock::new().text("Prompt draft"),
                TextBox::new()
                    .text(&self.prompt_draft)
                    .placeholder_text("Write what you want to work on…")
                    .on_text_changed(
                        context.callback(|value: Rc<str>| Message::PromptChanged(value)),
                    ),
                Button::new()
                    .on_click(context.message(Message::OpenProvider))
                    .content("Open selected provider"),
                TextBlock::new().text(
                    "This is the clean Rust foundation. Prompt submission, response capture, and local persistence are not yet implemented."
                ),
            ))
            .into()
    }

    fn browser_view(&self, context: &mut ViewContext<Self>) -> View {
        let toolbar = Grid::new()
            .columns([
                GridLength::Auto,
                GridLength::Auto,
                GridLength::Auto,
                GridLength::STAR,
                GridLength::Auto,
                GridLength::Auto,
            ])
            .column_spacing(8.0)
            .margin(Thickness::uniform(8.0))
            .children((
                Button::new()
                    .on_click(context.message(Message::Back))
                    .grid_column(0)
                    .content("Back"),
                Button::new()
                    .on_click(context.message(Message::Forward))
                    .grid_column(1)
                    .content("Forward"),
                Button::new()
                    .on_click(context.message(Message::Reload))
                    .grid_column(2)
                    .content("Reload"),
                TextBox::new()
                    .text(&self.address)
                    .placeholder_text("Enter a website address")
                    .on_text_changed(
                        context.callback(|value: Rc<str>| Message::AddressChanged(value)),
                    )
                    .grid_column(3),
                Button::new()
                    .on_click(context.message(Message::Navigate))
                    .grid_column(4)
                    .content("Go"),
                Button::new()
                    .on_click(context.message(Message::ReturnToWorkspace))
                    .grid_column(5)
                    .content("Workspace"),
            ));

        Grid::new()
            .rows([GridLength::Auto, GridLength::STAR, GridLength::Auto])
            .children((
                toolbar,
                Border::new().grid_row(1).content(webview_result(
                    context.callback(Message::BrowserInitialized),
                )),
                TextBlock::new()
                    .grid_row(2)
                    .margin(Thickness::uniform(8.0))
                    .text(&self.status),
            ))
            .into()
    }

    fn navigate_to(&mut self, address: &str) {
        if let Some(webview) = &self.webview {
            match webview.navigate(address) {
                Ok(()) => self.status = format!("Loading {address}"),
                Err(error) => self.status = format!("Navigation failed: {error}"),
            }
        } else {
            self.status = "The browser control is not ready yet.".to_string();
        }
    }

    fn run_browser_command(&mut self, command: impl FnOnce(&WebView) -> Result<()>) {
        if let Some(webview) = &self.webview {
            if let Err(error) = command(webview) {
                self.status = format!("Browser command failed: {error}");
            }
        }
    }
}

pub fn run() -> Result<()> {
    App::run_component::<WillAiApp>(())
}
