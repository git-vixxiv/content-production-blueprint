import { isIframeHosted } from './iframeHostedMode'
import { requestFromParent } from './postMessageRpc'
import { getXsrfToken, XSRF_HEADER_NAME } from './xsrfUtils'

const IFRAME_HOSTED = isIframeHosted()
const PUBLISHED = import.meta.env['VITE_PUBLISHED_MODE'] === 'true'

/** Leaves the app on success. Rejects with a message to show the user when logout isn't possible, such as in embedded apps. */
export async function logout(): Promise<void> {
  if (IFRAME_HOSTED || !PUBLISHED) {
    if (window.parent === window) throw new Error('Logout requires a Retool parent window')
    await requestFromParent(
      IFRAME_HOSTED ? 'RR_ACCOUNT_LOGOUT_REQUEST' : 'RETOOL_PREVIEW_ACCOUNT_LOGOUT',
      {},
    )
    return
  }
  const response = await fetch('/_/api/logout', {
    method: 'POST',
    headers: { [XSRF_HEADER_NAME]: getXsrfToken() },
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error)
  window.location.assign(body.redirectUrl)
}

export function useRetoolAccountAuth(): { logout: () => Promise<void> } {
  return { logout }
}