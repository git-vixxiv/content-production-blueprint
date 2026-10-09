const mq = window.matchMedia('(prefers-color-scheme: dark)')
let mode: 'light' | 'dark' | 'system' = 'system'

if (!import.meta.env['VITE_PUBLISHED_MODE']) {
  const params = new URLSearchParams(window.location.search)
  const urlTheme = params.get('retool-theme')
  if (urlTheme === 'light' || urlTheme === 'dark') mode = urlTheme
}

const applyDarkMode = () => {
  const isDark = mode === 'dark' || (mode === 'system' && mq.matches)
  document.documentElement.classList.toggle('dark', isDark)
}
applyDarkMode()
mq.addEventListener('change', applyDarkMode)

if (!import.meta.env['VITE_PUBLISHED_MODE']) {
  const expectedParentOrigin = new URLSearchParams(window.location.search).get('retool-parent-origin') ?? window.location.origin
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.origin !== expectedParentOrigin) return
    const data = event?.data
    if (!data || data.type !== 'retool-theme-change') return
    const next = data.theme
    if (next === 'light' || next === 'dark' || next === 'system') {
      mode = next
      applyDarkMode()
    }
  })
}