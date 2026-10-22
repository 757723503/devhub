# Custom scripts (`.devhub.yaml`)

When DevHub cannot detect a command — `docker compose`, a command with arguments, one module of a larger build, a Python mock server — describe it in a `.devhub.yaml` (or `.devhub.yml`) file in the project root. Commit it, and everyone on the team gets the same scripts.

```yaml
scripts:
  api:
    command: mvnw.cmd spring-boot:run -pl server
    description: Backend
    port: 8081
    health: /actuator/health
  db:
    command: docker compose up postgres
    cwd: deploy
    port: 5432
```

Custom scripts are listed first. Changes apply on refresh or when the window regains focus.

## Fields

| Field         | Required | Meaning                                                                                            |
| ------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `command`     | yes      | The command to run, or one per platform (see below).                                               |
| `cwd`         | no       | Working directory, relative to the project. It cannot point outside the project.                   |
| `description` | no       | Shown next to the script name.                                                                     |
| `port`        | no       | Port the script listens on. Used to warn about port conflicts and for health checks.               |
| `ports`       | no       | Several ports, e.g. `[8081, 8082]`. Use either `port` or `ports`.                                  |
| `health`      | no       | An HTTP path, starting with `/`, that must answer 2xx for the script to count as ready. See below. |

Script names are up to 60 characters. Unknown keys are reported as errors rather than ignored, so a typo such as `comand` does not silently do nothing.

## Per-platform commands

```yaml
scripts:
  api:
    command:
      windows: mvnw.cmd spring-boot:run
      linux: ./mvnw spring-boot:run
```

A script with a command for only one platform is hidden on the other.

## Ports

When neither `port` nor `ports` is given, DevHub infers ports from the command (for example `--port 3000` or well-known tools). Write `port` when the inference is wrong or finds nothing; without a port, the script shows **running** but no health.

## Health checks

By default a script is ready when all its ports accept connections. Opening a port does not always mean the application is ready, so for HTTP services you can name a health path:

```yaml
health: /actuator/health
```

DevHub then requests `http://localhost:<first port><path>` and counts the script as ready on a 2xx response. Redirects are not followed, so a redirect to a login page does not count. A `health` path needs a port, either written or inferred.

## Errors

Mistakes are shown in the script list: YAML syntax errors with their line number, invalid content with the field path (for example `scripts.api.command`). Scripts detected from `package.json`, Maven or Gradle are not affected.

## Security

Commands from `.devhub.yaml` are treated like `package.json` scripts: they run only when you click run.

## Favorites, confirmation and output status

```yaml
scripts:
  dev:
    command: yarn dev
    favorite: true
    overlay: true # listed in the floating panel's long-running section
    status: [webpack, tstl] # or status: webpack; or busy/ready/error regexes
  deploy:
    command: npm run deploy
    confirm: true # ask before running
```

`favorite: true` stars the script by default (the main window can filter to stars; the floating panel's buttons are the stars). Starring or unstarring in the app is stored on this machine and overrides the file.

`overlay: true` lists the script in the panel's long-running section. A `status` block alone does not. The panel icon on the script row stores a per-machine choice and overrides the file.

`confirm: true` asks before a click in the script list or the panel. Batch tasks do not show that dialog.

`status` is for watch processes that have no fixed port. After ANSI codes are stripped, the **latest** match in recent output sets the light (building / ready / error), so a failed compile followed by a successful one returns to ready. The `webpack` and `tstl` presets (tsc --watch / typescript-to-lua) follow those tools' usual messages. `tstl` treats `Found 0 errors. Watching for file changes.` as ready, `Starting incremental compilation...` and `Starting compilation in watch mode...` as building, and `Found N errors` (N > 0) as error. Replace the patterns when the real log differs.

A real status change can also notify (a repeated match of the same state does not). The main configuration is the Hooks section in Settings (global JSON). A root-level `hooks` block in this file is merged with it. `notify` below is a per-script shorthand:

```yaml
notify:
  onReady:
    sound: default # or error, or sounds/ok.wav inside the project
    toast: true
    # run: yarn launch axe_king s1-1
  onError:
    sound: error
    toast: true
  firstBuild: true # false skips the first ready after this start
  interval: 15 # seconds before the same phase notifies again; 0 disables the wait
```

`sound` plays a built-in tone or a wav. `toast` is a system notification. `run` starts a background command in the project directory (the event JSON is its stdin, and it is killed after 30 seconds by default); it does not open a terminal tab. The speaker button in the title bar and on the panel opens the mute switch and the master volume. Notifications and commands still run when sound is off or the volume is 0. Open the panel from the tray or with Ctrl+Alt+D (the shortcut is in Settings). Empty space drags the panel, and releasing near a screen edge snaps to that edge.

## Hooks for one script

The gear on a main-window script row (left of the panel icon and the star) opens settings for that script. The floating panel has no settings gear. Favorite, long-running, confirm-before-run, output status, and Hooks are written into the project's `.devhub.yaml`. The Hooks JSON matches Settings, except `match` is omitted and stored as this script's name. Order when an event fires: Settings Hooks, the file's root `hooks`, the script entry's `hooks`, then `notify`.

An entry with no `command` does not become a second custom script. It annotates the npm, Maven, or Gradle script of the same name:

```yaml
scripts:
  dev: # an npm script that already exists in package.json
    favorite: true
    confirm: true
    hooks:
      onReady:
        - actions:
            - type: sound
              file: default
            - type: toast
```
