# Diffora

使用 Tauri 2、React 19、TypeScript 和 TailwindCSS 4 构建的轻量跨平台文件编辑器，目标平台为 Windows 和 macOS。

当前支持打开本地项目文件夹、按需展开文件树、CodeMirror 6 多标签页文本编辑与保存，以及浅色／深色／跟随系统主题。
Markdown 文件可作为文本编辑；Markdown 预览及 Git 状态、Diff 尚未实现。实际进度参见 ROADMAP.md。

## 使用

Windows 本地构建后，双击 `src-tauri/target/release/diffora.exe` 启动。

1. 点击「打开文件夹」，选择本地项目。
2. 在文件树中展开目录、点击文件开始编辑；标签页切换保留编辑内容与撤销历史。
3. 点击「保存」或按 `Ctrl+S`（macOS 为 `Cmd+S`）写入磁盘。
4. 关闭有修改的标签页、切换文件夹或退出窗口时，选择保存、放弃更改或取消。

窗口重新获得焦点或恢复可见时检查外部文件变更，保存前再次比较磁盘内容。发生冲突时保留本地修改并拒绝覆盖；「重新加载」会读取磁盘内容，存在本地修改时需要确认。

当前支持不超过 2 MiB 的 UTF-8 文本，保留 UTF-8 BOM 和 LF／CRLF 换行格式；混合换行文件保存时统一为 CRLF。不支持的编码、二进制内容、过大文件及保存失败均会提示，未保存内容继续保留。
文件访问由 Rust 限定在当前打开的项目中，目录链接暂不展示。

## 开发

```powershell
npm.cmd install --cache .npm-cache
npm.cmd run dev
npm.cmd run build
```

桌面开发还需 Rust 工具链及平台依赖，参照 https://v2.tauri.app/start/prerequisites/ 。

```powershell
npm.cmd run tauri dev
npm.cmd run tauri build -- --no-bundle
cargo test --manifest-path src-tauri/Cargo.toml --release --lib
```

macOS 使用 `npm` 代替 `npm.cmd`。Tauri 构建钩子使用跨平台的 `npm` 命令。
当前未启用安装包打包，先验证桌面可执行程序。

## 目录

- `src/`：React 界面与样式。
- `src/components/`：文件树和 CodeMirror 编辑器组件。
- `src-tauri/`：Rust 桌面入口与 Tauri 配置。
- `src-tauri/src/workspace.rs`：项目范围检查、文件读取、安全保存及回归测试。
- `src-tauri/capabilities/`：窗口事件及关闭操作所需权限。
- `AGENTS.md`：项目规范。
- `ROADMAP.md`：进度、阻塞与验证记录。
