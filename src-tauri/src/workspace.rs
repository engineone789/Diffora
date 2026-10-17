use serde::Serialize;
use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

const MAX_TEXT_BYTES: usize = 2 * 1024 * 1024;
static NEXT_TEMP_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Serialize)]
pub struct FileError {
    code: &'static str,
    message: String,
}

type Result<T> = std::result::Result<T, FileError>;

impl FileError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl From<std::io::Error> for FileError {
    fn from(error: std::io::Error) -> Self {
        Self::new("io", format!("文件操作失败：{error}"))
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    id: u64,
    name: String,
    root: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryEntry {
    name: String,
    path: String,
    is_directory: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentInfo {
    path: String,
    content: String,
    line_ending: &'static str,
    has_bom: bool,
}

#[derive(Serialize)]
pub struct DiskChange {
    path: String,
    status: &'static str,
}

struct Snapshot {
    canonical_path: PathBuf,
    bytes: Vec<u8>,
    line_ending: &'static str,
    has_bom: bool,
}

struct Project {
    info: ProjectInfo,
    root: PathBuf,
    documents: HashMap<String, Snapshot>,
}

impl Project {
    fn open(path: PathBuf, id: u64) -> Result<Self> {
        let root = path.canonicalize()?;
        if !root.is_dir() {
            return Err(FileError::new("not_directory", "请选择项目文件夹。"));
        }
        fs::read_dir(&root)?;
        let info = ProjectInfo {
            id,
            name: path
                .file_name()
                .unwrap_or(path.as_os_str())
                .to_string_lossy()
                .into(),
            root: path.to_string_lossy().into(),
        };
        Ok(Self {
            info,
            root,
            documents: HashMap::new(),
        })
    }

    fn resolve(&self, relative: &str) -> Result<PathBuf> {
        let path = Path::new(relative);
        if path
            .components()
            .any(|part| !matches!(part, Component::Normal(_) | Component::CurDir))
        {
            return Err(FileError::new(
                "outside_project",
                "不能访问项目文件夹以外的路径。",
            ));
        }
        let canonical = self.root.join(path).canonicalize()?;
        if !canonical.starts_with(&self.root) {
            return Err(FileError::new(
                "outside_project",
                "不能访问指向项目外部的链接。",
            ));
        }
        Ok(canonical)
    }

    fn relative(&self, path: &Path) -> String {
        path.strip_prefix(&self.root)
            .expect("resolved project path")
            .to_string_lossy()
            .into()
    }

    fn list(&self, relative: &str) -> Result<Vec<DirectoryEntry>> {
        let directory = self.resolve(relative)?;
        let mut entries = Vec::new();
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            let path = entry.path();
            // Links are excluded so the tree never leads into another project.
            if entry.file_type()?.is_symlink() {
                continue;
            }
            let Ok(canonical) = path.canonicalize() else {
                continue;
            };
            if !canonical.starts_with(&self.root) {
                continue;
            }
            let metadata = canonical.metadata()?;
            if !metadata.is_dir() && !metadata.is_file() {
                continue;
            }
            entries.push(DirectoryEntry {
                name: entry.file_name().to_string_lossy().into(),
                path: self.relative(&canonical),
                is_directory: metadata.is_dir(),
            });
        }
        entries.sort_by(|left, right| {
            right
                .is_directory
                .cmp(&left.is_directory)
                .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
                .then_with(|| left.name.cmp(&right.name))
        });
        Ok(entries)
    }

    fn read_document(&mut self, relative: &str) -> Result<DocumentInfo> {
        let canonical_path = self.resolve(relative)?;
        let bytes = read_bounded(&canonical_path)?;
        let has_bom = bytes.starts_with(&[0xef, 0xbb, 0xbf]);
        let text_bytes = if has_bom { &bytes[3..] } else { &bytes[..] };
        let text = std::str::from_utf8(text_bytes)
            .map_err(|_| FileError::new("encoding", "当前仅支持 UTF-8 文本，未打开此文件。"))?;
        if text.contains('\0') {
            return Err(FileError::new(
                "binary",
                "此文件包含二进制内容，不能作为文本编辑。",
            ));
        }
        let line_ending = if text.contains("\r\n") { "CRLF" } else { "LF" };
        let path = self.relative(&canonical_path);
        let document = DocumentInfo {
            path: path.clone(),
            content: text.replace("\r\n", "\n"),
            line_ending,
            has_bom,
        };
        self.documents.insert(
            path,
            Snapshot {
                canonical_path,
                bytes,
                line_ending,
                has_bom,
            },
        );
        Ok(document)
    }

    fn read_image(&self, document: &str, image: &str) -> Result<Vec<u8>> {
        let document = self.resolve(document)?;
        if !document.is_file() {
            return Err(FileError::new("not_file", "图片引用必须来自普通文件。"));
        }
        let image = Path::new(image);
        if image.as_os_str().is_empty()
            || image
                .components()
                .any(|part| matches!(part, Component::Prefix(_) | Component::RootDir))
        {
            return Err(FileError::new(
                "outside_project",
                "仅支持项目内的相对路径图片。",
            ));
        }
        let mut relative = document
            .parent()
            .unwrap()
            .strip_prefix(&self.root)
            .unwrap()
            .to_path_buf();
        for part in image.components() {
            match part {
                Component::Normal(name) => relative.push(name),
                Component::ParentDir if relative.pop() => {}
                Component::CurDir => {}
                _ => {
                    return Err(FileError::new(
                        "outside_project",
                        "图片路径不能越出项目文件夹。",
                    ))
                }
            }
        }
        let canonical = self.resolve(&relative.to_string_lossy())?;
        let bytes = read_bounded(&canonical)?;
        if !(bytes.starts_with(b"\x89PNG\r\n\x1a\n")
            || bytes.starts_with(b"\xff\xd8\xff")
            || bytes.starts_with(b"GIF87a")
            || bytes.starts_with(b"GIF89a")
            || (bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP")))
        {
            return Err(FileError::new(
                "image_format",
                "仅支持 PNG、JPEG、GIF 和 WebP 图片。",
            ));
        }
        Ok(bytes)
    }

    fn save(&mut self, relative: &str, content: String) -> Result<()> {
        let canonical = self.resolve(relative)?;
        let snapshot = self
            .documents
            .get(relative)
            .ok_or_else(|| FileError::new("not_open", "请先打开文件再保存。"))?;
        if canonical != snapshot.canonical_path || read_bounded(&canonical)? != snapshot.bytes {
            return Err(FileError::new(
                "external_change",
                "磁盘文件已被其他程序修改，请先处理外部变更。",
            ));
        }
        let metadata = canonical.metadata()?;
        if metadata.permissions().readonly() {
            return Err(FileError::new("readonly", "文件为只读，尚未保存。"));
        }
        let normalized = content.replace("\r\n", "\n");
        if normalized.contains('\0') {
            return Err(FileError::new(
                "binary",
                "不能将含有空字符的内容保存为文本。",
            ));
        }
        let text = if snapshot.line_ending == "CRLF" {
            normalized.replace('\n', "\r\n")
        } else {
            normalized
        };
        let mut bytes = Vec::new();
        if snapshot.has_bom {
            bytes.extend_from_slice(&[0xef, 0xbb, 0xbf]);
        }
        bytes.extend_from_slice(text.as_bytes());
        if bytes.len() > MAX_TEXT_BYTES {
            return Err(FileError::new(
                "too_large",
                "当前阶段仅支持不超过 2 MiB 的文本文件。",
            ));
        }
        let temporary = canonical.with_file_name(format!(
            ".diffora-{}-{}.tmp",
            std::process::id(),
            NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed)
        ));
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        let result = (|| -> Result<()> {
            output.write_all(&bytes)?;
            output.sync_all()?;
            drop(output);
            fs::set_permissions(&temporary, metadata.permissions())?;
            if self.resolve(relative)? != canonical || read_bounded(&canonical)? != snapshot.bytes {
                return Err(FileError::new(
                    "external_change",
                    "保存期间磁盘文件发生变化，已保留原文件。",
                ));
            }
            fs::rename(&temporary, &canonical)?;
            Ok(())
        })();
        if result.is_err() {
            // Only remove the temporary file created by this save attempt.
            let _ = fs::remove_file(&temporary);
        }
        result?;
        self.documents
            .get_mut(relative)
            .expect("open snapshot")
            .bytes = bytes;
        Ok(())
    }

    fn changes(&self) -> Vec<DiskChange> {
        self.documents
            .iter()
            .filter_map(|(path, snapshot)| {
                let status = match self.resolve(path) {
                    Ok(canonical) if canonical == snapshot.canonical_path => {
                        match read_bounded(&canonical) {
                            Ok(bytes) if bytes == snapshot.bytes => return None,
                            Ok(_) => "changed",
                            Err(_) => "unreadable",
                        }
                    }
                    Err(error) if error.code == "io" && !snapshot.canonical_path.exists() => {
                        "missing"
                    }
                    _ => "unreadable",
                };
                Some(DiskChange {
                    path: path.clone(),
                    status,
                })
            })
            .collect()
    }
}

fn read_bounded(path: &Path) -> Result<Vec<u8>> {
    let file = File::open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() {
        return Err(FileError::new("not_file", "请选择普通文本文件。"));
    }
    if metadata.len() > MAX_TEXT_BYTES as u64 {
        return Err(FileError::new(
            "too_large",
            "当前阶段仅支持不超过 2 MiB 的文本文件。",
        ));
    }
    let mut bytes = Vec::new();
    file.take((MAX_TEXT_BYTES + 1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > MAX_TEXT_BYTES {
        return Err(FileError::new(
            "too_large",
            "文件在读取期间超过 2 MiB，未打开。",
        ));
    }
    Ok(bytes)
}

#[derive(Default)]
struct WorkspaceInner {
    next_id: u64,
    project: Option<Project>,
}

impl WorkspaceInner {
    fn project(&mut self, id: u64) -> Result<&mut Project> {
        self.project
            .as_mut()
            .filter(|project| project.info.id == id)
            .ok_or_else(|| FileError::new("stale_project", "项目已切换，请重新选择文件。"))
    }
}

#[derive(Default)]
pub struct Workspace(Mutex<WorkspaceInner>);

impl Workspace {
    fn lock(&self) -> Result<std::sync::MutexGuard<'_, WorkspaceInner>> {
        self.0
            .lock()
            .map_err(|_| FileError::new("workspace", "工作区状态不可用，请重启应用。"))
    }
}

#[tauri::command]
pub async fn choose_project(
    app: AppHandle,
    state: State<'_, Workspace>,
) -> Result<Option<ProjectInfo>> {
    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("打开项目文件夹")
            .blocking_pick_folder()
    })
    .await
    .map_err(|_| FileError::new("dialog", "无法打开文件夹选择窗口。"))?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|_| FileError::new("path", "请选择本地文件夹。"))?;
    let mut workspace = state.lock()?;
    workspace.next_id += 1;
    let project = Project::open(path, workspace.next_id)?;
    let info = project.info.clone();
    workspace.project = Some(project);
    Ok(Some(info))
}

#[tauri::command]
pub async fn list_directory(
    state: State<'_, Workspace>,
    project_id: u64,
    path: String,
) -> Result<Vec<DirectoryEntry>> {
    state.lock()?.project(project_id)?.list(&path)
}

#[tauri::command]
pub async fn read_document(
    state: State<'_, Workspace>,
    project_id: u64,
    path: String,
) -> Result<DocumentInfo> {
    state.lock()?.project(project_id)?.read_document(&path)
}

#[tauri::command]
pub async fn read_markdown_image(
    state: State<'_, Workspace>,
    project_id: u64,
    path: String,
    image_path: String,
) -> Result<Vec<u8>> {
    state
        .lock()?
        .project(project_id)?
        .read_image(&path, &image_path)
}

#[tauri::command]
pub async fn save_document(
    state: State<'_, Workspace>,
    project_id: u64,
    path: String,
    content: String,
) -> Result<()> {
    state.lock()?.project(project_id)?.save(&path, content)
}

#[tauri::command]
pub async fn check_documents(
    state: State<'_, Workspace>,
    project_id: u64,
) -> Result<Vec<DiskChange>> {
    Ok(state.lock()?.project(project_id)?.changes())
}

#[tauri::command]
pub async fn close_document(
    state: State<'_, Workspace>,
    project_id: u64,
    path: String,
) -> Result<()> {
    state.lock()?.project(project_id)?.documents.remove(&path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("target/test-workspaces")
                .join(format!(
                    "{}-{}",
                    std::process::id(),
                    NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed)
                ));
            fs::create_dir_all(&root).unwrap();
            Self(root)
        }
        fn project(&self) -> Project {
            Project::open(self.0.clone(), 1).unwrap()
        }
        fn write(&self, path: &str, content: impl AsRef<[u8]>) {
            fs::write(self.0.join(path), content).unwrap();
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn markdown_images_resolve_within_project_and_reject_unsafe_inputs() {
        let fixture = Fixture::new();
        fs::create_dir(fixture.0.join("docs")).unwrap();
        fixture.write("docs/note.md", "# note");
        fixture.write("图片.png", b"\x89PNG\r\n\x1a\n");
        fixture.write("fake.png", "<svg onload='alert(1)'/>");
        fixture.write("large.png", vec![0; MAX_TEXT_BYTES + 1]);
        let project = fixture.project();
        assert_eq!(
            project.read_image("docs/note.md", "../图片.png").unwrap(),
            b"\x89PNG\r\n\x1a\n"
        );
        for path in ["../../outside.png", "/outside.png", ""] {
            assert_eq!(
                project.read_image("docs/note.md", path).unwrap_err().code,
                "outside_project"
            );
        }
        assert_eq!(
            project
                .read_image("docs/note.md", "../fake.png")
                .unwrap_err()
                .code,
            "image_format"
        );
        assert_eq!(
            project
                .read_image("docs/note.md", "../large.png")
                .unwrap_err()
                .code,
            "too_large"
        );
        assert!(project.read_image("docs/note.md", "missing.png").is_err());
        assert_eq!(
            project.read_image(".", "图片.png").unwrap_err().code,
            "not_file"
        );
        assert_eq!(
            project
                .read_image("../note.md", "图片.png")
                .unwrap_err()
                .code,
            "outside_project"
        );
    }

    #[test]
    fn preserves_utf8_bom_crlf_and_unicode_on_save() {
        let fixture = Fixture::new();
        fixture.write("note.md", b"\xef\xbb\xbfhello\r\nworld\r\n");
        let mut project = fixture.project();
        let document = project.read_document("note.md").unwrap();
        assert_eq!(document.content, "hello\nworld\n");
        assert_eq!(document.line_ending, "CRLF");
        assert!(document.has_bom);
        project.save("note.md", "少主\n测试\n".into()).unwrap();
        let mut expected = vec![0xef, 0xbb, 0xbf];
        expected.extend_from_slice("少主\r\n测试\r\n".as_bytes());
        assert_eq!(fs::read(fixture.0.join("note.md")).unwrap(), expected);
        assert!(project.changes().is_empty());
    }

    #[test]
    fn refuses_external_edits_and_allows_explicit_reload() {
        let fixture = Fixture::new();
        fixture.write("note.txt", "first");
        let mut project = fixture.project();
        project.read_document("note.txt").unwrap();
        fixture.write("note.txt", "external");
        assert_eq!(project.changes()[0].status, "changed");
        assert_eq!(
            project.save("note.txt", "local".into()).unwrap_err().code,
            "external_change"
        );
        assert_eq!(
            fs::read_to_string(fixture.0.join("note.txt")).unwrap(),
            "external"
        );
        assert_eq!(
            project.read_document("note.txt").unwrap().content,
            "external"
        );
        project.save("note.txt", "resolved".into()).unwrap();
        assert_eq!(
            fs::read_to_string(fixture.0.join("note.txt")).unwrap(),
            "resolved"
        );
    }

    #[test]
    fn rejects_absolute_parent_and_stale_project_access() {
        let fixture = Fixture::new();
        let mut project = fixture.project();
        assert_eq!(
            project.resolve("../outside.txt").unwrap_err().code,
            "outside_project"
        );
        assert_eq!(
            project
                .resolve(fixture.0.to_str().unwrap())
                .unwrap_err()
                .code,
            "outside_project"
        );
        assert!(project.read_document("missing.txt").is_err());
        let mut workspace = WorkspaceInner {
            next_id: 1,
            project: Some(project),
        };
        assert_eq!(workspace.project(2).err().unwrap().code, "stale_project");
    }

    #[test]
    fn handles_empty_and_rejects_binary_encoding_and_oversized_files() {
        let fixture = Fixture::new();
        fixture.write("empty.txt", "");
        fixture.write("binary.dat", b"a\0b");
        fixture.write("other.txt", [0xff, 0xfe, 0x41]);
        fixture.write("large.txt", vec![b'x'; MAX_TEXT_BYTES + 1]);
        let mut project = fixture.project();
        assert_eq!(project.read_document("empty.txt").unwrap().content, "");
        project.save("empty.txt", "saved".into()).unwrap();
        assert_eq!(
            project.read_document("binary.dat").err().unwrap().code,
            "binary"
        );
        assert_eq!(
            project.read_document("other.txt").err().unwrap().code,
            "encoding"
        );
        assert_eq!(
            project.read_document("large.txt").err().unwrap().code,
            "too_large"
        );
        assert_eq!(
            project
                .save("empty.txt", "x".repeat(MAX_TEXT_BYTES + 1))
                .unwrap_err()
                .code,
            "too_large"
        );
        assert_eq!(
            fs::read_to_string(fixture.0.join("empty.txt")).unwrap(),
            "saved"
        );
    }

    #[test]
    fn sorts_directories_first_and_reports_missing_files() {
        let fixture = Fixture::new();
        fs::create_dir(fixture.0.join("folder")).unwrap();
        fixture.write("b.txt", "b");
        fixture.write("a.txt", "a");
        let mut project = fixture.project();
        let entries = project.list("").unwrap();
        assert_eq!(
            entries
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            ["folder", "a.txt", "b.txt"]
        );
        project.read_document("a.txt").unwrap();
        fs::remove_file(fixture.0.join("a.txt")).unwrap();
        assert_eq!(project.changes()[0].status, "missing");
        assert!(project.save("a.txt", "local".into()).is_err());
        assert!(!fixture.0.join("a.txt").exists());
    }

    #[test]
    fn rejects_readonly_save_without_leaving_temporary_files() {
        let fixture = Fixture::new();
        fixture.write("readonly.txt", "original");
        let mut project = fixture.project();
        project.read_document("readonly.txt").unwrap();
        let path = fixture.0.join("readonly.txt");
        let original_permissions = path.metadata().unwrap().permissions();
        let mut permissions = original_permissions.clone();
        permissions.set_readonly(true);
        fs::set_permissions(&path, permissions).unwrap();
        assert_eq!(
            project
                .save("readonly.txt", "edit".into())
                .unwrap_err()
                .code,
            "readonly"
        );
        fs::set_permissions(&path, original_permissions).unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), "original");
        assert_eq!(project.list("").unwrap().len(), 1);
    }

    #[cfg(windows)]
    #[test]
    fn rejects_windows_junction_outside_project() {
        let fixture = Fixture::new();
        let outside = Fixture::new();
        outside.write("private.txt", "outside");
        let junction = fixture.0.join("link");
        let output = std::process::Command::new("cmd.exe")
            .args(["/D", "/C", "mklink", "/J"])
            .arg(junction.to_string_lossy().replace('/', "\\"))
            .arg(outside.0.to_string_lossy().replace('/', "\\"))
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let mut project = fixture.project();
        let tree = project.list("").unwrap();
        let error = project.read_document("link/private.txt").err().unwrap();
        fixture.write("note.md", "# image");
        let image_error = project
            .read_image("note.md", "link/private.txt")
            .unwrap_err();
        fs::remove_dir(&junction).unwrap();
        assert!(tree.is_empty());
        assert_eq!(error.code, "outside_project");
        assert_eq!(image_error.code, "outside_project");
        assert_eq!(
            fs::read_to_string(outside.0.join("private.txt")).unwrap(),
            "outside"
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_links_outside_project() {
        let fixture = Fixture::new();
        let outside = Fixture::new();
        outside.write("private.txt", "outside");
        std::os::unix::fs::symlink(&outside.0, fixture.0.join("link")).unwrap();
        let mut project = fixture.project();
        assert!(project.list("").unwrap().is_empty());
        assert_eq!(
            project
                .read_document("link/private.txt")
                .err()
                .unwrap()
                .code,
            "outside_project"
        );
    }
}
