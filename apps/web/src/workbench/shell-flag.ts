/**
 * Shell rollout flag (exploration 0166), mirroring the 0164
 * `xnet:runtime` pattern. Set `localStorage['xnet:shell'] = 'workbench'`
 * to opt into the workbench shell; the legacy header + sidebar shell
 * remains the fallback during rollout.
 */
export type ShellMode = 'workbench' | 'legacy'

export function getShellMode(): ShellMode {
  try {
    return localStorage.getItem('xnet:shell') === 'workbench' ? 'workbench' : 'legacy'
  } catch {
    return 'legacy'
  }
}
