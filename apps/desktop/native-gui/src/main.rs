#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use eframe::egui::{
    self, Align, Color32, FontFamily, Frame, Key, Layout, Margin, Rounding,
    RichText, ScrollArea, Sense, Stroke, TextEdit, Vec2,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::thread;
use std::time::{Duration, Instant};

// ============================================================================
// Exact Color Palette from User's 3-Column Dark UI Prototype
// ============================================================================
const C_BG: Color32 = Color32::from_rgb(0x14, 0x14, 0x14); // --bg: #141414
const C_BG_SIDE: Color32 = Color32::from_rgb(0x1b, 0x1b, 0x1b); // --bg-side: #1b1b1b
const C_BG_PANEL: Color32 = Color32::from_rgb(0x18, 0x18, 0x18); // --bg-panel: #181818
const C_BG_RAISE: Color32 = Color32::from_rgb(0x21, 0x21, 0x21); // --bg-raise: #212121
const C_BG_HOVER: Color32 = Color32::from_rgb(0x25, 0x25, 0x25); // --bg-hover: #252525
const C_BG_ACTIVE: Color32 = Color32::from_rgb(0x2d, 0x2d, 0x2d); // --bg-active: #2d2d2d
const C_LINE: Color32 = Color32::from_rgb(0x2a, 0x2a, 0x2a); // --line: #2a2a2a
const C_LINE_STRONG: Color32 = Color32::from_rgb(0x3a, 0x3a, 0x3a); // --line-strong: #3a3a3a
const C_TEXT: Color32 = Color32::from_rgb(0xe8, 0xe8, 0xe8); // --text: #e8e8e8
const C_TEXT_2: Color32 = Color32::from_rgb(0xb4, 0xb4, 0xb4); // --text-2: #b4b4b4
const C_TEXT_3: Color32 = Color32::from_rgb(0x7a, 0x7a, 0x7a); // --text-3: #7a7a7a
const C_ACCENT: Color32 = Color32::from_rgb(0x0a, 0x84, 0xff); // --accent: #0a84ff
const C_CODE_BG: Color32 = Color32::from_rgb(0x21, 0x21, 0x25); // --code-bg: #212125
const C_GREEN: Color32 = Color32::from_rgb(0x30, 0xd1, 0x58);
const C_AMBER: Color32 = Color32::from_rgb(0xff, 0x9f, 0x0a);

// ============================================================================
// Data Models (Mirrors OpenCode Sidecar + Entry Cloud Gateway)
// ============================================================================

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct LiveModel {
    id: String,
    name: String,
    #[serde(default)]
    chef: String,
    #[serde(default)]
    contextWindow: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct AccountInfo {
    id: String,
    email: String,
    #[serde(default)]
    plan: Option<String>,
    #[serde(default)]
    plan_name: Option<String>,
    #[serde(default)]
    credit_balance_cents: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct ProjectItem {
    id: String,
    worktree: String,
    name: String,
    #[serde(default)]
    branch: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct SessionItem {
    id: String,
    project_id: String,
    slug: String,
    directory: String,
    title: String,
    agent: String,
    #[serde(default)]
    model_id: Option<String>,
    #[serde(default)]
    summary_additions: i64,
    #[serde(default)]
    summary_deletions: i64,
    #[serde(default)]
    summary_files: i64,
    #[serde(default)]
    verified: i64,
    #[serde(default)]
    verification_summary: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct MessageItem {
    id: String,
    session_id: String,
    role: String,
    agent: String,
    #[serde(default)]
    model_id: Option<String>,
    #[serde(default)]
    input_tokens: i64,
    #[serde(default)]
    output_tokens: i64,
    #[serde(default)]
    data: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct ArtifactItem {
    id: String,
    session_id: String,
    title: String,
    kind: String,
    #[serde(default)]
    file_path: Option<String>,
    content: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct ScheduleItem {
    id: String,
    project_id: String,
    name: String,
    cron: String,
    prompt: String,
    agent: String,
    enabled: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct PluginItem {
    name: String,
    version: String,
    description: String,
    enabled: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct DeviceAuthStart {
    device_code: String,
    code: String,
    verification_uri_complete: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum NavSection {
    ConversationHistory,
    Automations,
    Customizations,
    Settings,
}

#[derive(Clone, Debug)]
struct WorkspaceTab {
    id: String,
    title: String,
    kind: String, // "architecture" | "plan" | "diff" | "verification" | "markdown"
    content: String,
    file_path: Option<String>,
}

enum WorkerEvent {
    SidecarSynced {
        healthy: bool,
        account: Option<AccountInfo>,
        projects: Vec<ProjectItem>,
        sessions: Vec<SessionItem>,
        schedules: Vec<ScheduleItem>,
        plugins: Vec<PluginItem>,
    },
    ModelsLoaded {
        models: Vec<LiveModel>,
        source: String,
        error: Option<String>,
    },
    SessionDetailLoaded {
        session: SessionItem,
        messages: Vec<MessageItem>,
        artifacts: Vec<ArtifactItem>,
        diff: String,
    },
    DeviceAuthInitiated(Result<DeviceAuthStart, String>),
    DeviceAuthPollResult {
        approved: bool,
        account: Option<AccountInfo>,
        error: Option<String>,
    },
    TurnFinished {
        session_id: String,
        error: Option<String>,
    },
}

// ============================================================================
// Main Application State
// ============================================================================

struct EntryDesktopApp {
    sidecar_url: String,
    entry_cloud_url: String,
    sidecar_process: Option<Child>,
    sidecar_healthy: bool,

    // Channels for non-blocking background HTTP operations
    tx: Sender<WorkerEvent>,
    rx: Receiver<WorkerEvent>,

    // Layout & 3-Column State
    show_left_sidebar: bool,
    show_right_panel: bool,
    expand_right_panel_full: bool,
    active_nav: NavSection,

    // Left Sidebar Filter State
    show_conv_search: bool,
    conv_search_query: String,
    show_project_filter: bool,
    project_filter_query: String,

    // Auth & Account State (OpenCode RFC 8628 Device Flow)
    account: Option<AccountInfo>,
    device_auth_pending: Option<DeviceAuthStart>,
    last_device_poll: Instant,
    auth_status_text: String,
    manual_token_input: String,

    // Live Models from Entry (`https://entry-agents.dev/api/desktop/models` or `/api/models`)
    // Strictly ZERO hardcoded models!
    models: Vec<LiveModel>,
    models_loading: bool,
    models_source_url: String,
    models_error: Option<String>,
    selected_model_id: Option<String>,
    model_search_query: String,

    // Projects, Sessions, Messages
    projects: Vec<ProjectItem>,
    active_project_id: Option<String>,
    sessions: Vec<SessionItem>,
    active_session_id: Option<String>,
    messages: Vec<MessageItem>,

    // Composer State
    prompt_input: String,
    agent_mode: String, // "build" | "plan"
    turbo_enabled: bool,
    turn_in_progress: bool,

    // Right Workspace Column Tabs
    workspace_tabs: Vec<WorkspaceTab>,
    active_tab_index: usize,
    latest_diff: String,

    // Automations & Customizations
    schedules: Vec<ScheduleItem>,
    new_sched_name: String,
    new_sched_cron: String,
    new_sched_prompt: String,
    plugins: Vec<PluginItem>,
}

impl EntryDesktopApp {
    fn new(cc: &eframe::CreationContext<'_>) -> Self {
        Self::configure_theme(&cc.egui_ctx);

        let sidecar_port = std::env::var("ENTRY_SIDECAR_PORT").unwrap_or_else(|_| "4096".to_string());
        let sidecar_url = format!("http://127.0.0.1:{}", sidecar_port);
        let entry_cloud_url = std::env::var("ENTRY_BACKEND_URL")
            .unwrap_or_else(|_| "https://entry-agents.dev".to_string());

        let sidecar_process = Self::try_spawn_sidecar(&sidecar_port);
        let (tx, rx) = channel();

        let default_tabs = vec![
            WorkspaceTab {
                id: "tab_arch".to_string(),
                title: "Entry Agents Architecture Blueprint".to_string(),
                kind: "architecture".to_string(),
                file_path: Some("apps/desktop/src/server/server.ts".to_string()),
                content: String::new(),
            },
            WorkspaceTab {
                id: "tab_diff".to_string(),
                title: "Workspace Git Diff".to_string(),
                kind: "diff".to_string(),
                file_path: None,
                content: String::new(),
            },
        ];

        let mut app = Self {
            sidecar_url,
            entry_cloud_url,
            sidecar_process,
            sidecar_healthy: false,
            tx,
            rx,
            show_left_sidebar: true,
            show_right_panel: true,
            expand_right_panel_full: false,
            active_nav: NavSection::ConversationHistory,
            show_conv_search: false,
            conv_search_query: String::new(),
            show_project_filter: false,
            project_filter_query: String::new(),
            account: None,
            device_auth_pending: None,
            last_device_poll: Instant::now(),
            auth_status_text: String::new(),
            manual_token_input: String::new(),
            models: Vec::new(),
            models_loading: true,
            models_source_url: String::new(),
            models_error: None,
            selected_model_id: None,
            model_search_query: String::new(),
            projects: Vec::new(),
            active_project_id: None,
            sessions: Vec::new(),
            active_session_id: None,
            messages: Vec::new(),
            prompt_input: String::new(),
            agent_mode: "build".to_string(),
            turbo_enabled: true,
            turn_in_progress: false,
            workspace_tabs: default_tabs,
            active_tab_index: 0,
            latest_diff: String::new(),
            schedules: Vec::new(),
            new_sched_name: String::new(),
            new_sched_cron: "0 9 * * 1-5".to_string(),
            new_sched_prompt: String::new(),
            plugins: Vec::new(),
        };

        app.trigger_initial_sync();
        app.trigger_fetch_live_models();
        app
    }

    fn configure_theme(ctx: &egui::Context) {
        let mut visuals = egui::Visuals::dark();
        visuals.panel_fill = C_BG;
        visuals.window_fill = C_BG_RAISE;
        visuals.extreme_bg_color = C_BG;
        visuals.faint_bg_color = C_BG_PANEL;
        visuals.code_bg_color = C_CODE_BG;
        visuals.override_text_color = Some(C_TEXT);
        visuals.widgets.noninteractive.bg_fill = C_BG;
        visuals.widgets.noninteractive.bg_stroke = Stroke::new(1.0, C_LINE);
        visuals.widgets.noninteractive.fg_stroke = Stroke::new(1.0, C_TEXT);
        visuals.widgets.inactive.bg_fill = C_BG_RAISE;
        visuals.widgets.inactive.bg_stroke = Stroke::new(1.0, C_LINE);
        visuals.widgets.inactive.fg_stroke = Stroke::new(1.0, C_TEXT_2);
        visuals.widgets.hovered.bg_fill = C_BG_HOVER;
        visuals.widgets.hovered.bg_stroke = Stroke::new(1.0, C_LINE_STRONG);
        visuals.widgets.hovered.fg_stroke = Stroke::new(1.0, C_TEXT);
        visuals.widgets.active.bg_fill = C_BG_ACTIVE;
        visuals.widgets.active.bg_stroke = Stroke::new(1.0, C_ACCENT);
        visuals.widgets.active.fg_stroke = Stroke::new(1.0, C_TEXT);
        visuals.selection.bg_fill = C_ACCENT.linear_multiply(0.28);
        visuals.selection.stroke = Stroke::new(1.0, C_ACCENT);
        ctx.set_visuals(visuals);
    }

    fn try_spawn_sidecar(port: &str) -> Option<Child> {
        // Check if sidecar is already running on 127.0.0.1:<port>
        let health_url = format!("http://127.0.0.1:{}/global/health", port);
        if ureq::get(&health_url)
            .timeout(Duration::from_millis(350))
            .call()
            .is_ok()
        {
            return None;
        }

        // Look for entry-agent-sidecar.exe next to entry-desktop.exe
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(dir) = exe_path.parent() {
                let candidate = dir.join("entry-agent-sidecar.exe");
                if candidate.exists() {
                    if let Ok(child) = Command::new(candidate)
                        .arg("--port")
                        .arg(port)
                        .stdin(Stdio::null())
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .spawn()
                    {
                        return Some(child);
                    }
                }
            }
        }
        None
    }

    fn trigger_initial_sync(&self) {
        let tx = self.tx.clone();
        let sidecar = self.sidecar_url.clone();
        thread::spawn(move || {
            // Wait briefly if sidecar is booting
            for _ in 0..8 {
                if ureq::get(&format!("{}/global/health", sidecar))
                    .timeout(Duration::from_millis(400))
                    .call()
                    .is_ok()
                {
                    break;
                }
                thread::sleep(Duration::from_millis(250));
            }

            let healthy = ureq::get(&format!("{}/global/health", sidecar))
                .timeout(Duration::from_millis(800))
                .call()
                .is_ok();

            let account = ureq::get(&format!("{}/auth/status", sidecar))
                .call()
                .ok()
                .and_then(|r| r.into_json::<serde_json::Value>().ok())
                .and_then(|v| serde_json::from_value::<AccountInfo>(v["account"].clone()).ok());

            let projects = ureq::get(&format!("{}/project", sidecar))
                .call()
                .ok()
                .and_then(|r| r.into_json::<serde_json::Value>().ok())
                .and_then(|v| serde_json::from_value::<Vec<ProjectItem>>(v["projects"].clone()).ok())
                .unwrap_or_default();

            let sessions = ureq::get(&format!("{}/session", sidecar))
                .call()
                .ok()
                .and_then(|r| r.into_json::<serde_json::Value>().ok())
                .and_then(|v| serde_json::from_value::<Vec<SessionItem>>(v["sessions"].clone()).ok())
                .unwrap_or_default();

            let schedules = ureq::get(&format!("{}/schedule", sidecar))
                .call()
                .ok()
                .and_then(|r| r.into_json::<serde_json::Value>().ok())
                .and_then(|v| {
                    serde_json::from_value::<Vec<ScheduleItem>>(v["schedules"].clone()).ok()
                })
                .unwrap_or_default();

            let plugins = ureq::get(&format!("{}/plugin", sidecar))
                .call()
                .ok()
                .and_then(|r| r.into_json::<serde_json::Value>().ok())
                .and_then(|v| serde_json::from_value::<Vec<PluginItem>>(v["plugins"].clone()).ok())
                .unwrap_or_default();

            let _ = tx.send(WorkerEvent::SidecarSynced {
                healthy,
                account,
                projects,
                sessions,
                schedules,
                plugins,
            });
        });
    }

    fn trigger_fetch_live_models(&mut self) {
        self.models_loading = true;
        self.models_error = None;
        let tx = self.tx.clone();
        let sidecar = self.sidecar_url.clone();
        let cloud = self.entry_cloud_url.clone();
        thread::spawn(move || {
            // 1. Try local sidecar `/models` (which proxies `https://entry-agents.dev/api/desktop/models` & `/api/models`)
            if let Ok(resp) = ureq::get(&format!("{}/models", sidecar))
                .timeout(Duration::from_secs(8))
                .call()
            {
                if let Ok(val) = resp.into_json::<serde_json::Value>() {
                    if let Ok(models) =
                        serde_json::from_value::<Vec<LiveModel>>(val["models"].clone())
                    {
                        if !models.is_empty() {
                            let source = val["sourceUrl"]
                                .as_str()
                                .unwrap_or("https://entry-agents.dev/api/models")
                                .to_string();
                            let _ = tx.send(WorkerEvent::ModelsLoaded {
                                models,
                                source,
                                error: None,
                            });
                            return;
                        }
                    }
                }
            }

            // 2. Fallback: Query `https://entry-agents.dev/api/models` directly so live models work even without sidecar
            let direct_url = format!("{}/api/models", cloud.trim_end_matches('/'));
            match ureq::get(&direct_url)
                .timeout(Duration::from_secs(10))
                .call()
            {
                Ok(resp) => {
                    if let Ok(val) = resp.into_json::<serde_json::Value>() {
                        let models =
                            serde_json::from_value::<Vec<LiveModel>>(val["models"].clone())
                                .unwrap_or_default();
                        let _ = tx.send(WorkerEvent::ModelsLoaded {
                            models,
                            source: direct_url,
                            error: None,
                        });
                        return;
                    }
                }
                Err(err) => {
                    let _ = tx.send(WorkerEvent::ModelsLoaded {
                        models: Vec::new(),
                        source: direct_url,
                        error: Some(format!("Failed to load live models from Entry: {}", err)),
                    });
                    return;
                }
            }
        });
    }

    fn trigger_load_session(&self, session_id: String) {
        let tx = self.tx.clone();
        let sidecar = self.sidecar_url.clone();
        thread::spawn(move || {
            let detail = ureq::get(&format!("{}/session/{}", sidecar, session_id))
                .call()
                .ok()
                .and_then(|r| r.into_json::<serde_json::Value>().ok());

            let diff = ureq::get(&format!("{}/session/{}/diff", sidecar, session_id))
                .call()
                .ok()
                .and_then(|r| r.into_json::<serde_json::Value>().ok())
                .and_then(|v| v["diff"].as_str().map(|s| s.to_string()))
                .unwrap_or_default();

            if let Some(val) = detail {
                if let Ok(session) = serde_json::from_value::<SessionItem>(val["session"].clone()) {
                    let messages =
                        serde_json::from_value::<Vec<MessageItem>>(val["messages"].clone())
                            .unwrap_or_default();
                    let artifacts =
                        serde_json::from_value::<Vec<ArtifactItem>>(val["artifacts"].clone())
                            .unwrap_or_default();
                    let _ = tx.send(WorkerEvent::SessionDetailLoaded {
                        session,
                        messages,
                        artifacts,
                        diff,
                    });
                }
            }
        });
    }

    fn trigger_new_session(&mut self) {
        let tx = self.tx.clone();
        let sidecar = self.sidecar_url.clone();
        let project_id = self.active_project_id.clone();
        let agent = self.agent_mode.clone();
        let model_id = self.selected_model_id.clone();
        thread::spawn(move || {
            let payload = serde_json::json!({
                "projectId": project_id,
                "title": "New Conversation",
                "agent": agent,
                "modelId": model_id,
            });
            if let Ok(resp) = ureq::post(&format!("{}/session", sidecar)).send_json(payload) {
                if let Ok(val) = resp.into_json::<serde_json::Value>() {
                    if let Ok(session) =
                        serde_json::from_value::<SessionItem>(val["session"].clone())
                    {
                        let _ = tx.send(WorkerEvent::SessionDetailLoaded {
                            session,
                            messages: Vec::new(),
                            artifacts: Vec::new(),
                            diff: String::new(),
                        });
                    }
                }
            }
        });
    }

    fn trigger_send_prompt(&mut self) {
        let text = self.prompt_input.trim().to_string();
        if text.is_empty() || self.turn_in_progress {
            return;
        }
        let Some(model_id) = self.selected_model_id.clone() else {
            self.auth_status_text =
                "Select a live model from Entry in the composer before sending.".to_string();
            return;
        };
        let Some(session_id) = self.active_session_id.clone() else {
            return;
        };

        self.prompt_input.clear();
        self.turn_in_progress = true;

        let tx = self.tx.clone();
        let sidecar = self.sidecar_url.clone();
        let agent = self.agent_mode.clone();
        let turbo = self.turbo_enabled;

        thread::spawn(move || {
            let payload = serde_json::json!({
                "text": text,
                "agent": agent,
                "modelId": model_id,
                "turbo": turbo,
            });
            match ureq::post(&format!("{}/session/{}/message", sidecar, session_id))
                .timeout(Duration::from_secs(180))
                .send_json(payload)
            {
                Ok(resp) => {
                    if let Ok(val) = resp.into_json::<serde_json::Value>() {
                        if let Ok(session) =
                            serde_json::from_value::<SessionItem>(val["session"].clone())
                        {
                            let messages = serde_json::from_value::<Vec<MessageItem>>(
                                val["messages"].clone(),
                            )
                            .unwrap_or_default();
                            let artifacts = serde_json::from_value::<Vec<ArtifactItem>>(
                                val["artifacts"].clone(),
                            )
                            .unwrap_or_default();
                            let _ = tx.send(WorkerEvent::SessionDetailLoaded {
                                session,
                                messages,
                                artifacts,
                                diff: String::new(),
                            });
                        }
                    }
                    let _ = tx.send(WorkerEvent::TurnFinished {
                        session_id,
                        error: None,
                    });
                }
                Err(err) => {
                    let _ = tx.send(WorkerEvent::TurnFinished {
                        session_id,
                        error: Some(format!("Turn error: {}", err)),
                    });
                }
            }
        });
    }

    fn trigger_abort_turn(&mut self) {
        if let Some(session_id) = self.active_session_id.clone() {
            let sidecar = self.sidecar_url.clone();
            self.turn_in_progress = false;
            thread::spawn(move || {
                let _ = ureq::post(&format!("{}/session/{}/abort", sidecar, session_id))
                    .send_json(serde_json::json!({}));
            });
        }
    }

    fn trigger_start_device_auth(&mut self) {
        self.auth_status_text = "Requesting verification code from entry-agents.dev...".to_string();
        let tx = self.tx.clone();
        let sidecar = self.sidecar_url.clone();
        let cloud = self.entry_cloud_url.clone();

        thread::spawn(move || {
            // Try via sidecar first, then direct to entry-agents.dev
            if let Ok(resp) = ureq::post(&format!("{}/auth/device/start", sidecar))
                .send_json(serde_json::json!({}))
            {
                if let Ok(start) = resp.into_json::<DeviceAuthStart>() {
                    let _ = open::that(&start.verification_uri_complete);
                    let _ = tx.send(WorkerEvent::DeviceAuthInitiated(Ok(start)));
                    return;
                }
            }

            let direct_url = format!("{}/api/desktop/device/start", cloud.trim_end_matches('/'));
            match ureq::post(&direct_url).send_json(serde_json::json!({})) {
                Ok(resp) => {
                    if let Ok(val) = resp.into_json::<serde_json::Value>() {
                        let code = val["code"]
                            .as_str()
                            .or_else(|| val["user_code"].as_str())
                            .unwrap_or("")
                            .to_string();
                        let device_code = val["device_code"].as_str().unwrap_or("").to_string();
                        let uri = format!(
                            "{}/desktop/approve?code={}",
                            cloud.trim_end_matches('/'),
                            code
                        );
                        let _ = open::that(&uri);
                        let _ = tx.send(WorkerEvent::DeviceAuthInitiated(Ok(DeviceAuthStart {
                            device_code,
                            code,
                            verification_uri_complete: uri,
                        })));
                    }
                }
                Err(e) => {
                    let _ = tx.send(WorkerEvent::DeviceAuthInitiated(Err(format!(
                        "Device sign-in error: {}",
                        e
                    ))));
                }
            }
        });
    }

    fn poll_device_auth_if_needed(&mut self) {
        let Some(pending) = self.device_auth_pending.clone() else {
            return;
        };
        if self.last_device_poll.elapsed() < Duration::from_secs(3) {
            return;
        }
        self.last_device_poll = Instant::now();
        let tx = self.tx.clone();
        let sidecar = self.sidecar_url.clone();

        thread::spawn(move || {
            if let Ok(resp) = ureq::post(&format!("{}/auth/device/poll", sidecar)).send_json(
                serde_json::json!({
                    "device_code": pending.device_code
                }),
            ) {
                if let Ok(val) = resp.into_json::<serde_json::Value>() {
                    let status = val["status"].as_str().unwrap_or("pending");
                    if status == "approved" {
                        let account =
                            serde_json::from_value::<AccountInfo>(val["account"].clone()).ok();
                        let _ = tx.send(WorkerEvent::DeviceAuthPollResult {
                            approved: true,
                            account,
                            error: None,
                        });
                    } else if status == "expired" {
                        let _ = tx.send(WorkerEvent::DeviceAuthPollResult {
                            approved: false,
                            account: None,
                            error: Some("Device code expired".to_string()),
                        });
                    }
                }
            }
        });
    }

    fn process_worker_events(&mut self) {
        while let Ok(ev) = self.rx.try_recv() {
            match ev {
                WorkerEvent::SidecarSynced {
                    healthy,
                    account,
                    projects,
                    sessions,
                    schedules,
                    plugins,
                } => {
                    self.sidecar_healthy = healthy;
                    self.account = account;
                    self.projects = projects;
                    if self.active_project_id.is_none() {
                        self.active_project_id = self.projects.first().map(|p| p.id.clone());
                    }
                    self.sessions = sessions;
                    if self.active_session_id.is_none() {
                        if let Some(first) = self.sessions.first() {
                            let id = first.id.clone();
                            self.active_session_id = Some(id.clone());
                            self.agent_mode = first.agent.clone();
                            self.trigger_load_session(id);
                        }
                    }
                    self.schedules = schedules;
                    self.plugins = plugins;
                }
                WorkerEvent::ModelsLoaded {
                    models,
                    source,
                    error,
                } => {
                    self.models_loading = false;
                    self.models_source_url = source;
                    self.models_error = error;
                    self.models = models;
                    if self.selected_model_id.is_none() {
                        self.selected_model_id = self.models.first().map(|m| m.id.clone());
                    }
                }
                WorkerEvent::SessionDetailLoaded {
                    session,
                    messages,
                    artifacts,
                    diff,
                } => {
                    self.active_session_id = Some(session.id.clone());
                    self.agent_mode = session.agent.clone();
                    if let Some(mid) = &session.model_id {
                        if !mid.is_empty() {
                            self.selected_model_id = Some(mid.clone());
                        }
                    }
                    if let Some(existing) =
                        self.sessions.iter_mut().find(|s| s.id == session.id)
                    {
                        *existing = session.clone();
                    } else {
                        self.sessions.insert(0, session.clone());
                    }
                    self.messages = messages;
                    if !diff.is_empty() {
                        self.latest_diff = diff;
                    }
                    for art in artifacts {
                        if let Some(tab) = self.workspace_tabs.iter_mut().find(|t| t.id == art.id) {
                            tab.title = art.title;
                            tab.content = art.content;
                            tab.kind = art.kind;
                        } else {
                            self.workspace_tabs.push(WorkspaceTab {
                                id: art.id,
                                title: art.title,
                                kind: art.kind,
                                file_path: art.file_path,
                                content: art.content,
                            });
                            self.active_tab_index = self.workspace_tabs.len() - 1;
                        }
                    }
                }
                WorkerEvent::DeviceAuthInitiated(res) => match res {
                    Ok(start) => {
                        self.auth_status_text = format!(
                            "Browser opened! Approve code {} at entry-agents.dev/desktop/approve",
                            start.code
                        );
                        self.device_auth_pending = Some(start);
                        self.last_device_poll = Instant::now();
                    }
                    Err(e) => {
                        self.auth_status_text = e;
                    }
                },
                WorkerEvent::DeviceAuthPollResult {
                    approved,
                    account,
                    error,
                } => {
                    if approved {
                        self.device_auth_pending = None;
                        self.account = account;
                        self.auth_status_text = "Signed in to Entry Desktop!".to_string();
                        self.trigger_fetch_live_models();
                    } else if let Some(err) = error {
                        self.device_auth_pending = None;
                        self.auth_status_text = err;
                    }
                }
                WorkerEvent::TurnFinished { error, .. } => {
                    self.turn_in_progress = false;
                    if let Some(e) = error {
                        self.auth_status_text = e;
                    }
                }
            }
        }
    }
}

// ============================================================================
// UI Rendering: Clean 3-Column Dark Workspace Matching User's Prototype
// ============================================================================

impl eframe::App for EntryDesktopApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.process_worker_events();
        self.poll_device_auth_if_needed();

        if self.turn_in_progress || self.device_auth_pending.is_some() || self.models_loading {
            ctx.request_repaint_after(Duration::from_millis(250));
        }

        // COLUMN 1: Left Sidebar (335px, Collapsible, #1b1b1b)
        if self.show_left_sidebar {
            egui::SidePanel::left("col1_left_sidebar")
                .exact_width(335.0)
                .resizable(false)
                .frame(
                    Frame::none()
                        .fill(C_BG_SIDE)
                        .stroke(Stroke::new(1.0, C_LINE)),
                )
                .show(ctx, |ui| {
                    self.render_left_sidebar(ui);
                });
        }

        // COLUMN 3: Right Workspace Panel (560px or Full-Width Expanded, #181818)
        if self.show_right_panel && !self.expand_right_panel_full {
            egui::SidePanel::right("col3_right_panel")
                .default_width(560.0)
                .width_range(400.0..=920.0)
                .resizable(true)
                .frame(
                    Frame::none()
                        .fill(C_BG_PANEL)
                        .stroke(Stroke::new(1.0, C_LINE)),
                )
                .show(ctx, |ui| {
                    self.render_right_workspace_panel(ui);
                });
        }

        // COLUMN 2: Center Conversation Thread & Composer (or Full-Width Right Panel)
        egui::CentralPanel::default()
            .frame(Frame::none().fill(C_BG))
            .show(ctx, |ui| {
                if self.show_right_panel && self.expand_right_panel_full {
                    self.render_right_workspace_panel(ui);
                } else {
                    self.render_center_column(ui);
                }
            });
    }
}

impl EntryDesktopApp {
    // ------------------------------------------------------------------------
    // COLUMN 1: Left Sidebar (335px)
    // ------------------------------------------------------------------------
    fn render_left_sidebar(&mut self, ui: &mut egui::Ui) {
        // Top Header (50px height)
        Frame::none()
            .inner_margin(Margin::symmetric(14.0, 10.0))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    // Entry Logo Mark
                    let (rect, _) = ui.allocate_exact_size(Vec2::new(22.0, 22.0), Sense::hover());
                    ui.painter().circle_stroke(
                        rect.center(),
                        9.0,
                        Stroke::new(2.0, C_TEXT),
                    );
                    ui.painter().circle_filled(rect.center(), 3.0, C_ACCENT);

                    ui.add_space(4.0);
                    if ui
                        .add(
                            egui::Button::new(RichText::new("◧").size(15.0).color(C_TEXT_2))
                                .frame(false),
                        )
                        .on_hover_text("Hide Sidebar")
                        .clicked()
                    {
                        self.show_left_sidebar = false;
                    }

                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        // + New Conversation
                        if ui
                            .add(
                                egui::Button::new(RichText::new("＋").size(16.0).color(C_TEXT))
                                    .fill(C_BG_RAISE)
                                    .rounding(Rounding::same(7.0)),
                            )
                            .on_hover_text("New Conversation")
                            .clicked()
                        {
                            self.trigger_new_session();
                        }

                        // Search Conversations Toggle
                        if ui
                            .add(
                                egui::Button::new(RichText::new("⌕").size(15.0).color(C_TEXT_2))
                                    .frame(false),
                            )
                            .on_hover_text("Search Conversations")
                            .clicked()
                        {
                            self.show_conv_search = !self.show_conv_search;
                        }
                    });
                });
            });

        // Navigation Items: Conversation History, Automations, Customizations
        Frame::none()
            .inner_margin(Margin::symmetric(12.0, 4.0))
            .show(ui, |ui| {
                self.render_nav_button(
                    ui,
                    "↺  Conversation History",
                    NavSection::ConversationHistory,
                );
                self.render_nav_button(ui, "⚡  Automations", NavSection::Automations);
                self.render_nav_button(ui, "🧩  Customizations", NavSection::Customizations);
            });

        ui.add_space(6.0);

        // Scrollable Projects & Conversations List
        ScrollArea::vertical()
            .id_salt("left_sidebar_scroll")
            .auto_shrink([false, false])
            .max_height(ui.available_height() - 108.0)
            .show(ui, |ui| {
                Frame::none()
                    .inner_margin(Margin::symmetric(12.0, 4.0))
                    .show(ui, |ui| {
                        // PROJECTS SECTION
                        ui.horizontal(|ui| {
                            ui.label(
                                RichText::new("Projects")
                                    .size(12.5)
                                    .color(C_TEXT_3)
                                    .strong(),
                            );
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                if ui
                                    .add(
                                        egui::Button::new(
                                            RichText::new("📁+").size(12.5).color(C_TEXT_2),
                                        )
                                        .frame(false),
                                    )
                                    .on_hover_text("Add Project Folder")
                                    .clicked()
                                {
                                    if let Some(folder) = rfd::FileDialog::new().pick_folder() {
                                        self.add_project_folder(folder);
                                    }
                                }
                                if ui
                                    .add(
                                        egui::Button::new(
                                            RichText::new("⌕").size(13.0).color(C_TEXT_3),
                                        )
                                        .frame(false),
                                    )
                                    .on_hover_text("Filter Projects")
                                    .clicked()
                                {
                                    self.show_project_filter = !self.show_project_filter;
                                }
                            });
                        });

                        if self.show_project_filter {
                            ui.add_space(4.0);
                            ui.add(
                                TextEdit::singleline(&mut self.project_filter_query)
                                    .hint_text("Filter projects...")
                                    .desired_width(f32::INFINITY),
                            );
                        }

                        ui.add_space(4.0);
                        let proj_filter = self.project_filter_query.to_lowercase();
                        for proj in self.projects.clone() {
                            if !proj_filter.is_empty()
                                && !proj.name.to_lowercase().contains(&proj_filter)
                            {
                                continue;
                            }
                            let is_active = self.active_project_id.as_deref() == Some(&proj.id);
                            let bg = if is_active {
                                C_BG_ACTIVE
                            } else {
                                Color32::TRANSPARENT
                            };
                            Frame::none()
                                .fill(bg)
                                .rounding(Rounding::same(8.0))
                                .inner_margin(Margin::symmetric(10.0, 7.0))
                                .show(ui, |ui| {
                                    let resp = ui.horizontal(|ui| {
                                        ui.label(RichText::new("▣").size(13.0).color(C_TEXT_2));
                                        ui.label(
                                            RichText::new(&proj.name).size(13.5).color(C_TEXT),
                                        );
                                        if let Some(branch) = &proj.branch {
                                            ui.with_layout(
                                                Layout::right_to_left(Align::Center),
                                                |ui| {
                                                    ui.label(
                                                        RichText::new(branch)
                                                            .size(11.0)
                                                            .color(C_TEXT_3)
                                                            .family(FontFamily::Monospace),
                                                    );
                                                },
                                            );
                                        }
                                    });
                                    if resp.response.interact(Sense::click()).clicked() {
                                        self.active_project_id = Some(proj.id.clone());
                                    }
                                });
                        }

                        ui.add_space(12.0);

                        // CONVERSATIONS SECTION
                        ui.horizontal(|ui| {
                            ui.label(
                                RichText::new("Conversations")
                                    .size(12.5)
                                    .color(C_TEXT_3)
                                    .strong(),
                            );
                        });

                        if self.show_conv_search {
                            ui.add_space(4.0);
                            ui.add(
                                TextEdit::singleline(&mut self.conv_search_query)
                                    .hint_text("Filter conversations...")
                                    .desired_width(f32::INFINITY),
                            );
                        }

                        ui.add_space(4.0);
                        let conv_filter = self.conv_search_query.to_lowercase();
                        for sess in self.sessions.clone() {
                            if !conv_filter.is_empty()
                                && !sess.title.to_lowercase().contains(&conv_filter)
                            {
                                continue;
                            }
                            let is_active = self.active_session_id.as_deref() == Some(&sess.id);
                            let bg = if is_active {
                                C_BG_ACTIVE
                            } else {
                                Color32::TRANSPARENT
                            };
                            let response = Frame::none()
                                .fill(bg)
                                .rounding(Rounding::same(9.0))
                                .inner_margin(Margin::symmetric(10.0, 8.0))
                                .show(ui, |ui| {
                                    ui.horizontal(|ui| {
                                        ui.label(
                                            RichText::new(&sess.title)
                                                .size(13.5)
                                                .color(if is_active { C_TEXT } else { C_TEXT_2 }),
                                        );
                                        ui.with_layout(
                                            Layout::right_to_left(Align::Center),
                                            |ui| {
                                                if sess.verified > 0 {
                                                    ui.label(
                                                        RichText::new("✓")
                                                            .size(12.0)
                                                            .color(C_GREEN),
                                                    )
                                                    .on_hover_text("Verified by Entry Gate");
                                                } else if is_active {
                                                    let (dot_rect, _) = ui.allocate_exact_size(
                                                        Vec2::new(8.0, 8.0),
                                                        Sense::hover(),
                                                    );
                                                    ui.painter().circle_filled(
                                                        dot_rect.center(),
                                                        4.0,
                                                        C_ACCENT,
                                                    );
                                                }
                                            },
                                        );
                                    });
                                })
                                .response
                                .interact(Sense::click());

                            if response.clicked() {
                                self.active_session_id = Some(sess.id.clone());
                                self.active_nav = NavSection::ConversationHistory;
                                self.trigger_load_session(sess.id);
                            }
                        }
                    });
            });

        // Bottom Sidebar Footer: Account Status (RFC 8628 Sign-In) & Settings
        ui.with_layout(Layout::bottom_up(Align::LEFT), |ui| {
            Frame::none()
                .inner_margin(Margin::symmetric(12.0, 10.0))
                .stroke(Stroke::new(1.0, C_LINE))
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        if ui
                            .add(
                                egui::Button::new(
                                    RichText::new("⚙  Settings").size(13.5).color(C_TEXT_2),
                                )
                                .fill(if self.active_nav == NavSection::Settings {
                                    C_BG_ACTIVE
                                } else {
                                    Color32::TRANSPARENT
                                })
                                .rounding(Rounding::same(8.0)),
                            )
                            .clicked()
                        {
                            self.active_nav = NavSection::Settings;
                        }

                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            if let Some(acc) = &self.account {
                                let dollars = (acc.credit_balance_cents as f64) / 100.0;
                                ui.label(
                                    RichText::new(format!("${:.2} · {}", dollars, acc.email))
                                        .size(11.5)
                                        .color(C_GREEN),
                                );
                            } else if let Some(pending) = &self.device_auth_pending {
                                ui.label(
                                    RichText::new(format!("Code: {}", pending.code))
                                        .size(12.0)
                                        .color(C_ACCENT)
                                        .strong(),
                                );
                            } else if ui
                                .add(
                                    egui::Button::new(
                                        RichText::new("Sign in with Entry")
                                            .size(12.0)
                                            .color(C_TEXT),
                                    )
                                    .fill(C_ACCENT)
                                    .rounding(Rounding::same(7.0)),
                                )
                                .clicked()
                            {
                                self.trigger_start_device_auth();
                            }
                        });
                    });
                });
        });
    }

    fn render_nav_button(&mut self, ui: &mut egui::Ui, label: &str, section: NavSection) {
        let is_active = self.active_nav == section;
        let btn = egui::Button::new(
            RichText::new(label)
                .size(13.5)
                .color(if is_active { C_TEXT } else { C_TEXT_2 }),
        )
        .fill(if is_active {
            C_BG_ACTIVE
        } else {
            Color32::TRANSPARENT
        })
        .rounding(Rounding::same(9.0))
        .min_size(Vec2::new(ui.available_width(), 34.0));

        if ui.add(btn).clicked() {
            self.active_nav = section;
        }
    }

    fn add_project_folder(&mut self, folder: PathBuf) {
        let worktree = folder.to_string_lossy().to_string();
        let name = folder
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "project".to_string());
        let sidecar = self.sidecar_url.clone();
        let tx = self.tx.clone();
        thread::spawn(move || {
            let _ = ureq::post(&format!("{}/project", sidecar)).send_json(serde_json::json!({
                "worktree": worktree,
                "name": name,
            }));
            // Re-sync
            if let Ok(resp) = ureq::get(&format!("{}/project", sidecar)).call() {
                if let Ok(val) = resp.into_json::<serde_json::Value>() {
                    let projects =
                        serde_json::from_value::<Vec<ProjectItem>>(val["projects"].clone())
                            .unwrap_or_default();
                    let _ = tx.send(WorkerEvent::SidecarSynced {
                        healthy: true,
                        account: None,
                        projects,
                        sessions: Vec::new(),
                        schedules: Vec::new(),
                        plugins: Vec::new(),
                    });
                }
            }
        });
    }

    // ------------------------------------------------------------------------
    // COLUMN 2: Center Conversation Thread & Composer
    // ------------------------------------------------------------------------
    fn render_center_column(&mut self, ui: &mut egui::Ui) {
        // Top Header (50px height, border-bottom 1px #2a2a2a)
        Frame::none()
            .inner_margin(Margin::symmetric(16.0, 12.0))
            .stroke(Stroke::new(1.0, C_LINE))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    if !self.show_left_sidebar {
                        if ui
                            .add(
                                egui::Button::new(RichText::new("◧").size(15.0).color(C_TEXT_2))
                                    .frame(false),
                            )
                            .on_hover_text("Show Sidebar")
                            .clicked()
                        {
                            self.show_left_sidebar = true;
                        }
                        ui.add_space(6.0);
                    }

                    let title = self
                        .sessions
                        .iter()
                        .find(|s| Some(&s.id) == self.active_session_id.as_ref())
                        .map(|s| s.title.as_str())
                        .unwrap_or("Entry Agents Collaborative System Architecture");

                    ui.label(RichText::new(title).size(14.5).color(C_TEXT).strong());

                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        if ui
                            .add(
                                egui::Button::new(RichText::new("◨").size(15.0).color(C_TEXT_2))
                                    .frame(false),
                            )
                            .on_hover_text("Toggle Right Workspace Panel")
                            .clicked()
                        {
                            self.show_right_panel = !self.show_right_panel;
                        }

                        // Mode badge in header
                        let mode_color = if self.agent_mode == "plan" {
                            C_AMBER
                        } else {
                            C_ACCENT
                        };
                        Frame::none()
                            .fill(mode_color.linear_multiply(0.18))
                            .rounding(Rounding::same(6.0))
                            .inner_margin(Margin::symmetric(8.0, 3.0))
                            .show(ui, |ui| {
                                ui.label(
                                    RichText::new(self.agent_mode.to_uppercase())
                                        .size(11.0)
                                        .color(mode_color)
                                        .strong(),
                                );
                            });
                    });
                });
            });

        // Switch Center View based on Active Navigation Section
        match self.active_nav {
            NavSection::Automations => {
                self.render_automations_view(ui);
                return;
            }
            NavSection::Customizations => {
                self.render_customizations_view(ui);
                return;
            }
            NavSection::Settings => {
                self.render_settings_view(ui);
                return;
            }
            NavSection::ConversationHistory => {}
        }

        // Scrollable Thread Body + Bottom Composer
        let available_h = ui.available_height();
        let composer_h = 136.0;

        ScrollArea::vertical()
            .id_salt("center_thread_scroll")
            .auto_shrink([false, false])
            .max_height((available_h - composer_h).max(160.0))
            .show(ui, |ui| {
                Frame::none()
                    .inner_margin(Margin::symmetric(28.0, 20.0))
                    .show(ui, |ui| {
                        if self.messages.is_empty() {
                            self.render_default_architecture_thread(ui);
                        } else {
                            for msg in self.messages.clone() {
                                self.render_message_card(ui, &msg);
                                ui.add_space(16.0);
                            }
                        }
                    });
            });

        // Bottom Composer Box (#212121, 14px radius, 1px #333333 border)
        Frame::none()
            .inner_margin(Margin::symmetric(24.0, 10.0))
            .show(ui, |ui| {
                Frame::none()
                    .fill(C_BG_RAISE)
                    .stroke(Stroke::new(1.0, C_LINE_STRONG))
                    .rounding(Rounding::same(14.0))
                    .inner_margin(Margin::symmetric(14.0, 10.0))
                    .show(ui, |ui| {
                        let resp = ui.add(
                            TextEdit::multiline(&mut self.prompt_input)
                                .hint_text(
                                    "Ask anything, @ to mention files, / for workflows (Ctrl+Enter to send)...",
                                )
                                .desired_rows(2)
                                .desired_width(f32::INFINITY)
                                .frame(false),
                        );

                        if resp.has_focus()
                            && ui.input(|i| i.key_pressed(Key::Enter) && i.modifiers.ctrl)
                        {
                            self.trigger_send_prompt();
                        }

                        ui.add_space(8.0);

                        // Composer Foot Controls
                        ui.horizontal(|ui| {
                            // 1. Live Model Picker (Strictly live from entry-agents.dev — ZERO hardcoded models!)
                            let selected_label = self
                                .selected_model_id
                                .as_ref()
                                .and_then(|id| self.models.iter().find(|m| &m.id == id))
                                .map(|m| m.name.clone())
                                .or_else(|| self.selected_model_id.clone())
                                .unwrap_or_else(|| {
                                    if self.models_loading {
                                        "Loading live models from Entry...".to_string()
                                    } else {
                                        "Select Live Entry Model".to_string()
                                    }
                                });

                            egui::ComboBox::from_id_salt("live_entry_model_picker")
                                .selected_text(
                                    RichText::new(format!("✦ {}", selected_label))
                                        .size(12.5)
                                        .color(C_TEXT_2),
                                )
                                .width(250.0)
                                .show_ui(ui, |ui| {
                                    ui.label(
                                        RichText::new(format!(
                                            "Live Catalog ({} models from entry-agents.dev)",
                                            self.models.len()
                                        ))
                                        .size(11.0)
                                        .color(C_TEXT_3),
                                    );
                                    ui.add(
                                        TextEdit::singleline(&mut self.model_search_query)
                                            .hint_text("Filter live models..."),
                                    );
                                    ui.separator();
                                    let q = self.model_search_query.to_lowercase();
                                    for model in &self.models {
                                        if !q.is_empty()
                                            && !model.name.to_lowercase().contains(&q)
                                            && !model.id.to_lowercase().contains(&q)
                                        {
                                            continue;
                                        }
                                        ui.selectable_value(
                                            &mut self.selected_model_id,
                                            Some(model.id.clone()),
                                            format!("{} ({})", model.name, model.chef),
                                        );
                                    }
                                });

                            if ui
                                .add(
                                    egui::Button::new(RichText::new("↻").size(12.5).color(C_TEXT_3))
                                        .frame(false),
                                )
                                .on_hover_text("Refresh live models from entry-agents.dev")
                                .clicked()
                            {
                                self.trigger_fetch_live_models();
                            }

                            ui.add_space(6.0);

                            // 2. OpenCode Dual Agent Mode Switcher: Build / Plan
                            let is_plan = self.agent_mode == "plan";
                            if ui
                                .add(
                                    egui::Button::new(
                                        RichText::new(if is_plan {
                                            "📐 Mode: Plan"
                                        } else {
                                            "🔨 Mode: Build"
                                        })
                                        .size(12.5)
                                        .color(if is_plan { C_AMBER } else { C_TEXT }),
                                    )
                                    .fill(C_BG_HOVER)
                                    .rounding(Rounding::same(8.0)),
                                )
                                .on_hover_text(
                                    "Toggle between Build mode (executes & verifies changes) and Plan mode (read-only + writes .entry/plan/*.md)",
                                )
                                .clicked()
                            {
                                self.agent_mode = if is_plan {
                                    "build".to_string()
                                } else {
                                    "plan".to_string()
                                };
                            }

                            // 3. Turbo Chip Toggle
                            if ui
                                .add(
                                    egui::Button::new(
                                        RichText::new("⚡ Turbo").size(12.0).color(
                                            if self.turbo_enabled {
                                                C_ACCENT
                                            } else {
                                                C_TEXT_3
                                            },
                                        ),
                                    )
                                    .fill(if self.turbo_enabled {
                                        C_ACCENT.linear_multiply(0.16)
                                    } else {
                                        Color32::TRANSPARENT
                                    })
                                    .rounding(Rounding::same(99.0)),
                                )
                                .clicked()
                            {
                                self.turbo_enabled = !self.turbo_enabled;
                            }

                            // 4. Right-aligned Send / Stop Button
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                if self.turn_in_progress {
                                    if ui
                                        .add(
                                            egui::Button::new(
                                                RichText::new("■ Stop").size(12.5).color(C_TEXT),
                                            )
                                            .fill(Color32::from_rgb(0xd7, 0x3a, 0x49))
                                            .rounding(Rounding::same(99.0)),
                                        )
                                        .clicked()
                                    {
                                        self.trigger_abort_turn();
                                    }
                                } else if ui
                                    .add(
                                        egui::Button::new(
                                            RichText::new("↑ Send").size(12.5).color(C_BG),
                                        )
                                        .fill(C_TEXT)
                                        .rounding(Rounding::same(99.0)),
                                    )
                                    .clicked()
                                {
                                    self.trigger_send_prompt();
                                }
                            });
                        });
                    });
            });
    }

    fn render_default_architecture_thread(&mut self, ui: &mut egui::Ui) {
        // Sticky User Prompt Card matching user's prototype
        Frame::none()
            .fill(C_BG_RAISE)
            .stroke(Stroke::new(1.0, C_LINE))
            .rounding(Rounding::same(12.0))
            .inner_margin(Margin::symmetric(16.0, 12.0))
            .show(ui, |ui| {
                ui.label(
                    RichText::new(
                        "Build Entry Desktop V1 around the Five Core Promises and OpenCode's exact architecture: OAuth 2.0 Device Flow against entry-agents.dev, live models with zero hardcoded demo models, dual Build/Plan agent modes, local SQLite WAL persistence, and a fast native 3-column dark UI.",
                    )
                    .size(14.0)
                    .color(C_TEXT),
                );
            });

        ui.add_space(18.0);

        ui.label(
            RichText::new("Entry Desktop V1 — Five Core Promises & OpenCode Parity")
                .size(19.0)
                .color(C_TEXT)
                .strong(),
        );
        ui.add_space(8.0);
        ui.label(
            RichText::new(
                "The most capable AI development environment shouldn't be the one that consumes the most tokens, runs the most agents, or has the most features. It should be the one that gets the most verified work done with the least time, money, and human intervention.",
            )
            .size(14.2)
            .color(C_TEXT_2),
        );

        ui.add_space(14.0);
        let promises = [
            (
                "1. Spend less",
                "Get more useful work from every dollar with prompt cache tracking, minimal-token exploration, and live credit balance visibility.",
            ),
            (
                "2. Move faster",
                "Pure native GPU-rendered Rust GUI (entry-desktop.exe) + compiled Entry Agent Sidecar (entry-agent-sidecar.exe) — zero Electron or WebView bloat.",
            ),
            (
                "3. Trust the results",
                "Agents must prove their work. Build mode automatically runs the Verification Gate (cargo check / tsc --noEmit / git diff) and publishes proof to the Right Workspace Column.",
            ),
            (
                "4. Stay in control",
                "Users own their models, projects, execution, and data. Plan mode enforces read-only exploration and writes blueprints to .entry/plan/*.md.",
            ),
            (
                "5. Extend everything",
                "OpenCode-compatible plugin hooks (entry-verification-gate, entry-token-efficiency, entry-plan-architect) make Entry capable of growing beyond its original developers.",
            ),
        ];

        for (title, body) in promises {
            Frame::none()
                .fill(C_BG_PANEL)
                .stroke(Stroke::new(1.0, C_LINE))
                .rounding(Rounding::same(10.0))
                .inner_margin(Margin::symmetric(14.0, 10.0))
                .show(ui, |ui| {
                    ui.label(RichText::new(title).size(14.0).color(C_TEXT).strong());
                    ui.add_space(3.0);
                    ui.label(RichText::new(body).size(13.2).color(C_TEXT_2));
                });
            ui.add_space(8.0);
        }
    }

    fn render_message_card(&self, ui: &mut egui::Ui, msg: &MessageItem) {
        let is_user = msg.role == "user";
        let parsed: serde_json::Value =
            serde_json::from_str(&msg.data).unwrap_or(serde_json::Value::Null);
        let text = parsed["text"].as_str().unwrap_or(&msg.data);
        let verified = parsed["verified"].as_bool().unwrap_or(false);
        let verification_summary = parsed["verificationSummary"].as_str();

        if is_user {
            Frame::none()
                .fill(C_BG_RAISE)
                .stroke(Stroke::new(1.0, C_LINE))
                .rounding(Rounding::same(12.0))
                .inner_margin(Margin::symmetric(16.0, 12.0))
                .show(ui, |ui| {
                    ui.label(RichText::new(text).size(14.2).color(C_TEXT));
                });
        } else {
            Frame::none()
                .inner_margin(Margin::symmetric(4.0, 6.0))
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.label(
                            RichText::new(format!("Entry Agent ({})", msg.agent.to_uppercase()))
                                .size(12.0)
                                .color(C_ACCENT)
                                .strong(),
                        );
                        if let Some(mid) = &msg.model_id {
                            ui.label(
                                RichText::new(mid)
                                    .size(11.5)
                                    .color(C_TEXT_3)
                                    .family(FontFamily::Monospace),
                            );
                        }
                        if verified {
                            ui.label(
                                RichText::new("✓ Verified")
                                    .size(11.5)
                                    .color(C_GREEN)
                                    .strong(),
                            );
                        }
                    });
                    ui.add_space(6.0);
                    self.render_markdown_text(ui, text);
                    if let Some(vsum) = verification_summary {
                        ui.add_space(6.0);
                        Frame::none()
                            .fill(C_GREEN.linear_multiply(0.12))
                            .stroke(Stroke::new(1.0, C_GREEN.linear_multiply(0.4)))
                            .rounding(Rounding::same(8.0))
                            .inner_margin(Margin::symmetric(10.0, 6.0))
                            .show(ui, |ui| {
                                ui.label(RichText::new(vsum).size(12.0).color(C_GREEN));
                            });
                    }
                });
        }
    }

    // ------------------------------------------------------------------------
    // COLUMN 3: Right Workspace Panel (560px or Expanded Full-Width)
    // ------------------------------------------------------------------------
    fn render_right_workspace_panel(&mut self, ui: &mut egui::Ui) {
        // Tab Bar (50px height, border-bottom 1px #2a2a2a)
        Frame::none()
            .inner_margin(Margin::symmetric(12.0, 8.0))
            .stroke(Stroke::new(1.0, C_LINE))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    for (idx, tab) in self.workspace_tabs.iter().enumerate() {
                        let is_active = idx == self.active_tab_index;
                        let btn = egui::Button::new(
                            RichText::new(&tab.title)
                                .size(12.5)
                                .color(if is_active { C_TEXT } else { C_TEXT_2 }),
                        )
                        .fill(if is_active { C_BG_ACTIVE } else { C_BG_RAISE })
                        .rounding(Rounding::same(9.0));

                        if ui.add(btn).clicked() {
                            self.active_tab_index = idx;
                        }
                    }

                    if ui
                        .add(
                            egui::Button::new(RichText::new("＋").size(14.0).color(C_TEXT_2))
                                .frame(false),
                        )
                        .on_hover_text("New Plan / Artifact Tab")
                        .clicked()
                    {
                        let n = self.workspace_tabs.len() + 1;
                        self.workspace_tabs.push(WorkspaceTab {
                            id: format!("tab_{}", n),
                            title: format!("Scratchpad {}.md", n),
                            kind: "markdown".to_string(),
                            file_path: None,
                            content: "# Workspace Scratchpad\n\nWrite notes or inspect plans here."
                                .to_string(),
                        });
                        self.active_tab_index = self.workspace_tabs.len() - 1;
                    }

                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        if ui
                            .add(
                                egui::Button::new(RichText::new("✕").size(13.5).color(C_TEXT_2))
                                    .frame(false),
                            )
                            .on_hover_text("Hide Right Panel")
                            .clicked()
                        {
                            self.show_right_panel = false;
                            self.expand_right_panel_full = false;
                        }

                        if ui
                            .add(
                                egui::Button::new(
                                    RichText::new(if self.expand_right_panel_full {
                                        "🗗"
                                    } else {
                                        "⛶"
                                    })
                                    .size(14.0)
                                    .color(C_TEXT_2),
                                )
                                .frame(false),
                            )
                            .on_hover_text("Toggle Full-Width Workspace View")
                            .clicked()
                        {
                            self.expand_right_panel_full = !self.expand_right_panel_full;
                        }
                    });
                });
            });

        // Tab Body
        ScrollArea::vertical()
            .id_salt("right_workspace_scroll")
            .auto_shrink([false, false])
            .show(ui, |ui| {
                Frame::none()
                    .inner_margin(Margin::symmetric(24.0, 20.0))
                    .show(ui, |ui| {
                        let Some(active_tab) = self.workspace_tabs.get(self.active_tab_index).cloned() else {
                            return;
                        };

                        if active_tab.kind == "architecture" {
                            self.render_architecture_diagram_card(ui);
                            ui.add_space(16.0);
                        } else if active_tab.kind == "diff" {
                            ui.label(
                                RichText::new("Live Git Workspace Diff")
                                    .size(16.0)
                                    .color(C_TEXT)
                                    .strong(),
                            );
                            ui.add_space(8.0);
                            let diff_text = if self.latest_diff.is_empty() {
                                "Working tree clean — no uncommitted changes detected."
                            } else {
                                &self.latest_diff
                            };
                            Frame::none()
                                .fill(C_CODE_BG)
                                .stroke(Stroke::new(1.0, C_LINE))
                                .rounding(Rounding::same(10.0))
                                .inner_margin(Margin::symmetric(14.0, 12.0))
                                .show(ui, |ui| {
                                    ui.label(
                                        RichText::new(diff_text)
                                            .size(12.5)
                                            .family(FontFamily::Monospace)
                                            .color(C_TEXT_2),
                                    );
                                });
                            return;
                        }

                        if !active_tab.content.is_empty() {
                            self.render_markdown_text(ui, &active_tab.content);
                        }
                    });
            });
    }

    fn render_architecture_diagram_card(&self, ui: &mut egui::Ui) {
        ui.label(
            RichText::new("Entry Desktop V1 — Multi-Layer Architecture Diagram")
                .size(18.0)
                .color(C_TEXT)
                .strong(),
        );
        ui.add_space(6.0);
        ui.label(
            RichText::new(
                "Engineered after OpenCode's exact patterns (RFC 8628 Device Auth, SQLite WAL, Dual Build/Plan Modes, Wildcard Permissions, and Live Entry Models).",
            )
            .size(13.5)
            .color(C_TEXT_2),
        );
        ui.add_space(14.0);

        let layers = [
            (
                "L1 — Native 3-Column Rust GUI (entry-desktop.exe)",
                "Pure GPU-rendered eframe/egui interface · Zero Electron · Zero WebView · Instant startup",
                vec![
                    "Col 1: Projects & Conversations",
                    "Col 2: Thread & Live Model Picker",
                    "Col 3: Artifacts, Plans & Diffs",
                ],
            ),
            (
                "L2 — Entry Agent Sidecar Runtime (entry-agent-sidecar.exe)",
                "Local HTTP + SSE Event Bus · SQLite WAL Database (~/.entry/desktop/entry-desktop.sqlite)",
                vec![
                    "account / credential",
                    "project / session_v2",
                    "session_message / session_part",
                    "artifact / schedule",
                ],
            ),
            (
                "L3 — OpenCode Agent & Permission Engine (@entry-agents/agent + LocalSandbox)",
                "Dual Build & Plan Modes · Wildcard Permission Evaluator · Automated Verification Gate",
                vec![
                    "Build Mode (Read/Write + Verify)",
                    "Plan Mode (.entry/plan/*.md)",
                    "Explore & General Subagents",
                ],
            ),
            (
                "L4 — Unified Entry Cloud Gateway (https://entry-agents.dev)",
                "OAuth 2.0 Device Flow (/desktop/approve) · Live Model Catalog (/api/desktop/models) · SSE Proxy (/v1/chat/completions)",
                vec![
                    "POST /api/desktop/device/code",
                    "POST /api/desktop/device/token",
                    "GET /api/desktop/models",
                    "POST /v1/chat/completions",
                ],
            ),
        ];

        for (idx, (title, subtitle, chips)) in layers.iter().enumerate() {
            Frame::none()
                .fill(C_BG_RAISE)
                .stroke(Stroke::new(1.0, C_LINE_STRONG))
                .rounding(Rounding::same(10.0))
                .inner_margin(Margin::symmetric(14.0, 12.0))
                .show(ui, |ui| {
                    ui.label(RichText::new(*title).size(13.5).color(C_TEXT).strong());
                    ui.add_space(2.0);
                    ui.label(RichText::new(*subtitle).size(12.0).color(C_TEXT_3));
                    ui.add_space(8.0);
                    ui.horizontal_wrapped(|ui| {
                        for chip in chips {
                            Frame::none()
                                .fill(C_CODE_BG)
                                .stroke(Stroke::new(1.0, C_LINE))
                                .rounding(Rounding::same(6.0))
                                .inner_margin(Margin::symmetric(8.0, 4.0))
                                .show(ui, |ui| {
                                    ui.label(
                                        RichText::new(*chip)
                                            .size(11.5)
                                            .family(FontFamily::Monospace)
                                            .color(C_TEXT_2),
                                    );
                                });
                        }
                    });
                });

            if idx + 1 < layers.len() {
                ui.vertical_centered(|ui| {
                    ui.label(RichText::new("↓").size(15.0).color(C_TEXT_3));
                });
            }
        }
    }

    fn render_markdown_text(&self, ui: &mut egui::Ui, markdown: &str) {
        let mut in_code_block = false;
        let mut code_buffer = String::new();

        for line in markdown.lines() {
            if line.trim_start().starts_with("```") {
                if in_code_block {
                    Frame::none()
                        .fill(C_CODE_BG)
                        .stroke(Stroke::new(1.0, C_LINE))
                        .rounding(Rounding::same(8.0))
                        .inner_margin(Margin::symmetric(12.0, 10.0))
                        .show(ui, |ui| {
                            ui.label(
                                RichText::new(code_buffer.trim_end())
                                    .size(12.5)
                                    .family(FontFamily::Monospace)
                                    .color(C_TEXT),
                            );
                        });
                    code_buffer.clear();
                    in_code_block = false;
                    ui.add_space(6.0);
                } else {
                    in_code_block = true;
                }
                continue;
            }

            if in_code_block {
                code_buffer.push_str(line);
                code_buffer.push('\n');
                continue;
            }

            if let Some(h1) = line.strip_prefix("# ") {
                ui.add_space(6.0);
                ui.label(RichText::new(h1).size(18.5).color(C_TEXT).strong());
                ui.add_space(4.0);
            } else if let Some(h2) = line.strip_prefix("## ") {
                ui.add_space(6.0);
                ui.label(RichText::new(h2).size(15.5).color(C_TEXT).strong());
                ui.add_space(3.0);
            } else if let Some(h3) = line.strip_prefix("### ") {
                ui.add_space(4.0);
                ui.label(RichText::new(h3).size(14.0).color(C_TEXT).strong());
                ui.add_space(2.0);
            } else if let Some(bullet) = line.strip_prefix("- ") {
                ui.horizontal_wrapped(|ui| {
                    ui.label(RichText::new("•").size(14.0).color(C_ACCENT));
                    ui.label(RichText::new(bullet).size(13.8).color(C_TEXT_2));
                });
            } else if line.trim().is_empty() {
                ui.add_space(6.0);
            } else {
                ui.label(RichText::new(line).size(13.8).color(C_TEXT_2));
            }
        }
    }

    // ------------------------------------------------------------------------
    // Automations, Customizations (Plugins), and Settings Views
    // ------------------------------------------------------------------------
    fn render_automations_view(&mut self, ui: &mut egui::Ui) {
        Frame::none()
            .inner_margin(Margin::symmetric(28.0, 22.0))
            .show(ui, |ui| {
                ui.label(
                    RichText::new("Automations & Scheduled Agents")
                        .size(19.0)
                        .color(C_TEXT)
                        .strong(),
                );
                ui.add_space(4.0);
                ui.label(
                    RichText::new(
                        "Schedule recurring verified Build or Plan tasks stored in local SQLite (`schedule` table).",
                    )
                    .size(13.5)
                    .color(C_TEXT_2),
                );
                ui.add_space(14.0);

                Frame::none()
                    .fill(C_BG_RAISE)
                    .stroke(Stroke::new(1.0, C_LINE))
                    .rounding(Rounding::same(10.0))
                    .inner_margin(Margin::symmetric(14.0, 12.0))
                    .show(ui, |ui| {
                        ui.label(RichText::new("Create Automation").size(14.0).strong());
                        ui.add_space(6.0);
                        ui.horizontal(|ui| {
                            ui.label("Name:");
                            ui.add(
                                TextEdit::singleline(&mut self.new_sched_name)
                                    .hint_text("Nightly Verification & Audit"),
                            );
                            ui.label("Cron:");
                            ui.add(
                                TextEdit::singleline(&mut self.new_sched_cron)
                                    .desired_width(120.0),
                            );
                        });
                        ui.add_space(6.0);
                        ui.add(
                            TextEdit::singleline(&mut self.new_sched_prompt)
                                .hint_text("Prompt to execute...")
                                .desired_width(f32::INFINITY),
                        );
                        ui.add_space(8.0);
                        if ui
                            .add(
                                egui::Button::new(
                                    RichText::new("＋ Save Automation").color(C_TEXT),
                                )
                                .fill(C_ACCENT)
                                .rounding(Rounding::same(8.0)),
                            )
                            .clicked()
                            && !self.new_sched_name.is_empty()
                            && !self.new_sched_prompt.is_empty()
                        {
                            let sidecar = self.sidecar_url.clone();
                            let name = self.new_sched_name.clone();
                            let cron = self.new_sched_cron.clone();
                            let prompt = self.new_sched_prompt.clone();
                            self.new_sched_name.clear();
                            self.new_sched_prompt.clear();
                            thread::spawn(move || {
                                let _ = ureq::post(&format!("{}/schedule", sidecar)).send_json(
                                    serde_json::json!({
                                        "name": name,
                                        "cron": cron,
                                        "prompt": prompt,
                                        "agent": "build"
                                    }),
                                );
                            });
                            self.trigger_initial_sync();
                        }
                    });

                ui.add_space(14.0);
                for sched in &self.schedules {
                    Frame::none()
                        .fill(C_BG_PANEL)
                        .stroke(Stroke::new(1.0, C_LINE))
                        .rounding(Rounding::same(9.0))
                        .inner_margin(Margin::symmetric(14.0, 10.0))
                        .show(ui, |ui| {
                            ui.horizontal(|ui| {
                                ui.label(RichText::new(&sched.name).size(14.0).strong());
                                ui.label(
                                    RichText::new(&sched.cron)
                                        .size(12.0)
                                        .color(C_ACCENT)
                                        .family(FontFamily::Monospace),
                                );
                            });
                            ui.label(RichText::new(&sched.prompt).size(13.0).color(C_TEXT_2));
                        });
                    ui.add_space(8.0);
                }
            });
    }

    fn render_customizations_view(&mut self, ui: &mut egui::Ui) {
        Frame::none()
            .inner_margin(Margin::symmetric(28.0, 22.0))
            .show(ui, |ui| {
                ui.label(
                    RichText::new("Customizations & OpenCode Plugin Hooks")
                        .size(19.0)
                        .color(C_TEXT)
                        .strong(),
                );
                ui.add_space(4.0);
                ui.label(
                    RichText::new(
                        "Promise #5: Extend everything — Plugins make Entry capable of growing beyond its original developers.",
                    )
                    .size(13.5)
                    .color(C_TEXT_2),
                );
                ui.add_space(14.0);

                for plugin in &self.plugins {
                    Frame::none()
                        .fill(C_BG_RAISE)
                        .stroke(Stroke::new(1.0, C_LINE))
                        .rounding(Rounding::same(10.0))
                        .inner_margin(Margin::symmetric(14.0, 10.0))
                        .show(ui, |ui| {
                            ui.horizontal(|ui| {
                                ui.label(RichText::new(&plugin.name).size(14.0).strong());
                                ui.label(
                                    RichText::new(format!("v{}", plugin.version))
                                        .size(11.5)
                                        .color(C_TEXT_3),
                                );
                                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                    ui.label(
                                        RichText::new(if plugin.enabled {
                                            "● Active"
                                        } else {
                                            "○ Disabled"
                                        })
                                        .size(12.0)
                                        .color(if plugin.enabled { C_GREEN } else { C_TEXT_3 }),
                                    );
                                });
                            });
                            ui.add_space(4.0);
                            ui.label(
                                RichText::new(&plugin.description)
                                    .size(13.0)
                                    .color(C_TEXT_2),
                            );
                        });
                    ui.add_space(8.0);
                }
            });
    }

    fn render_settings_view(&mut self, ui: &mut egui::Ui) {
        Frame::none()
            .inner_margin(Margin::symmetric(28.0, 22.0))
            .show(ui, |ui| {
                ui.label(
                    RichText::new("Entry Desktop Settings & Account Authentication")
                        .size(19.0)
                        .color(C_TEXT)
                        .strong(),
                );
                ui.add_space(12.0);

                Frame::none()
                    .fill(C_BG_RAISE)
                    .stroke(Stroke::new(1.0, C_LINE))
                    .rounding(Rounding::same(10.0))
                    .inner_margin(Margin::symmetric(16.0, 14.0))
                    .show(ui, |ui| {
                        ui.label(
                            RichText::new("OAuth 2.0 Device Flow (https://entry-agents.dev)")
                                .size(14.5)
                                .strong(),
                        );
                        ui.add_space(6.0);

                        if let Some(acc) = &self.account {
                            ui.label(
                                RichText::new(format!(
                                    "Signed in as: {} (Plan: {:?}, Balance: ${:.2})",
                                    acc.email,
                                    acc.plan_name,
                                    (acc.credit_balance_cents as f64) / 100.0
                                ))
                                .color(C_GREEN),
                            );
                        } else {
                            ui.label(
                                RichText::new(
                                    "Not signed in. Click 'Sign in with Entry (Browser Device Flow)' to authenticate via https://entry-agents.dev/desktop/approve.",
                                )
                                .color(C_TEXT_2),
                            );
                        }

                        if !self.auth_status_text.is_empty() {
                            ui.add_space(4.0);
                            ui.label(RichText::new(&self.auth_status_text).color(C_ACCENT));
                        }

                        ui.add_space(8.0);
                        ui.horizontal(|ui| {
                            if ui
                                .add(
                                    egui::Button::new(
                                        RichText::new("Sign in with Entry (Browser Device Flow)")
                                            .color(C_TEXT),
                                    )
                                    .fill(C_ACCENT)
                                    .rounding(Rounding::same(8.0)),
                                )
                                .clicked()
                            {
                                self.trigger_start_device_auth();
                            }

                            if self.account.is_some()
                                && ui
                                    .add(
                                        egui::Button::new(
                                            RichText::new("Sign Out").color(C_TEXT_2),
                                        )
                                        .fill(C_BG_HOVER)
                                        .rounding(Rounding::same(8.0)),
                                    )
                                    .clicked()
                            {
                                let sidecar = self.sidecar_url.clone();
                                self.account = None;
                                thread::spawn(move || {
                                    let _ = ureq::post(&format!("{}/auth/logout", sidecar))
                                        .send_json(serde_json::json!({}));
                                });
                            }
                        });

                        ui.add_space(12.0);
                        ui.label(
                            RichText::new("Or paste an Entry session token directly:")
                                .size(12.5)
                                .color(C_TEXT_3),
                        );
                        ui.horizontal(|ui| {
                            ui.add(
                                TextEdit::singleline(&mut self.manual_token_input)
                                    .password(true)
                                    .hint_text("Paste Better Auth session token...")
                                    .desired_width(280.0),
                            );
                            if ui.button("Save Token").clicked()
                                && !self.manual_token_input.trim().is_empty()
                            {
                                let tok = self.manual_token_input.trim().to_string();
                                self.manual_token_input.clear();
                                let sidecar = self.sidecar_url.clone();
                                thread::spawn(move || {
                                    let _ = ureq::post(&format!("{}/auth/token", sidecar))
                                        .send_json(serde_json::json!({ "token": tok }));
                                });
                                self.trigger_initial_sync();
                                self.trigger_fetch_live_models();
                            }
                        });
                    });

                ui.add_space(14.0);
                Frame::none()
                    .fill(C_BG_PANEL)
                    .stroke(Stroke::new(1.0, C_LINE))
                    .rounding(Rounding::same(10.0))
                    .inner_margin(Margin::symmetric(16.0, 12.0))
                    .show(ui, |ui| {
                        ui.label(RichText::new("Runtime Diagnostics").size(14.0).strong());
                        ui.add_space(4.0);
                        ui.label(format!("Sidecar Endpoint: {}", self.sidecar_url));
                        ui.label(format!(
                            "Sidecar Health: {}",
                            if self.sidecar_healthy {
                                "Healthy (Connected)"
                            } else {
                                "Standalone Direct Cloud Mode"
                            }
                        ));
                        ui.label(format!("Entry Cloud Domain: {}", self.entry_cloud_url));
                        ui.label(format!(
                            "Live Model Catalog Source: {} ({} live models loaded)",
                            self.models_source_url,
                            self.models.len()
                        ));
                    });
            });
    }
}

impl Drop for EntryDesktopApp {
    fn drop(&mut self) {
        if let Some(mut child) = self.sidecar_process.take() {
            let _ = child.kill();
        }
    }
}

fn main() -> eframe::Result<()> {
    let native_options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("Entry Desktop")
            .with_inner_size([1440.0, 900.0])
            .with_min_inner_size([960.0, 620.0]),
        ..Default::default()
    };

    eframe::run_native(
        "Entry Desktop",
        native_options,
        Box::new(|cc| Ok(Box::new(EntryDesktopApp::new(cc)))),
    )
}
