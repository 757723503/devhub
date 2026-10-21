# 0031 悬浮面板、输出状态与脚本收藏

- 状态：已采纳
- 日期：2026-10-21

## 背景

有人希望不打开编辑器，用一个始终可唤出的小面板操作项目里的开发命令：看长时间运行的 watch 是否还活着，一键跑常用脚本，危险命令先确认。watch 进程（webpack、typescript-to-lua）往往不占固定端口，现有的端口健康检查给不出「构建中 / 就绪 / 出错」。

## 决策

- 悬浮面板是第二个 BrowserWindow（透明、无边框、约 280px 宽、不出现在任务栏），由主进程的 `overlay-controller.ts` 创建。位置存在 `userData/overlay.json`，显示时夹回当前显示器的工作区，默认在工作区右上角。置顶可关。托盘菜单、全局快捷键和 ShellApi 的 `toggleOverlay` 都能开关；快捷键放在核心设置 `overlayShortcut`（默认 `CommandOrControl+Alt+D`，即 Windows / Linux 的 Ctrl+Alt+D），设置页可改。面板上的按钮、隐藏、打开主窗口走 ShellApi，不进 `DevhubApi`。
- 面板复用同一份 renderer（`?view=overlay`）和现有的脚本 / 运行查询。双击一行（或「在主窗口打开」）让主窗口聚焦到该运行的终端标签。进程启动、停止仍只走 RunManager。
- `.devhub.yaml` 的脚本可以写 `status`：预设 `webpack`、`tstl`，或 `{ busy, ready, error }` 正则。`output-status-monitor` 只订阅事件总线，去掉 ANSI 后在最近输出里取**最后一次**匹配，因此 watch 可以在构建中、就绪、出错之间来回。结果用新事件 `run-output-status` 推送，主窗口脚本行和悬浮面板都显示。没有 `status` 的脚本仍走原来的端口健康检查。预设是按这些工具的常见输出写的，项目对不上就改正则。
- `confirm: true` 时，点击运行先弹出确认。批量任务直接调 core，不经过这个对话框。
- 收藏：`favorite: true` 写在项目文件里，作为默认；本机的星标存在 `favorites.json`，有记录就以记录为准（因此可以取消文件里声明的收藏，也可以给 npm 脚本加星）。主窗口可以只看收藏。悬浮面板的快捷按钮就是收藏。变更用 `favorites-updated` 推送。`setScriptFavorite` 的远程级别是 `control`（不新增可执行内容）。

## 备选与理由

- 把面板做进 core：窗口、快捷键和屏幕坐标都是 Electron 的事，core 不能依赖 Electron。
- 把输出状态塞进 `RunHealth`：健康检查是端口 / HTTP，和「日志里最后一行算什么」不是同一件事，混在一起会让没有端口的 watch 一直停在「启动中」。
- 收藏只放 localStorage：两个窗口能共享，但手写的 `favorite` 和本机取消收藏不好一起测，手机端也读不到。
