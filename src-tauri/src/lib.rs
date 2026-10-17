mod workspace;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(workspace::Workspace::default())
        .invoke_handler(tauri::generate_handler![
            workspace::choose_project,
            workspace::list_directory,
            workspace::read_document,
            workspace::save_document,
            workspace::check_documents,
            workspace::close_document,
            workspace::read_markdown_image,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Diffora");
}
