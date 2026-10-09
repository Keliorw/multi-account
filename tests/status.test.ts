import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

type Setup = { env: Record<string, string>; files: Record<string, string>; model: string; cwd: string }

const config = (email: string) => JSON.stringify({ oauthAccount: { emailAddress: email } })

// Движок под плагином: env, файлы, модель и папка сессии; возвращает хвост строки подсказки, который дописал плагин.
function engine($: Engine, on: On, setup: Setup) {
  let tail: string | undefined
  mock.env(on, setup.env)
  mock.clock(on)
  on('fs.read', ($, e) => {
    const text = setup.files[e.path]
    return text === undefined ? { deny: `ENOENT ${e.path}` } : { value: text }
  })
  on('session.model', () => ({ value: setup.model }))
  on('session.cwd', () => ({ value: setup.cwd }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    tail = e.props.tail
    return { type: 'Text', children: [e.props.hint] }
  })
  return async () => {
    await $.ui.render({ surface: 'terminal', component: 'PromptHint', requestId: 'hint', props: HINT })
    return tail?.trim()
  }
}

const HINT = { isDraft: false, isWorking: false, hint: '? for shortcuts' }

const start = { cwd: '/', surface: 'terminal', isInteractive: true } as const

test('основной профиль: email из ~/.claude.json, без метки', async ($, on) => {
  const status = engine($, on, {
    env: { HOME: '/home/u' },
    files: { '/home/u/.claude.json': config('main@example.com') },
    model: 'Opus 5.5',
    cwd: '/home/u/Projects/app',
  })
  await $.session.start(start)
  expect(await status()).toBe('👤 main@example.com · Opus 5.5 · app')
})

test('дополнительный профиль: email из $CLAUDE_CONFIG_DIR и метка [work]', async ($, on) => {
  const status = engine($, on, {
    env: { HOME: '/home/u', CLAUDE_CONFIG_DIR: '/home/u/.claude-work' },
    files: {
      '/home/u/.claude.json': config('main@example.com'),
      '/home/u/.claude-work/.claude.json': config('work@example.com'),
    },
    model: 'Sonnet 5.5',
    cwd: '/srv/repo/',
  })
  await $.session.start(start)
  expect(await status()).toBe('👤 work@example.com [work] · Sonnet 5.5 · repo')
})

test('не залогинен: в профиле нет .claude.json', async ($, on) => {
  const status = engine($, on, {
    env: { HOME: '/home/u', CLAUDE_CONFIG_DIR: '/home/u/.claude-2' },
    files: {},
    model: 'Opus 5.5',
    cwd: '/x/y',
  })
  await $.session.start(start)
  expect(await status()).toBe('👤 не залогинен [2] · Opus 5.5 · y')
})
