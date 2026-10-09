import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

// Строка под полем ввода (PromptHint tail): «👤 <email> [<profile>] · <model> · <folder>».
// Не через $.ui.status: его движок рисует как закреплённое предупреждение (⚠ + имя плагина).
// Аккаунт читается из .claude.json активной папки конфига: $CLAUDE_CONFIG_DIR, иначе $HOME.
// Профиль показывается только для второстепенных папок (~/.claude-work → work).

const REFRESH_MS = 15_000

const line = atom({ plugin: 'multi-account', key: 'line' } as const, null)

const basename = (path: string) => path.replace(/\/+$/, '').split('/').pop() ?? path

const profileOf = (configDir: string | undefined) =>
  configDir ? basename(configDir).replace(/^\.?claude-?/, '') || basename(configDir) : undefined

async function accountEmail($: EngineInterface, configDir: string | undefined) {
  const home = await $.env.get('HOME')
  const file = `${configDir ?? home}/.claude.json`
  try {
    const config = JSON.parse(await $.fs.read(file))
    return config?.oauthAccount?.emailAddress ?? 'не залогинен'
  } catch {
    return 'не залогинен'
  }
}

export async function statusText($: EngineInterface) {
  const configDir = await $.env.get('CLAUDE_CONFIG_DIR')
  const [email, model, cwd] = await Promise.all([
    accountEmail($, configDir),
    $.session.model(),
    $.session.cwd(),
  ])
  const profile = profileOf(configDir)
  const account = profile ? `${email} [${profile}]` : email
  return [`👤 ${account}`, model, basename(cwd)].filter(Boolean).join(' · ')
}

async function refresh($: EngineInterface) {
  const text = await statusText($)
  // Запись перерисовывает строку подсказки; одинаковое значение не трогаем.
  if ((await read($, line)) !== text) await update($, line, () => text)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    $.ui.status(undefined) // убрать строку, оставшуюся от версии 0.1.0
    await refresh($)
    // Подхватывает /login, /model и смену папки без ожидания конца хода.
    $.clock.every(REFRESH_MS, () => void refresh($))
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const text = await read($, line)
    return text ? next({ ...e, props: { ...e.props, tail: `  ${text}` } }) : next(e)
  })
}
