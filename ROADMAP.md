# Diffora 路线图

## 当前阶段

阶段 ３文件树、标签页、UTF-8 文本编辑与保存闭环已完成，并通过 Windows 桌面端到端验证。下一阶段为 Markdown 预览，尚未开始。

## 已完成

- 原生选择项目文件夹、按需展开与刷新文件树、中文路径文件打开、CodeMirror 6 多标签页编辑与撤销历史保留。
- 保存按钮与 Ctrl／Cmd + S、未保存标记、UTF-8 BOM 与 LF／CRLF 保存；关闭标签页、切换项目、关闭窗口时提供保存／放弃／取消，保存失败阻止继续。
- 窗口重新获得焦点或恢复可见时检查外部变更，保存前再次比较磁盘内容；冲突时拒绝覆盖，保留本地修改，重新加载前确认放弃未保存内容。
- Rust 后端限制文件访问在当前项目内，拒绝路径越界和项目外部目录链接，处理非 UTF-8、二进制、超过 2 MiB、只读及已删除文件；写入临时文件后替换原文件。
- 通过真实 WebView2 桌面调试验证浅色、深色、跟随系统及系统主题变化、刷新后的主题持久化、文件／Git 面板切换。
- 只读确认初始目录为空。
- 环境检查：Node.js v24.20.0、npm 11.19.0、Git 2.52.0 可用。
- 已核对 Tauri 前置条件、配置及 TailwindCSS Vite 官方文档。
- 已建立 AGENTS.md、README.md、目录约定和工程配置。
- React 19、TypeScript、TailwindCSS 4 前端骨架通过类型检查及生产构建。
- Vite 开发服务启动，首页和 React 模块 HTTP 请求均返回 200。
- Tauri CLI 已读取应用配置；WebView2 155.0.4283.45 已安装。
- 经用户授权安装 Rustup 1.29.1、Rust/Cargo 1.99.1（stable-x86_64-pc-windows-msvc），以及 Visual Studio Build Tools 2022 17.14.41 的 C++ 工具与 Windows SDK；安装成功，无自动重启。
- 已补齐桌面 SVG、PNG 与 ICO 图标资源及目录约定，解决首次桌面构建缺少 `icons/icon.ico` 的错误。
- Windows 桌面生产构建通过，生成 `src-tauri/target/release/diffora.exe`；启动后进程正常响应，创建标题为 Diffora 的窗口，并通过正常关闭窗口退出。
- 用户确认后完成工具链迁移与重装：Rust/Cargo 分别位于 `D:\dev-tools\rustup`、`D:\dev-tools\cargo`，用户环境变量及 Rustup 卸载入口已更新；旧 C 盘 `.rustup`、`.cargo` 已在校验和构建通过后删除。Build Tools 2022 17.14.41 重装到 `D:\dev-tools\vs-build-tools`，前后 17 项组件一致；安装缓存位于 `D:\dev-tools\vs-cache`，不保留下载载荷。环境变量和组件清单备份位于 `D:\dev-tools\migration-backup`。

## 进行中

- 无。文件编辑阶段已验收，Markdown 与 Git 功能待后续实施。

## 待办

- Markdown 编辑、预览、分屏及相对路径图片。
- 本机 Git 状态、工作区 Diff、暂存区 Diff。
- Windows 与 macOS 核心流程及打包验证。

## 阻塞与待确认

- 原 Rust/Cargo 及 MSVC/SDK 缺失阻塞已解除；已授权安装并通过实际桌面构建验证。
- Rust/Cargo 的用户级环境变量已改为 D 盘路径；本次验证从持久化用户环境刷新进程后运行。迁移前打开的 Codex 和终端需要重启以加载新环境；桌面会话自动继承情况待用户实际验证。
- 官方安装器保留共享路径 `C:\Program Files (x86)\Microsoft Visual Studio\Shared`（约 7 MiB）及 Windows SDK 路径 `C:\Program Files (x86)\Windows Kits\10`（约 1.67 GiB）；未强制搬移系统组件，安装器自身仍在 C 盘。
- macOS 构建需在 Mac 上验证。
- 文件编辑阶段暂限 2 MiB 以内的 UTF-8 文本；目录链接不展示，混合换行在保存时统一为 CRLF。macOS 文件选择、快捷键与退出保护尚未实际验证。

## 最近验证

- 2026-10-16（文件编辑阶段）：`npm.cmd run build` 与 `npm.cmd run tauri build -- --no-bundle` 成功；CodeMirror 按需加载，主包约 250 kB、编辑器包约 384 kB，未调高构建告警阈值。
- 2026-10-16：`cargo test --manifest-path src-tauri/Cargo.toml --release --lib` 通过 7 项测试，覆盖 BOM／CRLF／中文保存、外部编辑拒绝与重新加载、绝对及父目录越界、过期项目、空文件、二进制、非 UTF-8、过大文件、只读文件、磁盘删除及 Windows junction 项目外链接。
- 2026-10-16：通过本机 WebView2 调试与原生 Windows 文件夹选择器完成端到端验证：目录展开、中文路径、编辑与 Ctrl+S、标签页切换后的撤销历史、未保存取消／保存后关闭、外部冲突保留磁盘与本地内容、失败保存阻止切换项目、重新加载确认、二进制拒绝、IPC 路径越界拒绝、BOM／CRLF 保留、原生关闭窗口保护与正常退出；无前端运行时异常。读写夹具位于 D 盘项目 `.npm-cache`，未修改用户项目文件。
- 2026-10-16：已目视检查 1200×800 深色与 720×540 浅色桌面截图，文件树、标签页、编辑器、保存操作及状态栏布局正常；测试结束恢复跟随系统主题。浏览器媒体模拟验证跟随系统明暗变化和刷新持久化；尚未验证操作系统重启后的主题恢复。
- 2026-10-16：依赖使用项目本地 CodeMirror 6、`@tauri-apps/api`、Rust `serde` 和 Tauri 官方 dialog 插件；目录读写使用 Rust 标准库，未向前端开放全局文件系统权限。README 已同步使用方法与限制。
- 2026-10-16（迁移重装后）：Cargo 10,774 个文件与 Rustup 66,079 个文件逐项 SHA256 对比通过；D 盘工具的 Rust/Cargo 版本保持 1.99.1，默认工具链保持 `stable-x86_64-pc-windows-msvc`。
- 2026-10-16（迁移重装后）：C 盘 Build Tools 卸载及 D 盘同版本安装均退出 0，无需重启；安装前后导出的 17 项组件完全一致，`npm.cmd run tauri info` 环境检查全部通过。
- 2026-10-16（迁移重装后）：使用 D 盘工具链运行 `npm.cmd run tauri build -- --no-bundle` 成功，依赖重新编译，release 构建耗时约 2 分钟；生成程序可创建 Diffora 窗口、正常响应并正常关闭。
- 2026-10-16（删除旧 Rust 目录后）：再次确认 `cargo`、`rustc` 命令解析到 `D:\dev-tools\cargo\bin`，版本检查通过；离线 Cargo metadata 确认当前 Windows 目标的 243 个 registry 依赖包均来自 D 盘缓存。D 盘 Cargo、Rustup、Build Tools 文件合计约 5.13 GiB，下载缓存目录剩约 23 MiB 元数据；文件大小合计不等于物理释放空间。
- 2026-10-16（缓存清理后）：用户授权清理 Visual Studio 安装缓存，通过官方安装器以管理员权限执行 `repair --nocache --quiet --norestart`，退出码为 0；缓存目录文件合计从 1,337,771,903 字节降至 42,806,816 字节，释放约 1.21 GiB，保留安装元数据；未迁移 Rust/Cargo、C++ 工具或 Windows SDK。
- 2026-10-16（缓存清理后）：再次运行 `npm.cmd run tauri build -- --no-bundle` 成功，包含前端类型检查、生产构建及桌面 release 编译，确认清理后项目仍可构建。
- 2026-10-16（工具链安装后）：`rustup show` 确认默认 MSVC 稳定工具链；`rustc --version` 与 `cargo --version` 均为 1.99.1；`npm.cmd run tauri info` 环境检查全部通过。
- 2026-10-16（图标修复后）：`npm.cmd run tauri build -- --no-bundle` 成功，包含前端类型检查、生产构建和 Rust release 编译；Cargo 生成依赖锁文件 `src-tauri/Cargo.lock`。
- 2026-10-16：隐藏启动 release 可执行文件，等待 5 秒后 `HasExited=False`、`Responding=True`、窗口标题为 Diffora 且句柄非零；`CloseMainWindow=True`，随后正常退出。该检查不代表界面渲染、主题或面板交互已通过。
- 2026-10-16：`git diff --check` 通过；当前文件均未跟踪，该检查不覆盖未跟踪文件内容。未执行打包、发布或 macOS 验证。
- 2026-10-16（继续执行）：再次运行 `npm.cmd run build` 成功；再次运行 `npm.cmd run tauri info`，仍未检测到 Rust、Cargo、rustup 及含 MSVC/SDK 的 C++ 构建工具。桌面构建继续阻塞，未安装系统组件，未完成 GUI 交互验证。
- 2026-10-16：`npm.cmd run build` 成功，包含 TypeScript 检查和 Vite 生产构建。
- 2026-10-16：`npm.cmd run dev` 启动成功；首页和 `/src/App.tsx` HTTP 200，React 模块正常转换。
- 2026-10-16：`npm.cmd run tauri info` 完成，确认 WebView2 可用，Rust/Cargo 与 MSVC/SDK 缺失；未执行桌面编译与 GUI 验证。
- 2026-10-16：`npm.cmd view react version --cache .npm-cache` 成功，项目内 npm 缓存可用。
- 默认 npm 缓存目录访问受限；后续命令使用项目内缓存。
- `npm.ps1` 被 PowerShell 策略拦截，使用 `npm.cmd`，不修改系统策略。
