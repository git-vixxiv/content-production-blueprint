// Lazy + fallback: this module is included in every cloud R² bundle (not tree-shaken)
// despite VITE_IFRAME_HOSTED_MODE being false.

function getParentOrigin(): string {
  return new URLSearchParams(window.location.search).get('retool-parent-origin') ?? window.location.origin
}

function rpcId(prefix: string): string {
  return prefix + '-' + Date.now() + '-' + Math.random()
}

/**
 * One-shot request/response over postMessage. The parent must reply with a
 * message whose type is the request's type with `_REQUEST` replaced by
 * `_RESPONSE` (or suffixed `_RESPONSE` if no `_REQUEST` suffix), carrying
 * the same requestId.
 */
export function requestFromParent<T extends { ok: boolean; error?: string }>(
  type: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const parentOrigin = getParentOrigin()
  const requestId = rpcId(type)
  const responseType = type.endsWith('_REQUEST')
    ? type.replace(/_REQUEST$/, '_RESPONSE')
    : type + '_RESPONSE'

  return new Promise<T>((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== parentOrigin) return
      const data = event.data
      if (data == null || data.type !== responseType || data.requestId !== requestId) return
      window.removeEventListener('message', handler)
      if (data.ok) resolve(data as T)
      else reject(new Error(data.error || 'parent broker error'))
    }
    window.addEventListener('message', handler)
    window.parent.postMessage({ type, requestId, ...payload }, parentOrigin)
  })
}

/**
 * Request a fetch-equivalent from the parent and reconstruct a Response from a
 * fully-drained binary body. Downstream consumers see a normal Response —
 * `.json()` for V1, `consumeExecuteStreamDeferred` for V2.
 *
 * The body crosses postMessage as an ArrayBuffer because V2 is a multiplexed
 * binary protocol; text-encoding the body would corrupt frame headers.
 * `new Response(buffer)` exposes the bytes as a readable stream that the
 * demuxer can consume identically to a network response.
 *
 * No incremental streaming: the parent fully consumes the upstream response
 * before posting, so V2 stream consumers see all frames at once when the
 * parent's fetch settles.
 */
export function executeOverPostMessage(
  type: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  return requestFromParent<{
    ok: boolean
    status: number
    contentType: string
    body: ArrayBuffer
    error?: string
  }>(type, payload).then((reply) => new Response(reply.body, {
    status: reply.status,
    headers: { 'content-type': reply.contentType },
  }))
}