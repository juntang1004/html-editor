#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
        mpsc,
    },
    time::Duration,
};
use tauri::{Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

struct DesktopState {
    backend: Mutex<Child>,
    port: u16,
    token: String,
    paths: Mutex<HashMap<String, PathBuf>>,
    pending_open: Mutex<Option<PathBuf>>,
}
impl Drop for DesktopState {
    fn drop(&mut self) {
        if let Ok(child) = self.backend.get_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
struct ChildGuard(Option<Child>);
impl Drop for ChildGuard {
    fn drop(&mut self) {
        if let Some(child) = self.0.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
static SAVE_ID: AtomicU64 = AtomicU64::new(0);
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid save location")?;
    let mut created = None;
    for _ in 0..100 {
        let id = SAVE_ID.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(".slide-studio-{}-{id}.saving", std::process::id()));
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => {
                created = Some((candidate, file));
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    let (temporary, mut file) = created.ok_or("Could not create a temporary save file")?;
    let result = file.write_all(bytes).and_then(|_| file.sync_all());
    drop(file);
    let result = result.and_then(|_| fs::rename(&temporary, path));
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(|e| format!("파일 저장 실패: {e}"))
}
#[derive(Serialize)]
struct ApiResponse {
    status: u16,
    body: String,
}
#[derive(Serialize)]
struct OpenedDocument {
    name: String,
    text: String,
    path: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveOptions {
    name: String,
    text: String,
    #[serde(default)]
    save_as: bool,
    #[serde(default)]
    r#type: String,
}

fn trusted(window: &WebviewWindow) -> Result<(), String> {
    let url = window.url().map_err(|e| e.to_string())?;
    if window.label() != "main" || !editor_url(&url) {
        return Err("Native commands are restricted to the editor window.".into());
    }
    Ok(())
}
fn editor_url(url: &tauri::Url) -> bool {
    ((matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost"))
        || (url.scheme() == "tauri" && url.host_str() == Some("localhost")))
        && url.port().is_none()
        && matches!(url.path(), "/" | "/index.html")
        && url.username().is_empty()
        && url.password().is_none()
}

#[tauri::command]
async fn api_request(
    window: WebviewWindow,
    state: State<'_, DesktopState>,
    path: String,
    method: String,
    body: String,
) -> Result<ApiResponse, String> {
    trusted(&window)?;
    if !matches!(
        (method.as_str(), path.as_str()),
        ("GET", "/api/session") | ("POST", "/api/action") | ("POST", "/api/design")
    ) {
        return Err("Unsupported API route".into());
    }
    if body.len() > 1_200_000 {
        return Err("Request exceeds size limit".into());
    }
    let base = format!("http://127.0.0.1:{}", state.port);
    let token = state.token.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(200))
            .build()
            .map_err(|e| e.to_string())?;
        let response = client
            .request(
                if method == "GET" {
                    reqwest::Method::GET
                } else {
                    reqwest::Method::POST
                },
                format!("{base}{path}"),
            )
            .header("Origin", &base)
            .header("X-Studio-Token", token)
            .header("Content-Type", "application/json")
            .body(body)
            .send()
            .map_err(|e| e.to_string())?;
        Ok(ApiResponse {
            status: response.status().as_u16(),
            body: response.text().map_err(|e| e.to_string())?,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn open_document(
    window: WebviewWindow,
    state: State<'_, DesktopState>,
) -> Result<Option<OpenedDocument>, String> {
    trusted(&window)?;
    let Some(file) = rfd::AsyncFileDialog::new()
        .add_filter("HTML / Slide Studio", &["html", "htm", "json"])
        .pick_file()
        .await
    else {
        return Ok(None);
    };
    let path = file.path().to_path_buf();
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 30 * 1024 * 1024 {
        return Err("30MB 이하의 문서를 선택하세요.".into());
    }
    let text = fs::read_to_string(&path).map_err(|e| format!("파일을 읽지 못했습니다: {e}"))?;
    *state.pending_open.lock().map_err(|e| e.to_string())? = Some(path.clone());
    Ok(Some(OpenedDocument {
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
        text,
        path: path.to_string_lossy().into(),
    }))
}

#[tauri::command]
fn reset_document_paths(
    window: WebviewWindow,
    state: State<'_, DesktopState>,
) -> Result<(), String> {
    trusted(&window)?;
    state.paths.lock().map_err(|e| e.to_string())?.clear();
    *state.pending_open.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

#[tauri::command]
fn accept_document(
    window: WebviewWindow,
    state: State<'_, DesktopState>,
    path: String,
) -> Result<(), String> {
    trusted(&window)?;
    let selected = state.pending_open.lock().map_err(|e| e.to_string())?.take();
    let selected = selected
        .filter(|selected| selected.to_string_lossy() == path)
        .ok_or("Document was not selected in the Open dialog")?;
    let kind = if selected.extension().is_some_and(|x| x == "json") {
        "json"
    } else {
        "html"
    };
    let mut paths = state.paths.lock().map_err(|e| e.to_string())?;
    paths.clear();
    paths.insert(kind.into(), selected);
    Ok(())
}

#[tauri::command]
async fn save_document(
    window: WebviewWindow,
    state: State<'_, DesktopState>,
    options: SaveOptions,
) -> Result<bool, String> {
    trusted(&window)?;
    if options.text.len() > 100 * 1024 * 1024 {
        return Err("문서가 저장 크기 제한을 초과했습니다.".into());
    }
    let kind = if options.name.ends_with(".json") || options.r#type.contains("json") {
        "json"
    } else {
        "html"
    };
    let previous = state
        .paths
        .lock()
        .map_err(|e| e.to_string())?
        .get(kind)
        .cloned();
    let path = if !options.save_as && previous.is_some() {
        previous.unwrap()
    } else {
        let safe_name = PathBuf::from(&options.name)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let Some(file) = rfd::AsyncFileDialog::new()
            .set_file_name(safe_name)
            .add_filter(
                if kind == "json" {
                    "Slide Studio"
                } else {
                    "HTML"
                },
                &[kind],
            )
            .save_file()
            .await
        else {
            return Ok(false);
        };
        file.path().to_path_buf()
    };
    atomic_write(&path, options.text.as_bytes())?;
    state
        .paths
        .lock()
        .map_err(|e| e.to_string())?
        .insert(kind.into(), path);
    Ok(true)
}

#[tauri::command]
async fn print_document(
    window: WebviewWindow,
    app: tauri::AppHandle,
    html: String,
) -> Result<bool, String> {
    trusted(&window)?;
    if html.is_empty() {
        window.print().map_err(|e| e.to_string())?;
        return Ok(true);
    }
    if html.len() > 100 * 1024 * 1024 {
        return Err("인쇄 문서가 너무 큽니다.".into());
    }
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let id = SAVE_ID.fetch_add(1, Ordering::Relaxed);
    let label = format!("print-preview-{id}");
    let file = dir.join(format!("print-preview-{}-{id}.html", std::process::id()));
    fs::write(&file, html).map_err(|e| e.to_string())?;
    let url = tauri::Url::from_file_path(&file).map_err(|_| "Invalid print path")?;
    let preview = WebviewWindowBuilder::new(&app,&label,WebviewUrl::External(url))
        .title("인쇄 · PDF로 저장 — HTML Slide Studio").inner_size(1100.0,800.0)
        .on_page_load(|webview,payload| {if matches!(payload.event(),tauri::webview::PageLoadEvent::Finished) {let _=webview.eval("Promise.race([Promise.all([document.fonts.ready,...Array.from(document.images,x=>x.decode().catch(()=>{}))]),new Promise(r=>setTimeout(r,5000))]).then(()=>window.print())");}})
        .build().map_err(|e|e.to_string())?;
    preview.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            let _ = fs::remove_file(&file);
        }
    });
    Ok(true)
}

fn start_backend(app: &tauri::App) -> Result<DesktopState, Box<dyn std::error::Error>> {
    // Tauri canonical paths use Windows' verbatim prefix. Node's entry-module
    // resolution rejects that prefix, so use the ordinary equivalent when safe.
    let resource_path = app.path().resource_dir()?;
    let resources = dunce::simplified(&resource_path);
    let root = resources.join("resources");
    let config = app.path().app_config_dir()?;
    fs::create_dir_all(&config)?;
    let mut command = Command::new(root.join("runtime/node.exe"));
    command
        .arg(root.join("app/desktop-server.mjs"))
        .current_dir(root.join("app"))
        .env("STUDIO_CONFIG_DIR", config)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let mut guard = ChildGuard(Some(command.spawn()?));
    let stdout = guard
        .0
        .as_mut()
        .unwrap()
        .stdout
        .take()
        .ok_or("Missing backend stdout")?;
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(port) = line.strip_prefix("STUDIO_PORT=") {
                let _ = tx.send(port.parse::<u16>());
                break;
            }
        }
    });
    let port = match rx.recv_timeout(Duration::from_secs(20)) {
        Ok(Ok(port)) => port,
        _ => return Err("The local editor backend could not start.".into()),
    };
    let session: serde_json::Value = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()?
        .get(format!("http://127.0.0.1:{port}/api/session"))
        .send()?
        .json()?;
    let token = session["token"]
        .as_str()
        .ok_or("Missing session token")?
        .to_owned();
    Ok(DesktopState {
        backend: Mutex::new(guard.0.take().unwrap()),
        port,
        token,
        paths: Mutex::new(HashMap::new()),
        pending_open: Mutex::new(None),
    })
}

fn main() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let backend = start_backend(app).map_err(|error| {
                rfd::MessageDialog::new()
                    .set_title("HTML Slide Studio 시작 오류")
                    .set_description(format!(
                        "실행 파일 옆에 resources 폴더가 있는지 확인하세요.\n\n{error}"
                    ))
                    .set_level(rfd::MessageLevel::Error)
                    .show();
                error
            })?;
            app.manage(backend);
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("HTML Slide Studio")
                .inner_size(1440.0, 960.0)
                .min_inner_size(960.0, 640.0)
                .on_navigation(editor_url)
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            api_request,
            open_document,
            save_document,
            print_document,
            reset_document_paths,
            accept_document
        ])
        .build(tauri::generate_context!())
        .expect("Unable to initialize HTML Slide Studio");
    app.run(|handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            if let Some(state) = handle.try_state::<DesktopState>() {
                if let Ok(mut child) = state.backend.lock() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_packaged_editor_navigation_is_allowed() {
        for url in [
            "http://tauri.localhost/",
            "http://tauri.localhost/index.html",
            "tauri://localhost/index.html",
        ] {
            assert!(editor_url(&url.parse().unwrap()));
        }
        for url in [
            "https://example.com/",
            "http://localhost/",
            "http://tauri.localhost:1234/",
            "http://tauri.localhost/evil.html",
            "file:///C:/test.html",
            "data:text/html,test",
        ] {
            assert!(!editor_url(&url.parse().unwrap()));
        }
    }
    #[test]
    fn atomic_save_preserves_neighbor_and_replaces_only_target() {
        let dir =
            std::env::temp_dir().join(format!("slide-studio-save-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join("test.html");
        let neighbor = dir.join("test.html.studio-saving");
        fs::write(&target, b"old").unwrap();
        fs::write(&neighbor, b"neighbor").unwrap();
        atomic_write(&target, b"new").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"new");
        assert_eq!(fs::read(&neighbor).unwrap(), b"neighbor");
        fs::remove_file(target).unwrap();
        fs::remove_file(neighbor).unwrap();
        fs::remove_dir(dir).unwrap();
    }
}
