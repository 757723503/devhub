# 0032 钩子：用 JSON 配置状态动作

- 状态：已采纳
- 日期：2026-10-21

## 背景

悬浮面板上的状态提示原来写在每个脚本的 `notify` 里。换一台机器、或同一件事要覆盖多个脚本时，得改项目文件。也缺少「进程启动」和「进程退出」这两种事件。Windows 上还需要一个总音量，而不只是静音。

## 决策

- 主配置在设置页「Hooks」。存的是一份 JSON 文档（`settings.json` 的 `hooks`），形状如下。`match` 省略的字段匹配全部。`interval` 省略时为 15 秒，`0` 为不限制。`firstBuild` 省略时为 true；false 则跳过这次进程启动后的第一次就绪。命令的 `timeout` 省略时为 30 秒。

```json
{
  "hooks": {
    "onReady": [
      {
        "match": { "project": "axe_king", "script": "全量dev" },
        "actions": [
          { "type": "sound", "file": "default" },
          { "type": "toast" },
          { "type": "command", "command": "yarn launch axe_king s1-1", "cwd": "project" }
        ]
      }
    ]
  }
}
```

- 四个事件：`onReady` 只在输出状态从构建中（yaml 里的 busy）变为就绪时触发；`onError` 在变为出错时触发；`onStart` 在脚本进程进入运行时触发一次；`onExit` 在进程退出时触发一次，并带上退出码。
- 命令在后台执行，不占终端标签，也不进运行历史。标准输入是一行 JSON（`event`、`project`、`script`、`status`、`exitCode`、`test`）。环境变量为 `DEVHUB_EVENT`、`DEVHUB_PROJECT`、`DEVHUB_SCRIPT`、`DEVHUB_STATUS`、`DEVHUB_EXIT_CODE`（没有退出码时为空字符串）。超时后杀掉整个进程树。`cwd` 为 `project` 或省略时用项目目录；相对路径不能跳出项目。
- 设置页提供校验过的 JSON 编辑器，以及每个事件的「试触发」。试触发只跑已保存的全局钩子，忽略 match 和间隔，不跑项目文件里的钩子。`testHook` 的远程级别是 `local`。
- 项目可以在 `.devhub.yaml` 根上写 `hooks`（内容与上面的 `hooks` 对象相同）。脚本条目里也可以写 `hooks`，形状相同，但不写 `match`：运行时自动绑到这个脚本名。主窗口脚本行有齿轮（悬浮面板没有），用来改这个脚本的钩子、收藏、长期运行、运行前确认和 `status`，并写回该项目的 `.devhub.yaml`。执行顺序是全局、项目根 `hooks`、脚本 `hooks`、脚本上的 `notify`。`notify` 仍是该脚本的简写：`sound`、`toast`、`run` 变成对应动作，`run` 是 `cwd: project` 的命令，不再另开终端。脚本齿轮上的试触发只跑这个脚本已保存的钩子和 `notify`。没有 `command` 的脚本条目只给同名的 npm / Maven / Gradle 脚本加这些设置，不会再生成一条自定义脚本。
- 同一规则、同一脚本分开计时。`firstBuild` 按一次进程启动计算。
- 标题栏和悬浮面板各有一个喇叭。点开后是音量百分比、滑块和静音开关；有声音时图标实心，静音或音量为 0 时换成静音图标。弹层点外面或按 Esc 关闭。面板太矮时会临时加高，松手后回到内容高度，不改用户拖出的高度上限。`notifyMuted` 和 `hookVolume` 存在设置里，两边读同一份。静音或音量为 0 时不播放；通知和命令照常。音量靠缩放 16-bit PCM 实现，不新增播放库。

## 备选与理由

- 只保留 yaml 里的 `notify`：换机器和「所有脚本」都要改项目文件，设置页也没有地方试一次。
- 命令继续开一个终端标签：钩子需要稳定的 stdin 和超时，终端标签做不到，也会把通知命令写进运行历史。
- 用系统音量接口：Windows 的 SoundPlayer 不能调音量，缩放 wav 样本在两个平台上行为一致。
