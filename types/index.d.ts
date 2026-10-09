export type StatusLine = string | null

declare module 'claude-code' {
  interface PluginState {
    'multi-account': { line: StatusLine }
  }
}
