#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_notification::init());

    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_fcm::init());

    builder
        .append_invoke_initialization_script(include_str!("../scripts/notifications.js"))
        .run(tauri::generate_context!())
        .expect("error while running CUIT Hub");
}
