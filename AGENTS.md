# Diffora 项目规范

## 范围

轻量可编辑文件编辑器，使用 Tauri 2、React 19、TypeScript、TailwindCSS 4，先支持 Windows 和 macOS。
首版包含文件树、文本编辑与保存、Markdown 编辑与预览、只读 Git 状态与 Diff、深浅主题及跟随系统。
不包含终端、插件系统、Git 写操作及 Office 文档预览。

## 结构约定

- `src/`：React 界面与样式，后续按实际功能拆分目录。
- `src/components/`：文件树、文本编辑器等界面组件。
- `src-tauri/`：Rust 桌面入口、配置，后续承载文件读写和 Git 查询。
- `src-tauri/src/`：Rust 源码入口。
- `src-tauri/icons/`：桌面应用图标及其 SVG 源文件。
- `src-tauri/capabilities/`：桌面窗口的最小 Tauri 权限声明。
- 根目录：工程配置、README.md、ROADMAP.md。
- 新增子目录前先在本文件明确用途。

## 实施要求

- 遵循用户提供的全局规范与红线，中文沟通。
- 每次开始工作先读 ROADMAP.md；完成工作后记录实际验证与阻塞。
- 只实现当前阶段，不用演示数据冒充已完成的文件或 Git 功能。
- 文件访问限定在用户打开的项目中；Markdown 禁止执行原始 HTML。
- Git 只允许查询，不得提供暂存、提交或回滚命令。
- 依赖优先使用现有能力；新增依赖说明用途，不安装全局依赖。
- 前端修改至少运行 `npm.cmd run build`；桌面修改在环境具备时运行 `npm.cmd run tauri build -- --no-bundle`。
- 未实际验证的桌面启动、跨平台构建和交互不得标记完成。
- 删除、回滚、系统组件安装、密钥与 CI/CD 修改、公开发布必须先确认。
