import { spawn } from 'child_process'
import type { hookProcessEnv } from '@devhub/shared'
import { shellInvocation } from '../process/pty'

export interface HookCommandRequest {
  command: string
  cwd: string
  timeoutMs: number
  env: ReturnType<typeof hookProcessEnv>
  stdin: string
}

export interface HookProcessSpec {
  file: string
  args: string[]
  /** Windows passes the cmd.exe command line through without Node quoting it again. */
  verbatim: boolean
}

/** The shell invocation a hook command uses, so `.cmd` shims and PATH lookup work. */
export function hookProcessSpec(
  command: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv
): HookProcessSpec {
  const invocation = shellInvocation(command, platform, {
    ...(env.ComSpec ? { ComSpec: env.ComSpec } : {}),
    ...(env.SHELL ? { SHELL: env.SHELL } : {})
  })
  if (typeof invocation.args === 'string') {
    return { file: invocation.file, args: [invocation.args], verbatim: true }
  }
  return { file: invocation.file, args: invocation.args, verbatim: false }
}

function killTree(pid: number | undefined, platform: NodeJS.Platform): void {
  if (!pid) return
  if (platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    })
    killer.on('error', () => undefined)
    killer.unref()
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }
}

/**
 * Runs a hook command in the background. The event JSON is its stdin.
 * The process tree is killed when `timeoutMs` elapses.
 */
export function runHookCommand(request: HookCommandRequest): Promise<void> {
  const platform = process.platform
  const spec = hookProcessSpec(request.command, platform, process.env)
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(spec.file, spec.args, {
        cwd: request.cwd,
        env: { ...process.env, ...request.env },
        stdio: ['pipe', 'ignore', 'ignore'],
        windowsHide: true,
        windowsVerbatimArguments: spec.verbatim,
        // A new process group so the timeout can signal the shell and its children together.
        detached: platform !== 'win32'
      })
    } catch (error) {
      console.warn('[hooks] could not start command', error)
      resolve()
      return
    }
    const timer = setTimeout(() => {
      console.warn(`[hooks] command timed out after ${request.timeoutMs}ms`)
      killTree(child.pid, platform)
    }, request.timeoutMs)
    const finish = (): void => {
      clearTimeout(timer)
      resolve()
    }
    child.on('error', (error) => {
      console.warn('[hooks] command failed', error)
      finish()
    })
    child.on('exit', finish)
    child.stdin?.on('error', () => undefined)
    child.stdin?.end(request.stdin)
  })
}
