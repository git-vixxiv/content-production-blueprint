import { enqueuePublishedMetric, setPublishedLoadTags, getPublishedLoadTags } from './hooks/publishedMetricsClient'

const IFRAME_HOSTED = import.meta.env['VITE_IFRAME_HOSTED_MODE'] === 'true'
const PUBLISHED = import.meta.env['VITE_PUBLISHED_MODE'] === 'true'

let appEvalCompleteEndMs: number | undefined

function getNavigationResponseEndMs(): number | undefined {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (!nav || nav.responseEnd === 0) return undefined
    return nav.responseEnd
  } catch {
    return undefined
  }
}

/** Called from the entry module immediately before the first root.render(). */
export function markAppEvalCompleteEnd(): void {
  appEvalCompleteEndMs = performance.now()
}

function emitPublishedPerf(
  method: string,
  stat: string,
  value: number | undefined,
  tags: Record<string, string> | undefined,
): void {
  if (!PUBLISHED) return
  // iframe-hosted apps reach the backend through the parent broker; enqueuePublishedMetric
  // routes the batch over postMessage in that mode.
  enqueuePublishedMetric(method, stat, value, tags)
}

function detectBundleLoadWarmth(): 'warm' | 'cold' | 'unknown' {
  try {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const bundleResources = resources.filter((entry) => entry.name && /\.(js|css|mjs)(\?|$)/i.test(entry.name))
    if (bundleResources.length === 0) return 'unknown'
    const allFromCache = bundleResources.every(
      (entry) => entry.transferSize === 0 && entry.decodedBodySize > 0,
    )
    return allFromCache ? 'warm' : 'cold'
  } catch {
    return 'unknown'
  }
}

function setupWebVitals(): void {
  if (typeof PerformanceObserver === 'undefined') return

  function bindLifecycleFlush(report: () => void, abort: AbortController): void {
    window.addEventListener('pagehide', report, { once: true })
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'hidden') report()
      },
      { signal: abort.signal },
    )
  }

  function createReportOnce(onReport: (tags: Record<string, string>) => void, cleanup: () => void) {
    let reported = false
    const abort = new AbortController()
    const report = () => {
      if (reported) return
      reported = true
      onReport(getPublishedLoadTags())
      cleanup()
      abort.abort()
    }
    return { report, abort }
  }

  try {
    const CLS_SETTLE_MS = 5000
    let clsValue = 0
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // layout-shift entries aren't in lib.dom; narrow to the CLS-relevant fields.
        const layoutShift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number }
        if (entry.entryType !== 'layout-shift' || layoutShift.hadRecentInput) continue
        clsValue += layoutShift.value
      }
    })
    const { report: reportCls, abort: clsAbort } = createReportOnce(
      (tags) => emitPublishedPerf('distribution', 'rr.published_fe.web_vitals.cls', clsValue, tags),
      () => clsObserver.disconnect(),
    )
    clsObserver.observe({ type: 'layout-shift', buffered: true })
    // Buffered entries are delivered asynchronously; keep observing through initial app settle.
    window.setTimeout(reportCls, CLS_SETTLE_MS)
    bindLifecycleFlush(reportCls, clsAbort)
  } catch {
    // CLS unsupported in this browser context.
  }

  try {
    let fcpReported = false
    const fcpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name !== 'first-contentful-paint' || fcpReported) continue
        fcpReported = true
        emitPublishedPerf(
          'distribution',
          'rr.published_fe.web_vitals.fcp',
          Math.round(entry.startTime),
          getPublishedLoadTags(),
        )
        fcpObserver.disconnect()
        return
      }
    })
    fcpObserver.observe({ type: 'paint', buffered: true })
  } catch {
    // FCP unsupported in this browser context.
  }

  try {
    let lcpValue = 0
    const lcpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const lcp = entry as PerformanceEntry & { renderTime?: number; loadTime?: number }
        const value = lcp.renderTime || lcp.loadTime || entry.startTime
        if (value > lcpValue) lcpValue = value
      }
    })
    const { report: reportLcp, abort: lcpAbort } = createReportOnce(
      (tags) => {
        if (lcpValue > 0) {
          emitPublishedPerf('distribution', 'rr.published_fe.web_vitals.lcp', Math.round(lcpValue), tags)
        }
      },
      () => lcpObserver.disconnect(),
    )
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true })
    for (const eventType of ['keydown', 'click', 'pointerdown']) {
      window.addEventListener(eventType, reportLcp, { once: true, capture: true, signal: lcpAbort.signal })
    }
    bindLifecycleFlush(reportLcp, lcpAbort)
  } catch {
    // LCP unsupported in this browser context.
  }

  try {
    const INP_DURATION_THRESHOLD = 40
    let inpValue = 0
    const inpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const eventTiming = entry as PerformanceEntry & { duration: number; interactionId?: number }
        if (eventTiming.interactionId && eventTiming.interactionId > 0 && eventTiming.duration > inpValue) {
          inpValue = eventTiming.duration
        }
      }
    })
    const { report: reportInp, abort: inpAbort } = createReportOnce(
      (tags) => {
        if (inpValue > 0) {
          emitPublishedPerf('distribution', 'rr.published_fe.web_vitals.inp', Math.round(inpValue), tags)
        }
      },
      () => inpObserver.disconnect(),
    )
    // durationThreshold isn't in lib.dom PerformanceObserverInit yet.
    inpObserver.observe({
      type: 'event',
      buffered: true,
      durationThreshold: INP_DURATION_THRESHOLD,
    } as PerformanceObserverInit)
    bindLifecycleFlush(reportInp, inpAbort)
  } catch {
    // INP unsupported in this browser context.
  }
}

export function schedulePublishedLoadMetrics(): void {
  requestAnimationFrame(() => {
    const warmth = detectBundleLoadWarmth()
    const loadTags = {
      bundle_load: warmth,
      topology: IFRAME_HOSTED ? 'iframe' : 'cloud',
    }
    setPublishedLoadTags(loadTags)
    const responseEndMs = getNavigationResponseEndMs()
    if (responseEndMs !== undefined && appEvalCompleteEndMs !== undefined) {
      const appEvalCompleteMs = Math.round(appEvalCompleteEndMs - responseEndMs)
      emitPublishedPerf('distribution', 'rr.published_fe.app_eval_complete', appEvalCompleteMs, loadTags)
    }
    if (responseEndMs !== undefined) {
      const initialRenderMs = Math.round(performance.now() - responseEndMs)
      emitPublishedPerf('distribution', 'rr.published_fe.initial_render_ms', initialRenderMs, loadTags)
    }

    const reportNavigationToLoad = () => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      if (!nav || nav.loadEventEnd === 0) return
      emitPublishedPerf(
        'distribution',
        'rr.published_fe.navigation_to_load_ms',
        Math.round(nav.loadEventEnd - nav.startTime),
        loadTags,
      )
    }
    if (document.readyState === 'complete') {
      reportNavigationToLoad()
    } else {
      window.addEventListener('load', reportNavigationToLoad, { once: true })
    }

    setupWebVitals()
  })
}