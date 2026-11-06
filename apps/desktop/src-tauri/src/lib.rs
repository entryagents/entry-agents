#[tauri::command]
fn get_system_info() -> serde_json::Value {
    serde_json::json!({
        "version": "1.0.0-beta.1",
        "channel": "beta",
        "runtime": "tauri-2"
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_system_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
