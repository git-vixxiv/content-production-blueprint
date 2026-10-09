export const XSRF_HEADER_NAME = 'x-rr-xsrf-token'

export function getXsrfToken(): string {
  const cookies = Object.fromEntries(
    document.cookie.split('; ').map(c => {
      const idx = c.indexOf('=')
      return [c.slice(0, idx), c.slice(idx + 1)]
    })
  )
  return cookies['__Host-rr-xsrf'] ?? cookies['rr-xsrf'] ?? ''
}