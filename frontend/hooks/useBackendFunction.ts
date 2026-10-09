import { useState, useCallback, useRef, useEffect } from 'react'
import type { DataAccessError, ExecuteHandle, ReauthInfo } from './consumeExecuteStream'
import { consumeExecuteStreamDeferred, makeExecuteHandle } from './consumeExecuteStream'
import { isIframeHosted } from './iframeHostedMode'
import { executeOverPostMessage } from './postMessageRpc'
import { enqueuePublishedMetric, getPublishedLoadTags } from './publishedMetricsClient'
import { useRetoolAuth } from './useRetoolAuth'
import { getXsrfToken, XSRF_HEADER_NAME } from './xsrfUtils'

const __cache = new Map<string, { data: any; cachedAt: number }>()
const __CACHE_TTL_MS = 300_000
const __CACHE_MAX_ENTRIES = 50
const __previewParentOrigin = new URLSearchParams(window.location.search).get('retool-parent-origin') ?? window.location.origin
const __IFRAME_HOSTED = isIframeHosted()
const __PUBLISHED = import.meta.env['VITE_PUBLISHED_MODE']

type ExecutePayload = {
  functionName: string
  params: Record<string, unknown> | undefined
  environment: string
  commitSha: string
}

// Classify first-execute metrics as load- vs interaction-triggered (trigger_origin tag).
// Two complementary detectors — OR'd at read time in __rrHasUserInteracted():
// 1. DOM event listeners below: fallback where navigator.userActivation has partial
//    Safari/Firefox support and may stay false after a real click/keypress.
// 2. Live navigator.userActivation.hasBeenActive at execute time: catches activation
//    the listeners can miss (e.g. before they attached, or activation types we do not listen for).
let __rrUserInteractionEventListenerFired = false

let __rrInteractionAbort: AbortController | undefined

function __rrOnUserInteractionEvent(): void {
  if (__rrUserInteractionEventListenerFired) return
  __rrUserInteractionEventListenerFired = true
  __rrInteractionAbort?.abort()
}

if (typeof window !== 'undefined') {
  __rrInteractionAbort = new AbortController()
  const __rrInteractionOpts = { capture: true, passive: true, signal: __rrInteractionAbort.signal } as const
  for (const eventName of ['pointerdown', 'keydown', 'click', 'touchstart'] as const) {
    window.addEventListener(eventName, __rrOnUserInteractionEvent, __rrInteractionOpts)
  }
}

function __rrHasUserInteracted(): boolean {
  return (
    __rrUserInteractionEventListenerFired ||
    (typeof navigator !== 'undefined' &&
      'userActivation' in navigator &&
      navigator.userActivation?.hasBeenActive === true)
  )
}

function __rrResponseEndAnchorMs(nav: PerformanceNavigationTiming | undefined): number {
  if (!nav) return 0
  if (nav.responseEnd !== 0) return nav.responseEnd
  if (nav.responseStart !== 0) return nav.responseStart
  return nav.startTime
}

let __rrFirstExecuteV2Reported = false
function __rrReportFirstExecuteV2Latency(): void {
  if (__rrFirstExecuteV2Reported) return
  __rrFirstExecuteV2Reported = true
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  const nowMs = performance.now()
  const navStartMs = nav?.startTime ?? 0
  const responseEndAnchorMs = __rrResponseEndAnchorMs(nav)
  const triggerOrigin = __rrHasUserInteracted() ? 'interaction' : 'load'
  const tags = { ...getPublishedLoadTags(), trigger_origin: triggerOrigin }
  enqueuePublishedMetric(
    'distribution',
    'rr.published_fe.navigation_to_first_execute_ms',
    Math.round(nowMs - navStartMs),
    tags,
  )
  enqueuePublishedMetric(
    'distribution',
    'rr.published_fe.response_end_to_first_execute_ms',
    Math.round(nowMs - responseEndAnchorMs),
    tags,
  )
}

function __rrShouldReportFnExecuteMetrics(): boolean {
  return __IFRAME_HOSTED || !!__PUBLISHED
}

function __rrReportFnExecuteMetrics(durationMs: number, ok: boolean): void {
  if (!__rrShouldReportFnExecuteMetrics()) return
  const baseTags = getPublishedLoadTags()
  enqueuePublishedMetric(
    'distribution',
    'rr.published_fe.fn_execute_duration_ms',
    durationMs,
    { ...baseTags, ok: ok ? 'true' : 'false' },
  )
  if (!ok) {
    enqueuePublishedMetric('increment', 'rr.published_fe.fn_execute_error', 1, baseTags)
  }
}

function __rrReportFnExecuteTtfbMetric(durationMs: number): void {
  if (!__rrShouldReportFnExecuteMetrics()) return
  enqueuePublishedMetric(
    'distribution',
    'rr.published_fe.fn_execute_ttfb_ms',
    durationMs,
    getPublishedLoadTags(),
  )
}

async function executeRequest(payload: ExecutePayload): Promise<Response> {
  __rrReportFirstExecuteV2Latency()
  if (__IFRAME_HOSTED) {
    return executeOverPostMessage('RR_FN_EXECUTE_V2', payload)
  }
  if (__PUBLISHED) {
    return fetch('/_/api/executeV2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [XSRF_HEADER_NAME]: getXsrfToken() },
      body: JSON.stringify(payload),
    })
  }
  return fetch(`${import.meta.env['BASE_URL']}retool-api/executeV2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ functionName: payload.functionName, params: payload.params }),
  })
}

function __writeCache(key: string, data: any): void {
  __cache.delete(key)
  if (__cache.size >= __CACHE_MAX_ENTRIES) {
    const oldest = __cache.keys().next().value
    if (oldest) __cache.delete(oldest)
  }
  __cache.set(key, { data, cachedAt: Date.now() })
}

function __makeCacheKey(functionName: string, params?: Record<string, unknown>): string {
  const sortedParams = params
    ? JSON.stringify(Object.fromEntries(Object.entries(params).sort()))
    : '{}'
  return `${functionName}::${sortedParams}`
}

function __emitExecutionRecord(
  functionName: string,
  filePath: string,
  params: Record<string, unknown> | undefined,
  result: any,
  error: string | undefined,
  durationMs: number,
): void {
  window.parent.postMessage(
    {
      type: 'RETOOL_RUNTIME_EXECUTION_RECORD',
      functionName,
      filePath,
      params: params ?? {},
      result,
      error,
      durationMs,
    },
    __previewParentOrigin,
  )
}

/**
 * Hook for calling a backend function by name.
 *
 * `trigger(params)` returns a handle with two surfaces:
 *   - `.result`: Promise resolving to the function's final return value
 *     (scalar functions) or an array of all yielded values (iterable
 *     functions). This is the canonical output.
 *   - `.stream`: AsyncIterable of the function's explicit yields, intended
 *     only as a live render helper while the function is still running.
 *     Scalar functions never yield, so `.stream` closes empty for them.
 *
 * Always consume `.result` — either `await trigger(params).result`
 * or read the hook's `data` after the call settles. `.stream` may be
 * consumed *in addition to* `.result` for incremental UI, but NEVER on
 * its own: a `.stream`-only consumer will silently observe nothing for
 * scalar functions and cannot distinguish "no yields" from "errored".
 *
 * @deprecated The handle is also directly awaitable — `await trigger(params)`
 * resolves to the same value as `.result`. This shorthand is deprecated and
 * will be removed in a future release; use `.result` or `.stream` explicitly.
 *
 * Calling the hook does not call the function. `data` is `null` until a
 * `trigger()` settles, and stays `null` if nothing ever calls it — a page
 * that reads `data` without triggering renders its empty state forever, with
 * no error anywhere to say why. To load when the component mounts:
 *
 *     const { data, loading, error, trigger } = useGetTodos()
 *     useEffect(() => {
 *       trigger()
 *     }, [trigger])
 *
 * Mutations are the exception: they trigger from their event handler, so they
 * stay untriggered until the user acts.
 *
 * `data` is the backend function's resolved return value, with nothing
 * unwrapped. A function declaring `Promise<{ data: Todo[] }>` puts that whole
 * object in `data`, so the rows are at `data.data` and `data` itself is not
 * an array. When `data` does not match the type you expect, fix the access
 * path — casting it silences the type error and leaves the runtime bug.
 *
 * @param options.cachePolicy - Set to 'stale-while-revalidate' to cache results and
 *   return them instantly on subsequent calls while revalidating in the background.
 *   Only use this for read-only / non-mutative functions (e.g. SELECT queries, GET requests).
 *   Do NOT use for functions that create, update, or delete data.
 */
export function useBackendFunction(
  functionName: string,
  options?: { cachePolicy?: 'stale-while-revalidate' },
) {
  const { addAuthRequired, addAuthRequiredNeedAccess } = useRetoolAuth()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dataAccessErrors, setDataAccessErrors] = useState<DataAccessError[]>([])
  const handlersRef = useRef<Set<(event: MessageEvent) => void>>(new Set())
  useEffect(() => {
    return () => {
      handlersRef.current.forEach((h) => window.removeEventListener('message', h))
      handlersRef.current.clear()
    }
  }, [])
  const cachePolicy = options?.cachePolicy

  const trigger = useCallback(
    (params?: Record<string, unknown>, triggerOptions?: { skipCache?: boolean }): ExecuteHandle<any> => {
      const cacheEnabled = cachePolicy === 'stale-while-revalidate'
      const cacheKey = cacheEnabled ? __makeCacheKey(functionName, params) : null
      const skipCache = triggerOptions?.skipCache ?? false

      let cachedData: any = undefined
      let hasCacheHit = false
      if (cacheKey && !skipCache) {
        const entry = __cache.get(cacheKey)
        if (entry) {
          if (Date.now() - entry.cachedAt < __CACHE_TTL_MS) {
            __cache.delete(cacheKey)
            __cache.set(cacheKey, entry)
            hasCacheHit = true
            cachedData = entry.data
            setData(cachedData)
          } else {
            __cache.delete(cacheKey)
          }
        }
      }

      const onReauth = (info: ReauthInfo): void => {
        if (info.resources) addAuthRequired(info.resources)
        if (info.resourcesRequiringAccess) addAuthRequiredNeedAccess(info.resourcesRequiringAccess)
      }
      const onDataAccessErrors = (errors: DataAccessError[]): void => {
        setDataAccessErrors(errors)
      }

      // Chain: wait for HITL approval (editor only) → fetch → stream.
      // Published modes (cloud and iframe-hosted) skip HITL — the parent session is the authority.
      const responsePromise = (async (): Promise<Response> => {
        const requestId = `${functionName}-${Date.now()}-${Math.random()}`
        if (!__PUBLISHED) {
          await new Promise<void>((resolve, reject) => {
            const handler = (event: MessageEvent) => {
              if (event.source !== window.parent || event.origin !== __previewParentOrigin) return
              if (event.data?.type === 'RETOOL_BACKEND_APPROVAL' && event.data?.requestId === requestId) {
                window.removeEventListener('message', handler)
                handlersRef.current.delete(handler)
                if (event.data.approved !== false) resolve()
                else reject(new Error(event.data.error || 'Function execution was rejected by user'))
              }
            }
            handlersRef.current.add(handler)
            window.addEventListener('message', handler)
            window.parent.postMessage(
              { type: 'RETOOL_BACKEND_AGENT_FUNCTION', requestId, functionName, params },
              __previewParentOrigin,
            )
          })
        }

        let commitSha = import.meta.env['VITE_COMMIT_SHA']

        if (typeof commitSha !== 'string') {
          commitSha = ''
        }

        return executeRequest({
          functionName,
          params,
          environment: 'production',
          commitSha
        })
      })()

      const startTime = Date.now()
      // onFirstOutput runs on the result-channel read hot path — enqueue metrics only.
      const onFirstOutput = () => __rrReportFnExecuteTtfbMetric(Date.now() - startTime)
      const handle = consumeExecuteStreamDeferred<any>(responsePromise, onReauth, onFirstOutput, onDataAccessErrors)

      // Wire effects: update data/loading/error, write-through cache, emit execution record.
      handle.result
        .then((value) => {
          const durationMs = Date.now() - startTime
          if (cacheKey) __writeCache(cacheKey, value)
          setData(value)
          setLoading(false)
          __emitExecutionRecord(functionName, functionName, params, value, undefined, durationMs)
          __rrReportFnExecuteMetrics(durationMs, true)
        })
        .catch((err) => {
          const durationMs = Date.now() - startTime
          const msg = err?.message ?? String(err)
          setError(msg)
          setLoading(false)
          __emitExecutionRecord(functionName, functionName, params, undefined, msg, durationMs)
          __rrReportFnExecuteMetrics(durationMs, false)
        })

      if (hasCacheHit) {
        setError(null)
        setDataAccessErrors([])
        // Revalidate in background; caller still gets the cached value synchronously.
        return makeExecuteHandle<any>(Promise.resolve(cachedData))
      }

      setLoading(true)
      setError(null)
      setDataAccessErrors([])
      return handle
    },
    [functionName, cachePolicy, addAuthRequired, addAuthRequiredNeedAccess],
  )

  return { data, loading, error, dataAccessErrors, trigger }
}