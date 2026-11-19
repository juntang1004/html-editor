fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "api_request",
            "open_document",
            "save_document",
            "print_document",
            "reset_document_paths",
            "accept_document",
        ]),
    ))
    .expect("Tauri build failed");
}
