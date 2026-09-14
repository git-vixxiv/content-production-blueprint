import React, { createContext, useContext, useState, useCallback } from 'react'
import { isIframeHosted } from './iframeHostedMode'
import { getXsrfToken, XSRF_HEADER_NAME } from './xsrfUtils'

type AuthResource = {
  name: string
  displayName: string
}

type RetoolAuthContextValue = {
  authRequired: Map<string, AuthResource>
  authRequiredNeedAccess: Map<string, AuthResource>
  addAuthRequired: (resources: AuthResource[]) => void
  addAuthRequiredNeedAccess: (resources: AuthResource[]) => void
  requestReauth: (resourceName: string) => void
}

const RetoolAuthContext = createContext<RetoolAuthContextValue | null>(null)
const parentOrigin = new URLSearchParams(window.location.search).get('retool-parent-origin') ?? window.location.origin
const IFRAME_HOSTED = isIframeHosted()

export function RetoolAuthProvider({ children }: { children: React.ReactNode }) {
  const [authRequired, setAuthRequired] = useState<Map<string, AuthResource>>(new Map())
  const [authRequiredNeedAccess, setAuthRequiredNeedAccess] = useState<Map<string, AuthResource>>(new Map())

  const addAuthRequired = useCallback((resources: AuthResource[]) => {
    setAuthRequired((prev) => {
      const next = new Map(prev)
      for (const resource of resources) {
        next.set(resource.name, resource)
      }
      return next
    })
  }, [])

  const addAuthRequiredNeedAccess = useCallback((resources: AuthResource[]) => {
    setAuthRequiredNeedAccess((prev) => {
      const next = new Map(prev)
      for (const resource of resources) {
        next.set(resource.name, resource)
      }
      return next
    })
  }, [])

  const requestReauth = useCallback((resourceName: string) => {
    if (IFRAME_HOSTED) {
      // Sandboxed null-origin iframe — can't submit the OAuth form itself
      // (CSP form-action 'none', no top-level navigation permission). Hand off
      // to the parent broker which has session/XSRF/resources and will issue
      // the top-level form-POST via navigateToOAuth().
      window.parent.postMessage(
        {
          type: 'RR_OAUTH_RESOURCE',
          requestId: 'oauth-' + Date.now() + '-' + Math.random(),
          resourceName,
        },
        parentOrigin,
      )
      return
    }
    if (import.meta.env['VITE_PUBLISHED_MODE']) {
      // POST to get OAuth params, then JS-submit a form to the main Retool OAuth URL.
      // The form-action CSP on the published app explicitly allows the OAuth origin,
      // so the cross-origin form submission is permitted.
      void (async () => {
        try {
          const response = await fetch('/_/api/oauth/resource', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', [XSRF_HEADER_NAME]: getXsrfToken() },
            body: JSON.stringify({
              resourceName,
              redirectUri: window.location.href.split('#')[0],
              environment: 'production',
            }),
          })
          if (!response.ok) return
          const { oauthAuthorizeUrl, authorizationToken, resourceId, environment, redirectUri, oauthFlowId } =
            await response.json()
          const form = document.createElement('form')
          form.method = 'POST'
          form.action = oauthAuthorizeUrl
          for (const [name, value] of Object.entries({
            authorizationToken,
            resourceId,
            resourceName,
            environment,
            redirectUri,
            oauthFlowId,
          })) {
            if (value != null) {
              const input = document.createElement('input')
              input.type = 'hidden'
              input.name = name
              input.value = String(value)
              form.appendChild(input)
            }
          }
          document.body.appendChild(form)
          form.submit()
        } catch (e) {
          console.error('OAuth reauth failed for resource', resourceName, e)
        }
      })()
    } else {
      window.parent.postMessage({ type: 'RETOOL_AUTH_REQUEST', resourceName }, parentOrigin)
    }
  }, [])

  return (
    <RetoolAuthContext.Provider value={{ authRequired, authRequiredNeedAccess, addAuthRequired, addAuthRequiredNeedAccess, requestReauth }}>
      {children}
    </RetoolAuthContext.Provider>
  )
}

export function useRetoolAuth(): RetoolAuthContextValue {
  const context = useContext(RetoolAuthContext)
  if (!context) {
    throw new Error('useRetoolAuth must be used within a RetoolAuthProvider')
  }
  return context
}