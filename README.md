# Diffora

使用 Tauri 2、React 19、TypeScript 和 TailwindCSS 4 构建的轻量跨平台文件编辑器，目标平台为 Windows 和 macOS。

当前支持打开本地项目文件夹、按需展开文件树、CodeMirror 6 多标签页文本编辑与保存，以及浅色／深色／跟随系统主题。
Markdown 文件可作为文本编辑；Markdown 预览及 Git 状态、Diff 尚未实现。实际进度参见 ROADMAP.md。

## 从源码构建与启动

下载源码后需要先安装开发环境，再构建桌面程序。目前 Windows 已通过构建与交互验证；macOS 是目标平台，以下步骤尚未在 Mac 上实际验证。

### １．准备环境

所有平台都需要：

- Node.js 和随附的 npm，建议使用 Node.js 24；当前 Vite 依赖要求 Node.js `^20.19.0 || >=22.12.0`。
- 通过 [Rustup](https://rustup.rs/) 安装的 Rust stable 工具链，包含 `rustc` 和 `cargo`。
- Git，用于克隆仓库；通过 GitHub「Code → Download ZIP」下载则不需要 Git。

Windows 还需要：

- Visual Studio Build Tools 2022，选择「使用 C++ 的桌面开发」，包含 MSVC C++ 构建工具和 Windows SDK。
- Microsoft Edge WebView2 Runtime，用于渲染桌面界面。
- Rust 使用 MSVC 工具链，例如 x64 Windows 对应 `stable-x86_64-pc-windows-msvc`。

macOS 还需要 Xcode Command Line Tools，可在终端运行以下命令并按提示完成安装：

```sh
xcode-select --install
```

平台依赖的安装入口和详细步骤参见 [Tauri 官方环境准备文档](https://v2.tauri.app/start/prerequisites/) 。安装后重新打开终端，让工具链环境变量生效；不需要把工具安装到本项目开发者使用的相同磁盘路径，也不需要全局安装 Tauri CLI。

### ２．下载源码

```sh
git clone https://github.com/engineone789/Diffora.git
cd Diffora
```

也可以下载 ZIP 并解压，然后在解压目录打开终端。后续命令均在包含 `package.json` 的项目根目录执行。

### ３．安装依赖并启动桌面应用

Windows（PowerShell）：

```powershell
node --version
npm.cmd --version
rustc --version
cargo --version
npm.cmd ci --cache .npm-cache
npm.cmd run tauri info
npm.cmd run tauri dev
```

macOS（终端）：

```sh
node --version
npm --version
rustc --version
cargo --version
npm ci --cache .npm-cache
npm run tauri info
npm run tauri dev
```

版本命令应正常输出，`tauri info` 用于检查平台依赖。`npm ci` 根据仓库的 `package-lock.json` 安装前端依赖；首次桌面启动还会通过 Cargo 下载并编译 Rust 依赖，需要联网且耗时较长。

`tauri dev` 会自动启动前端开发服务并打开 Diffora 桌面窗口，无需另外运行 `npm run dev`。开发时保留终端，结束开发可按 `Ctrl+C`。

### ４．构建可独立启动的程序

完成上述环境准备和依赖安装后，Windows 执行：

```powershell
npm.cmd run tauri build -- --no-bundle
.\src-tauri\target\release\diffora.exe
```

macOS 执行（尚未实际验证）：

```sh
npm run tauri build -- --no-bundle
./src-tauri/target/release/diffora
```

构建命令会自动执行前端类型检查、前端生产构建和 Rust release 编译。默认输出为 Windows 的 `src-tauri/target/release/diffora.exe` 或 macOS 的 `src-tauri/target/release/diffora`；如自行设置了 `CARGO_TARGET_DIR`，产物位置随之变化。

构建完成后无需保持开发服务运行。Windows 可直接双击生成的 `diffora.exe`，运行机器仍需 WebView2 Runtime。当前 `bundle.active` 为 `false`，不会生成安装包或 macOS `.app`／`.dmg`；请在对应操作系统上构建，本说明不包含交叉编译。

## 应用使用

Windows 本地构建后，双击 `src-tauri/target/release/diffora.exe` 启动。

1. 点击「打开文件夹」，选择本地项目。
2. 在文件树中展开目录、点击文件开始编辑；标签页切换保留编辑内容与撤销历史。
3. 点击「保存」或按 `Ctrl+S`（macOS 为 `Cmd+S`）写入磁盘。
4. 关闭有修改的标签页、切换文件夹或退出窗口时，选择保存、放弃更改或取消。

窗口重新获得焦点或恢复可见时检查外部文件变更，保存前再次比较磁盘内容。发生冲突时保留本地修改并拒绝覆盖；「重新加载」会读取磁盘内容，存在本地修改时需要确认。

当前支持不超过 2 MiB 的 UTF-8 文本，保留 UTF-8 BOM 和 LF／CRLF 换行格式；混合换行文件保存时统一为 CRLF。不支持的编码、二进制内容、过大文件及保存失败均会提示，未保存内容继续保留。
文件访问由 Rust 限定在当前打开的项目中，目录链接暂不展示。

## 前端预览与验证

以下命令仅用于前端开发和检查，不会启动完整桌面应用：

```powershell
npm.cmd run dev
npm.cmd run build
```

`dev` 启动浏览器预览，无法访问桌面文件能力，「打开文件夹」按钮会禁用；实际编辑本地文件请使用 `tauri dev` 或构建后的桌面程序。`build` 仅生成前端 `dist/`，不会生成桌面可执行文件。

Rust 文件读写回归测试：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --release --lib
```

macOS 使用 `npm` 代替 `npm.cmd`。Tauri 构建钩子使用跨平台的 `npm` 命令。

## 常见问题

- PowerShell 提示 `npm.ps1` 无法执行：使用文档中的 `npm.cmd`，无需修改系统执行策略。
- 找不到 `cargo` 或 `rustc`：确认已安装 Rustup，并在安装后重新打开终端。
- Windows 提示缺少 `link.exe` 或 SDK：检查 Build Tools 中是否安装了 MSVC 和 Windows SDK，仅安装 Node.js 与 Rust 不够。
- 浏览器页面无法打开本地文件：这是前端预览，请改用 `npm.cmd run tauri dev`（macOS 使用 `npm`）。
- 首次安装或编译时下载失败：检查 npm、Cargo 依赖下载的网络连接，恢复后重新执行失败的命令。

## 目录

- `src/`：React 界面与样式。
- `src/components/`：文件树和 CodeMirror 编辑器组件。
- `src-tauri/`：Rust 桌面入口与 Tauri 配置。
- `src-tauri/src/workspace.rs`：项目范围检查、文件读取、安全保存及回归测试。
- `src-tauri/capabilities/`：窗口事件及关闭操作所需权限。
- `AGENTS.md`：项目规范。
- `ROADMAP.md`：进度、阻塞与验证记录。
