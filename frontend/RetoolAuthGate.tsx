import React, { useEffect, useState } from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import { useRetoolAuth } from '../hooks/useRetoolAuth'

export function RetoolAuthGate({ children }: { children: React.ReactNode }) {
  const { authRequired, authRequiredNeedAccess, requestReauth } = useRetoolAuth()

  const hasAuthIssues = authRequired.size > 0 || authRequiredNeedAccess.size > 0

  // Dismissal is transient: it resets only when the set of resources requiring auth changes, so the
  // modal can be re-invoked after being closed. Keyed on the sorted resource names rather than the
  // Map identity, so a rerun/retry/poll reporting the same resources keeps the modal dismissed.
  const authRequiredKey = Array.from(authRequired.keys()).sort().join('\u0000')
  const authRequiredNeedAccessKey = Array.from(authRequiredNeedAccess.keys()).sort().join('\u0000')
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    setDismissed(false)
  }, [authRequiredKey, authRequiredNeedAccessKey])
  const showModal = hasAuthIssues && !dismissed

  return (
    <>
      {children}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.4)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '24px 28px',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '12px',
                margin: '0 0 8px 0',
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: 600,
                  color: '#111827',
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                }}
              >
                Re-authentication Required
              </h2>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                aria-label="Dismiss"
                title="Dismiss"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px',
                  padding: '2px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#6b7280',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>
            <p
              style={{
                margin: '0 0 16px 0',
                fontSize: '14px',
                color: '#6b7280',
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              }}
            >
              This app requires access to the following data sources.
            </p>
            <div
              style={{
                border: '1px solid #e5e5e5',
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              {Array.from(authRequired.values()).map((resource, index) => (
                <div
                  key={resource.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderBottom: (index < authRequired.size - 1 || authRequiredNeedAccess.size > 0) ? '1px solid #e5e5e5' : 'none',
                  }}
                >
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 400,
                      color: '#1f2937',
                      fontFamily: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
                    }}
                  >
                    {resource.displayName}
                  </span>
                  <button
                    type="button"
                    onClick={() => requestReauth(resource.name)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '4px 12px',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                    }}
                  >
                    Re-authenticate
                    <ArrowUpRight size={12} />
                  </button>
                </div>
              ))}
              {Array.from(authRequiredNeedAccess.values()).map((resource, index, arr) => (
                <div
                  key={resource.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderBottom: index < arr.length - 1 ? '1px solid #e5e5e5' : 'none',
                  }}
                >
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 400,
                      color: '#1f2937',
                      fontFamily: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
                    }}
                  >
                    {resource.displayName}
                  </span>
                  <span
                    title="You need access to this resource to re-authenticate"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: '#e5e7eb',
                      color: '#6b7280',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '4px 12px',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'default',
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                    }}
                  >
                    Access required
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}