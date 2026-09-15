import { useState, useEffect } from 'react'
import { isIframeHosted } from './iframeHostedMode'
import { requestFromParent } from './postMessageRpc'
import { getXsrfToken, XSRF_HEADER_NAME } from './xsrfUtils'

type CurrentUser = {
  id: number
  email: string
  firstName: string
  lastName: string
  fullName: string
  profilePhotoUrl: string | null
  groups: Array<{ id: number; name: string }>
  metadata: Record<string, unknown>
  sid: string
  externalIdentifier: string | null
  locale: string
}

const IFRAME_HOSTED = isIframeHosted()
const PUBLISHED = import.meta.env['VITE_PUBLISHED_MODE'] === 'true' ? true : false

async function fetchCurrentUser(): Promise<CurrentUser> {
  if (IFRAME_HOSTED) {
    // Sandboxed null-origin iframe — no cookies on subresource fetches. Ask the parent broker.
    const reply = await requestFromParent<{ ok: boolean; user: CurrentUser }>('RR_CURRENT_USER_REQUEST', {})
    return reply.user
  }
  const url = PUBLISHED
    ? '/_/api/current-user'
    : `${import.meta.env['BASE_URL']}retool-api/current-user`
  const init: RequestInit = PUBLISHED
    ? { headers: { [XSRF_HEADER_NAME]: getXsrfToken() } }
    : {}
  const res = await fetch(url, init)
  if (!res.ok) throw new Error('Failed to fetch current user')
  return res.json()
}

export function useCurrentUser(): { user: CurrentUser | null; loading: boolean } {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    fetchCurrentUser()
      .then((data) => {
        if (cancelled) return
        setUser(data)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setUser(null)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { user, loading }
}