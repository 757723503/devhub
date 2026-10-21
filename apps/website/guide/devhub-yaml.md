# 自定义脚本（`.devhub.yaml`）

DevHub 识别不到的命令——`docker compose`、带参数的启动命令、大型构建中的某个模块、Python mock 服务等——可以写在项目根目录的 `.devhub.yaml`（或 `.devhub.yml`）中。把它提交进仓库，团队成员就能看到同样的脚本。

```yaml
scripts:
  api:
    command: mvnw.cmd spring-boot:run -pl server
    description: 后端
    port: 8081
    health: /actuator/health
  db:
    command: docker compose up postgres
    cwd: deploy
    port: 5432
```

自定义脚本排在列表最前。保存后刷新或切回窗口即生效。

## 字段

| 字段          | 必填 | 说明                                                      |
| ------------- | ---- | --------------------------------------------------------- |
| `command`     | 是   | 要执行的命令，也可以按平台分别填写（见下文）。            |
| `cwd`         | 否   | 工作目录，相对项目目录，不能跳出项目。                    |
| `description` | 否   | 显示在脚本名旁边。                                        |
| `port`        | 否   | 脚本监听的端口，用于启动前端口冲突提示和健康检查。        |
| `ports`       | 否   | 多个端口，例如 `[8081, 8082]`。`port` 与 `ports` 二选一。 |
| `health`      | 否   | 以 `/` 开头的 HTTP 路径，返回 2xx 才算就绪，见下文。      |

脚本名最长 60 个字符。未知的键会报错而不是被忽略，拼错成 `comand` 不会悄悄失效。

## 按平台写命令

```yaml
scripts:
  api:
    command:
      windows: mvnw.cmd spring-boot:run
      linux: ./mvnw spring-boot:run
```

只写了一个平台命令的脚本，在另一个平台上不显示。

## 端口

没有写 `port` 或 `ports` 时，DevHub 从命令中推断端口（如 `--port 3000`，或常见工具的默认端口）。推断不对或推断不出时写上 `port`；没有端口的脚本只显示「运行中」，没有健康状态。

## 健康检查

默认情况下，脚本的端口全部能连接即为就绪。但端口打开不代表应用已经可用，HTTP 服务可以指定健康检查路径：

```yaml
health: /actuator/health
```

DevHub 会请求 `http://localhost:<第一个端口><路径>`，返回 2xx 即为就绪。不跟随重定向，跳转到登录页不算健康。写了 `health` 时必须能确定端口（手写或推断）。

## 错误提示

写错时在脚本列表中提示：YAML 语法错误给出行号，内容错误给出字段路径（如 `scripts.api.command`）。从 `package.json`、Maven、Gradle 识别的脚本不受影响。

## 安全

`.devhub.yaml` 中的命令与 `package.json` 的 scripts 同等对待：只有点击运行才会执行。

## 收藏、确认与输出状态

```yaml
scripts:
  dev:
    command: yarn dev
    favorite: true
    overlay: true # 出现在悬浮面板的长期运行列表
    status: [webpack, tstl] # 或 status: webpack；也可写 busy/ready/error 正则
  deploy:
    command: npm run deploy
    confirm: true # 点击运行前先确认
```

`favorite: true` 让脚本默认出现在收藏里（主窗口可只看收藏，悬浮面板底部的按钮就是收藏）。在界面上加星或取消会记在本机，并覆盖文件里的默认值。

`overlay: true` 让脚本出现在悬浮面板的长期运行列表。只写 `status` 不会自动放进去。脚本行上的面板图标可以在本机改这个选择，并覆盖文件里的默认值。

`confirm: true` 时，从脚本列表或悬浮面板点击运行会先询问。批量任务不弹这个确认框。

`status` 给没有固定端口的 watch 用：DevHub 去掉 ANSI 后，用最近输出里**最后一次**匹配决定灯的颜色（构建中 / 就绪 / 出错），所以一次编译失败后再次编译成功，灯会回到就绪。预设 `webpack` 与 `tstl`（tsc --watch / typescript-to-lua）按这些工具的常见输出编写，对不上真实日志时改成自己的正则。悬浮面板用托盘或 Ctrl+Alt+D 打开（可在设置里改快捷键）。
