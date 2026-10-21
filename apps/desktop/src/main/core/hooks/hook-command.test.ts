import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { hookProcessSpec, runHookCommand } from './hook-command'

describe('hookProcessSpec', () => {
  it('uses cmd.exe on Windows and a login shell on Linux', () => {
    expect(hookProcessSpec('yarn dev', 'win32', { ComSpec: 'C:\\Windows\\cmd.exe' })).toEqual({
      file: 'C:\\Windows\\cmd.exe',
      args: ['/d /s /c "yarn dev"'],
      verbatim: true
    })
    expect(hookProcessSpec('yarn dev', 'linux', { SHELL: '/bin/zsh' }).args).toEqual([
      '-lc',
      'yarn dev'
    ])
  })
})

describe('runHookCommand', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('writes the event json to stdin and copies the env vars', async () => {
    dir = await mkdtemp(join(tmpdir(), 'devhub-hook-'))
    const script = join(dir, 'read.js')
    const out = join(dir, 'out.json')
    await writeFile(
      script,
      [
        "const fs = require('fs')",
        "let body = ''",
        "process.stdin.setEncoding('utf8')",
        "process.stdin.on('data', (chunk) => { body += chunk })",
        'process.stdin.on("end", () => {',
        '  fs.writeFileSync(process.argv[2], JSON.stringify({',
        '    body,',
        '    event: process.env.DEVHUB_EVENT,',
        '    project: process.env.DEVHUB_PROJECT,',
        '    script: process.env.DEVHUB_SCRIPT,',
        '    status: process.env.DEVHUB_STATUS,',
        '    code: process.env.DEVHUB_EXIT_CODE',
        '  }))',
        '})'
      ].join('\n')
    )
    await runHookCommand({
      command: `"${process.execPath}" "${script}" "${out}"`,
      cwd: dir,
      timeoutMs: 15_000,
      env: {
        DEVHUB_EVENT: 'onExit',
        DEVHUB_PROJECT: 'axe_king',
        DEVHUB_SCRIPT: '全量dev',
        DEVHUB_STATUS: 'exited',
        DEVHUB_EXIT_CODE: '3'
      },
      stdin: '{"event":"onExit"}'
    })
    expect(JSON.parse(await readFile(out, 'utf8'))).toEqual({
      body: '{"event":"onExit"}',
      event: 'onExit',
      project: 'axe_king',
      script: '全量dev',
      status: 'exited',
      code: '3'
    })
  })
})
