import { schedulePublishedLoadMetrics } from '../publishedPerfBootstrap'
import { isIframeHosted } from './iframeHostedMode'
import { getXsrfToken, XSRF_HEADER_NAME } from './xsrfUtils'

// On-prem iframe-hosted apps run in a sandboxed null-origin iframe whose fetch can't carry the
// session cookie, so they hand each batch to the parent broker over postMessage. Cloud published
// apps POST directly.
const __IFRAME_HOSTED = isIframeHosted()
const __PARENT_ORIGIN =
  new URLSearchParams(window.location.search).get('retool-parent-origin') ?? window.location.origin

type RrMetricTags = Record<string, string> | undefined
type RrMetricPayload =
  | { type: 'increment'; metric: string; tags?: RrMetricTags }
  | { type: 'distribution'; metric: string; value: number; tags?: RrMetricTags }

const METRICS_FLUSH_MS = 10000
const METRICS_MAX_BATCH = 50
const METRICS_MAX_QUEUE = 10000
const METRICS_QUEUE: RrMetricPayload[] = []

// A looping error fires on every tick; cap it before it fills the queue.
const ERROR_RATE_LIMIT_PER_WINDOW = 5
const ERROR_RATE_LIMIT_WINDOW_MS = 60000
const errorRateLimitMap = new Map<string, { count: number; windowStart: number }>()

let publishedLoadTags: Record<string, string> | undefined

export function setPublishedLoadTags(tags: Record<string, string>): void {
  publishedLoadTags = tags
}

export function getPublishedLoadTags(): Record<string, string> {
  return publishedLoadTags ?? { topology: __IFRAME_HOSTED ? 'iframe' : 'cloud' }
}

function publishedMetricsEnabled(): boolean {
  return import.meta.env['VITE_PUBLISHED_MODE'] === 'true'
}

function mapToBeaconPayload(
  method: string,
  stat: string,
  value: number | undefined,
  tags: RrMetricTags,
): RrMetricPayload | null {
  if (method === 'increment') {
    return { type: 'increment', metric: stat, tags: tags ?? undefined }
  }
  if (method === 'distribution' && typeof value === 'number' && Number.isFinite(value)) {
    return { type: 'distribution', metric: stat, value, tags: tags ?? undefined }
  }
  return null
}

async function flushPublishedMetrics(): Promise<void> {
  if (METRICS_QUEUE.length === 0) return
  const payloads = METRICS_QUEUE.splice(0, METRICS_MAX_BATCH)
  if (__IFRAME_HOSTED) {
    // The parent broker stamps the app/user identity and forwards this batch to /_/api/metrics.
    window.parent.postMessage({ type: 'RR_PUBLISHED_PERF_METRICS', payloads }, __PARENT_ORIGIN)
    return
  }
  const metricNames = payloads.map((p) => p.metric)
  const body = JSON.stringify({ payloads })
  try {
    await fetch('/_/api/metrics', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        [XSRF_HEADER_NAME]: getXsrfToken(),
      },
      body,
      keepalive: true,
    })
  } catch (err) {
    console.warn('[rr.published_fe.metrics] flush failed', { count: payloads.length, metrics: metricNames, err })
  }
}

let metricsFlushTimer: number | undefined
function scheduleMetricsFlush(): void {
  if (metricsFlushTimer) return
  metricsFlushTimer = window.setTimeout(() => {
    metricsFlushTimer = undefined
    void flushPublishedMetrics()
  }, METRICS_FLUSH_MS)
}

function isErrorRateLimited(stat: string, tags: RrMetricTags): boolean {
  if (stat !== 'rr.published_fe.app_error') return false
  const key = stat + ':' + (tags?.['source'] ?? '')
  const now = Date.now()
  const entry = errorRateLimitMap.get(key)
  if (!entry || now - entry.windowStart >= ERROR_RATE_LIMIT_WINDOW_MS) {
    errorRateLimitMap.set(key, { count: 1, windowStart: now })
    return false
  }
  entry.count++
  return entry.count > ERROR_RATE_LIMIT_PER_WINDOW
}

export function enqueuePublishedMetric(
  method: string,
  stat: string,
  value: number | undefined,
  tags: RrMetricTags,
): void {
  if (!publishedMetricsEnabled()) return
  if (isErrorRateLimited(stat, tags)) return
  const payload = mapToBeaconPayload(method, stat, value, tags)
  if (!payload) return
  METRICS_QUEUE.push(payload)
  if (METRICS_QUEUE.length > METRICS_MAX_QUEUE) {
    METRICS_QUEUE.splice(0, METRICS_QUEUE.length - METRICS_MAX_QUEUE)
  }
  if (METRICS_QUEUE.length >= METRICS_MAX_BATCH) {
    void flushPublishedMetrics()
    return
  }
  scheduleMetricsFlush()
}

export function bootstrapPublishedMetrics(): void {
  if (import.meta.env['VITE_PUBLISHED_MODE'] !== 'true') return

  schedulePublishedLoadMetrics()
  window.addEventListener('error', () => {
    enqueuePublishedMetric('increment', 'rr.published_fe.app_error', 1, { source: 'window.onerror' })
  })
  window.addEventListener('unhandledrejection', () => {
    enqueuePublishedMetric('increment', 'rr.published_fe.app_error', 1, { source: 'unhandledrejection' })
  })
  window.addEventListener('pagehide', () => {
    void flushPublishedMetrics()
  })
}