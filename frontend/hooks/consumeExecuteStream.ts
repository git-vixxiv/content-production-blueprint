// @ts-ignore — sibling module has no type declarations under sandbox tsconfig.
import { setup as dbcsSetup } from '../lib/dbcsTransform'

type DbcsTransform = (body: Uint8Array, headers: Record<string, string | string[] | undefined>) => Promise<unknown>
type DbcsSetupConfig = { flattenRestApiBinaryResponses: boolean }
const _dbcsSetup = dbcsSetup as (config: DbcsSetupConfig) => { transform: DbcsTransform }

type ResourceAuthFlow = 'authorization_code' | 'client_credentials' | 'authorization_code_pkce'
type ReauthResource = { name: string; displayName: string; authFlow?: ResourceAuthFlow }
export type ReauthInfo = {
  resources?: ReauthResource[]
  resourcesRequiringAccess?: ReauthResource[]
}
export type DataAccessError = {
  source: 'data_access_policy'
  name: string
  displayName: string
  message: string
  reason?: string
  reasonCode?: string
}

/**
 * Dual-consumption handle returned by `consumeExecuteStream` and friends.
 *
 * - `.result` is a Promise resolving to the aggregated output: the scalar
 *   value for scalar functions, the array of yields for iterable functions.
 *   Always populated regardless of shape — `.result` is the universal "final
 *   value" surface.
 * - `.stream` is an AsyncIterable reflecting the function's explicit yields.
 *   Iterable functions yield each value in order then close. Scalar functions
 *   do not yield — the stream closes immediately without emitting anything.
 *   Rejects on terminal error regardless of shape.
 *
 * @deprecated The handle is also directly awaitable — `await handle` is
 * equivalent to `await handle.result`. This shorthand is deprecated and will
 * be removed in a future release; use `.result` or `.stream` explicitly.
 */
export type ExecuteHandle<T> = Promise<T> & {
  result: Promise<T>
  stream: AsyncIterable<T>
}

const CHANNEL_STDOUT = 0x01
const CHANNEL_STDERR = 0x02
const CHANNEL_RESULT = 0x03
const CHANNEL_METADATA = 0x04
const CHANNEL_HEADERS = 0x05
const CHANNEL_TERMINAL = 0x06

const PROGRESSIVELY_PARSEABLE_CONTENT_TYPES = new Set(['application/x-ndjson'])
function isProgressivelyParseable(contentType: string): boolean {
  const normalized = (contentType.toLowerCase().split(';')[0] || '').trim()
  return PROGRESSIVELY_PARSEABLE_CONTENT_TYPES.has(normalized)
}

// Opt-in header attached by `sql-client.queryStreamRaw`; mirrored from
// X_RETOOL_SQL_COLUMNAR_TO_ROWS_HEADER in retoolReactExecuteEvents.ts.
const COLUMNAR_TO_ROWS_HEADER = 'x-retool-sql-columnar-to-rows'
// Mirrors X_DBCS_ENABLED in @tryretool/common/dbcs-headers. `makeQuery`
// reads this same header to gate its `{ data: <unwrapped> }` envelope.
const DBCS_ENABLED_HEADER = 'x-dbcs-enabled'

/**
 * Mirrors `isColumnarData` and `columnarToRows` from
 * @tryretool/common/retoolReactAgent/utils/formatQueryData. Inlined because
 * the sandbox sibling cannot import from the package; the implementations
 * are tiny and run only on the buffered DBCS path.
 */
function isColumnarShape(data: unknown): data is Record<string, unknown[]> {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return false
  const keys = Object.keys(data as Record<string, unknown>)
  if (keys.length === 0) return false
  const values = Object.values(data as Record<string, unknown>)
  if (!values.every(Array.isArray)) return false
  const firstLength = (values[0] as unknown[]).length
  return values.every((arr) => (arr as unknown[]).length === firstLength)
}
function columnarToRows(data: Record<string, unknown[]>): Record<string, unknown>[] {
  const keys = Object.keys(data)
  const firstKey = keys[0]
  if (firstKey === undefined) return []
  const numRows = (data[firstKey] as unknown[]).length
  const rows: Record<string, unknown>[] = []
  for (let i = 0; i < numRows; i++) {
    const row: Record<string, unknown> = {}
    for (const key of keys) {
      row[key] = (data[key] as unknown[])[i]
    }
    rows.push(row)
  }
  return rows
}
/**
 * Mirrors `unsafelyStrip` in
 * `packages/jse-libraries/resource-query/src/index.ts` — wraps `value` in
 * `{ data: value.data ?? value }`, the legacy extraction `makeQuery`
 * applies to non-DBCS JSON responses. Composed after the outer
 * `__retoolWrappedQuery__` peel (done inside `_dbcsSetup().transform()`)
 * so the REST/OpenAPI inner `{ data, metadata }` envelope is stripped to
 * match the legacy `makeQuery` contract. See that source file for the
 * over-strip risk trade-off and per-connector analysis.
 */
function unsafelyStrip(parsed: unknown): { data: unknown } {
  return { data: (parsed as { data?: unknown } | null)?.data ?? parsed }
}
const CONTROL_CHANNEL = 0x00
const FRAME_HEADER_SIZE = 13
const EVENT_CHANNEL_END = 0x01
const EVENT_CHANNEL_ERROR = 0x02

/**
 * Build a handle that satisfies both the awaitable (`await trigger(...)`)
 * and dual-consumption (`.result` / `.stream`) contracts.
 *
 * If `stream` is omitted, the handle's `.stream` is empty — it closes
 * immediately on first `.next()` without yielding anything. This matches
 * the scalar-shape contract: scalars have no per-yield data to surface.
 * Callers with progressive values to expose must pass a real stream.
 */
export function makeExecuteHandle<T>(result: Promise<T>, stream?: AsyncIterable<T>): ExecuteHandle<T> {
  // Mark `result` as observed so it doesn't trigger an unhandled-rejection
  // warning/crash if the caller discards the handle or only consumes
  // `.stream`. This is an observer, not a suppressor — callers that attach
  // their own `.then` / `.catch` / `await` still receive the rejection.
  result.catch(() => {})
  const effectiveStream: AsyncIterable<T> =
    stream ??
    {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<T>> {
            return Promise.resolve({ value: undefined as unknown as T, done: true })
          },
        }
      },
    }
  return Object.assign(
    { result, stream: effectiveStream },
    {
      then: result.then.bind(result),
      catch: result.catch.bind(result),
      finally: result.finally.bind(result),
    },
  ) as unknown as ExecuteHandle<T>
}

/**
 * Deferred variant — takes a `Promise<Response>` that is still in flight
 * (e.g. an HITL-approved fetch) and returns a handle whose `.result` and
 * `.stream` await the inner stream once the Response arrives.
 *
 * Lets callers hand back a synchronous, consumable handle from a function
 * whose actual work starts asynchronously. Equivalent to composing
 * `makeExecuteHandle` with `consumeExecuteStream` once the Response lands.
 *
 * @param onFirstOutput Optional hook fired synchronously on the first non-empty
 *   result-channel read. Intended only for enqueueing lightweight metrics; must
 *   not perform I/O or other long work — it runs on the stream-read hot path.
 */
export function consumeExecuteStreamDeferred<T>(
  responsePromise: Promise<Response>,
  onReauth: (info: ReauthInfo) => void,
  onFirstOutput?: () => void,
  onDataAccessErrors?: (errors: DataAccessError[]) => void,
): ExecuteHandle<T> {
  const innerHandle = responsePromise.then((response) =>
    consumeExecuteStream<T>(response, onReauth, onFirstOutput, onDataAccessErrors),
  )
  const result: Promise<T> = innerHandle.then((h) => h.result)
  const stream: AsyncIterable<T> = {
    [Symbol.asyncIterator]() {
      let inner: AsyncIterator<T> | null = null
      return {
        async next() {
          if (!inner) inner = (await innerHandle).stream[Symbol.asyncIterator]()
          return inner.next()
        },
      }
    },
  }
  return makeExecuteHandle<T>(result, stream)
}

interface ChannelReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>
  cancel(reason?: Error): void
}

interface ChannelQueue {
  buffered: Uint8Array[]
  closed: boolean
  errored: Error | null
  waiter: ((r: { done: boolean; value?: Uint8Array }) => void) | null
  rejecter: ((err: Error) => void) | null
}

/**
 * Inlined demuxer. Reads multiplexed frames from a Response body and exposes
 * per-channel `ChannelReader`s whose `read()` resolves with the next
 * payload bytes (or done=true on channel_end). Mirrors the
 * `StreamDemultiplexer.getChannel(id).getReader()` shape from
 * `packages/common/multiplexed-stream/consumer/StreamDemultiplexer.ts`,
 * minus the per-channel backpressure (frame parsing here is unbounded).
 *
 * The consumer reads channels concurrently — shape on its own promise,
 * result via a reader that processes bytes as they arrive — so progressive
 * iterable yields survive across the wire/parser boundary.
 */
function createDemuxer(body: ReadableStream<Uint8Array>): {
  getChannelReader: (id: number) => ChannelReader
  done: Promise<void>
} {
  const channels = new Map<number, ChannelQueue>()

  const getOrCreate = (id: number): ChannelQueue => {
    let q = channels.get(id)
    if (!q) {
      q = { buffered: [], closed: false, errored: null, waiter: null, rejecter: null }
      channels.set(id, q)
    }
    return q
  }

  const enqueueBytes = (id: number, bytes: Uint8Array): void => {
    const q = getOrCreate(id)
    if (q.closed || q.errored) return
    if (q.waiter) {
      const w = q.waiter
      q.waiter = null
      q.rejecter = null
      w({ done: false, value: bytes })
    } else {
      q.buffered.push(bytes)
    }
  }

  const closeChannel = (id: number): void => {
    const q = getOrCreate(id)
    if (q.closed || q.errored) return
    q.closed = true
    if (q.waiter) {
      const w = q.waiter
      q.waiter = null
      q.rejecter = null
      w({ done: true })
    }
  }

  const errorChannel = (id: number, message: string): void => {
    const q = getOrCreate(id)
    if (q.closed || q.errored) return
    q.errored = new Error(message)
    if (q.rejecter) {
      const r = q.rejecter
      q.waiter = null
      q.rejecter = null
      r(q.errored)
    }
  }

  const errorAll = (err: Error): void => {
    for (const [, q] of channels) {
      if (q.closed || q.errored) continue
      q.errored = err
      if (q.rejecter) {
        const r = q.rejecter
        q.waiter = null
        q.rejecter = null
        r(err)
      }
    }
  }

  const closeAll = (): void => {
    for (const [, q] of channels) {
      if (q.closed || q.errored) continue
      q.closed = true
      if (q.waiter) {
        const w = q.waiter
        q.waiter = null
        q.rejecter = null
        w({ done: true })
      }
    }
  }

  const reader = body.getReader()
  let buffer = new Uint8Array(0)
  let seenPreamble = false

  const append = (chunk: Uint8Array): void => {
    const next = new Uint8Array(buffer.length + chunk.length)
    next.set(buffer, 0)
    next.set(chunk, buffer.length)
    buffer = next
  }

  const drainFrames = (): void => {
    while (buffer.length >= FRAME_HEADER_SIZE) {
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      const channel = view.getUint8(0)
      const length = view.getUint32(1, false)
      const total = FRAME_HEADER_SIZE + length
      if (buffer.length < total) return
      const payload = buffer.slice(FRAME_HEADER_SIZE, total)
      buffer = buffer.slice(total)

      if (channel === CONTROL_CHANNEL) {
        if (!seenPreamble) {
          seenPreamble = true
          continue
        }
        const payloadView = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
        const eventType = payloadView.getUint8(0)
        const eventChannel = payloadView.getUint8(1)
        if (eventType === EVENT_CHANNEL_END) {
          closeChannel(eventChannel)
        } else if (eventType === EVENT_CHANNEL_ERROR) {
          const msgLen = payloadView.getUint16(2, false)
          const message = new TextDecoder('utf-8').decode(payload.slice(4, 4 + msgLen))
          errorChannel(eventChannel, message)
        }
        continue
      }

      enqueueBytes(channel, payload)
    }
  }

  const done = (async () => {
    try {
      for (;;) {
        const { done: readerDone, value } = await reader.read()
        if (readerDone) break
        append(value)
        drainFrames()
      }
      closeAll()
    } catch (err: any) {
      const wrapped = err instanceof Error ? err : new Error(String(err))
      errorAll(wrapped)
    } finally {
      try { reader.releaseLock() } catch {}
    }
  })()

  return {
    getChannelReader(id: number): ChannelReader {
      const q = getOrCreate(id)
      return {
        read(): Promise<{ done: boolean; value?: Uint8Array }> {
          if (q.errored) return Promise.reject(q.errored)
          const next = q.buffered.shift()
          if (next !== undefined) {
            return Promise.resolve({ done: false, value: next })
          }
          if (q.closed) return Promise.resolve({ done: true })
          return new Promise((resolve, reject) => {
            q.waiter = resolve
            q.rejecter = reject
          })
        },
        cancel(reason?: Error): void {
          q.errored = reason ?? new Error('Channel cancelled')
          if (q.rejecter) {
            const r = q.rejecter
            q.waiter = null
            q.rejecter = null
            r(q.errored)
          }
          reader.cancel(q.errored).catch(() => {})
        },
      }
    },
    done,
  }
}

async function readChannelToString(channel: ChannelReader): Promise<string> {
  const chunks: Uint8Array[] = []
  let totalLength = 0
  for (;;) {
    const { done, value } = await channel.read()
    if (done) break
    if (value) {
      chunks.push(value)
      totalLength += value.length
    }
  }
  if (totalLength === 0) return ''
  if (chunks.length === 1 && chunks[0]) return new TextDecoder('utf-8').decode(chunks[0])
  const merged = new Uint8Array(totalLength)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.length
  }
  return new TextDecoder('utf-8').decode(merged)
}

/**
 * Consume a multiplexed-binary Response stream and return { result, stream }.
 *
 * `result` resolves to the scalar value (scalar-shape) or the array of
 * yielded values (iterable-shape). `stream` is an AsyncIterable reflecting
 * the function's explicit yields — iterable-shape yields each value in
 * order; scalar-shape does not yield and the stream closes immediately.
 *
 * If the terminal channel carries an error, `result` and `stream` reject
 * with that error message. If the terminal channel carries reauth info,
 * `onReauth` fires as a side effect so the caller can update auth state.
 *
 * @param onFirstOutput Optional hook fired synchronously on the first non-empty
 *   result-channel read. Intended only for enqueueing lightweight metrics; must
 *   not perform I/O or other long work — it runs on the stream-read hot path.
 */
export function consumeExecuteStream<T>(
  response: Response,
  onReauth: (info: ReauthInfo) => void,
  onFirstOutput?: () => void,
  onDataAccessErrors?: (errors: DataAccessError[]) => void,
): { result: Promise<T>; stream: AsyncIterable<T> } {
  type Waiter = { resolve: (r: IteratorResult<T>) => void; reject: (err: unknown) => void }

  const yieldQueue: T[] = []
  const yieldWaiters: Waiter[] = []
  let streamDone = false
  let streamError: Error | null = null

  let resolveResult!: (v: T) => void
  let rejectResult!: (err: unknown) => void
  const result = new Promise<T>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })
  // Mark `result` as observed so it doesn't trigger an unhandled-rejection
  // warning/crash if the caller only consumes `.stream` or discards the
  // handle. This is an observer, not a suppressor — callers that attach
  // their own `.then` / `.catch` / `await` still receive the rejection.
  result.catch(() => {})

  const pushYield = (value: T): void => {
    const w = yieldWaiters.shift()
    if (w !== undefined) w.resolve({ value, done: false })
    else yieldQueue.push(value)
  }

  const finishStream = (err: Error | null): void => {
    if (err) {
      streamError = err
      for (;;) {
        const w = yieldWaiters.shift()
        if (w === undefined) break
        w.reject(err)
      }
    } else {
      streamDone = true
      for (;;) {
        const w = yieldWaiters.shift()
        if (w === undefined) break
        w.resolve({ value: undefined as unknown as T, done: true })
      }
    }
  }

  const stream: AsyncIterable<T> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<T>> {
          const queued = yieldQueue.shift()
          if (queued !== undefined) return Promise.resolve({ value: queued, done: false })
          if (streamError) return Promise.reject(streamError)
          if (streamDone) return Promise.resolve({ value: undefined as unknown as T, done: true })
          return new Promise<IteratorResult<T>>((resolve, reject) => {
            yieldWaiters.push({ resolve, reject })
          })
        },
      }
    },
  }

  void (async () => {
    if (!response.ok) {
      let text = ''
      try { text = await response.text() } catch {}
      let message = `HTTP ${response.status}`
      try {
        const parsed = JSON.parse(text)
        if (parsed && typeof parsed.userMessage === 'string') message = parsed.userMessage
        else if (parsed && typeof parsed.message === 'string') message = parsed.message
        else if (parsed && typeof parsed.error === 'string') message = parsed.error
      } catch {}
      const err = new Error(message)
      rejectResult(err); finishStream(err); return
    }
    if (!response.body) {
      const err = new Error('Response has no body')
      rejectResult(err); finishStream(err); return
    }

    const demuxer = createDemuxer(response.body)
    const terminalPromise = readChannelToString(demuxer.getChannelReader(CHANNEL_TERMINAL))

    const yieldedValues: T[] = []
    const resultBytes: number[] = []
    let iterableLineBytes: number[] = []
    let headers: Record<string, string | string[]> | null = null
    let contentType: string | null = null

    const readContentType = (h: Record<string, string | string[]>): string | null => {
      for (const k of Object.keys(h)) {
        if (k.toLowerCase() !== 'content-type') continue
        const v = (h as any)[k]
        if (typeof v === 'string') return v
        if (Array.isArray(v) && typeof v[0] === 'string') return v[0]
      }
      return null
    }

    const consumeIterableBytes = (bytes: Uint8Array): void => {
      for (const byte of bytes) {
        if (byte === 0x0a) {
          if (iterableLineBytes.length > 0) {
            const line = new TextDecoder('utf-8').decode(Uint8Array.from(iterableLineBytes))
            iterableLineBytes = []
            const parsed = JSON.parse(line) as T
            yieldedValues.push(parsed)
            pushYield(parsed)
          }
        } else {
          iterableLineBytes.push(byte)
        }
      }
    }

    /**
     * Reads result bytes immediately. Pre-headers bytes accumulate in
     * `resultBytes`. Once headers resolve, accumulated bytes (and every
     * subsequent chunk) get dispatched per Content-Type —
     * progressively-parseable Content-Types split on '\n' and push
     * yields; everything else stays buffered for end-of-stream parsing.
     *
     * The result reader does NOT wait on the headers channel to close.
     * The producer ends that channel as part of `writer.end()`, which
     * happens only after the route handler finishes. Gating result-channel
     * reads on *channel close* (vs *data arrival*) buffers every iterable
     * yield until the stream finalizes.
     */
    let firstOutputReported = false
    const reportFirstOutput = (): void => {
      if (firstOutputReported) return
      firstOutputReported = true
      onFirstOutput?.()
    }

    const resultPromise = (async () => {
      const resultReader = demuxer.getChannelReader(CHANNEL_RESULT)
      for (;;) {
        const { done, value } = await resultReader.read()
        if (done) break
        if (!value || value.length === 0) continue
        reportFirstOutput()
        if (contentType !== null && isProgressivelyParseable(contentType)) {
          consumeIterableBytes(value)
        } else {
          for (const b of value) {
            resultBytes.push(b)
          }
        }
      }
    })()

    const headersPromise = (async () => {
      const reader = demuxer.getChannelReader(CHANNEL_HEADERS)
      const chunks: number[] = []
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value || value.length === 0) continue
        if (headers !== null) continue
        for (const byte of value) chunks.push(byte)
        const text = new TextDecoder('utf-8').decode(Uint8Array.from(chunks))
        let parsed: unknown
        try {
          parsed = JSON.parse(text)
        } catch {
          // Headers JSON not yet complete; keep buffering.
          continue
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
        headers = parsed as Record<string, string | string[]>
        contentType = readContentType(headers)
        if (contentType !== null && isProgressivelyParseable(contentType) && resultBytes.length > 0) {
          const drained = Uint8Array.from(resultBytes)
          resultBytes.length = 0
          consumeIterableBytes(drained)
        }
      }
    })()

    /**
     * Drain channels we don't surface (stdout, stderr, executor metadata) so
     * their bytes don't accumulate in the demuxer's per-channel buffer for
     * the request lifetime. Sandbox execution logs flow to the Data tab via
     * `__emitExecutionRecord` in the hook template — this consumer doesn't
     * read them, but the producer still writes them to the wire.
     */
    const drainChannel = async (id: number): Promise<void> => {
      const reader = demuxer.getChannelReader(id)
      for (;;) {
        const { done } = await reader.read()
        if (done) break
      }
    }
    const drainPromise = Promise.all([drainChannel(CHANNEL_STDOUT), drainChannel(CHANNEL_STDERR), drainChannel(CHANNEL_METADATA)])

    let transportError: Error | null = null
    try {
      await Promise.all([resultPromise, terminalPromise, headersPromise, drainPromise, demuxer.done])
    } catch (err: any) {
      transportError = err instanceof Error ? err : new Error(String(err))
    }

    if (transportError) {
      rejectResult(transportError); finishStream(transportError); return
    }

    let terminalError: string | null = null
    let pendingReauth: ReauthInfo | null = null
    let pendingDataAccessErrors: DataAccessError[] = []
    const terminalText = await terminalPromise.catch(() => '')
    if (terminalText.length > 0) {
      try {
        const parsed = JSON.parse(terminalText)
        if (parsed && typeof parsed.error === 'string') terminalError = parsed.error
        if (parsed && parsed.reauthRequired) {
          pendingReauth = {
            resources: parsed.reauthRequired.resources,
            resourcesRequiringAccess: parsed.reauthRequired.resourcesRequiringAccess,
          }
        }
        const maybeDataAccessErrors = parsed && Array.isArray(parsed.dataAccessErrors) ? parsed.dataAccessErrors : []
        if (maybeDataAccessErrors.length > 0) {
          pendingDataAccessErrors = maybeDataAccessErrors.filter((err: any): err is DataAccessError =>
            err &&
            err.source === 'data_access_policy' &&
            typeof err.name === 'string' &&
            typeof err.displayName === 'string' &&
            typeof err.message === 'string' &&
            (err.reason === undefined || typeof err.reason === 'string') &&
            (err.reasonCode === undefined || typeof err.reasonCode === 'string'),
          )
        }
      } catch {}
    }

    if (pendingReauth) onReauth(pendingReauth)
    if (pendingDataAccessErrors.length > 0) onDataAccessErrors?.(pendingDataAccessErrors)

    if (terminalError !== null) {
      const err = new Error(terminalError)
      rejectResult(err); finishStream(err); return
    }

    if (headers === null) {
      const err = new Error('Headers channel closed without a frame')
      rejectResult(err); finishStream(err); return
    }

    if (contentType !== null && isProgressivelyParseable(contentType)) {
      if (iterableLineBytes.length > 0) {
        const line = new TextDecoder('utf-8').decode(Uint8Array.from(iterableLineBytes))
        const parsed = JSON.parse(line) as T
        yieldedValues.push(parsed)
        pushYield(parsed)
      }
      resolveResult(yieldedValues as unknown as T)
      finishStream(null)
      return
    }

    // Non-progressively-parseable Content-Type: hand the buffered bytes
    // and the parsed headers to the pre-bundled DBCS transformer at
    // `/frontend/lib/dbcsTransform.js`. `setup().transform(body, headers)`
    // runs `extractDbcsContext + createTransformer + unwrap` end-to-end.
    // We then wrap as `{ data: <unwrapped> }` to match `makeQuery`'s
    // canonical shape, and — when `sql-client.queryStreamRaw` opts in via
    // the `x-retool-sql-columnar-to-rows: true` header — apply the same
    // `columnarToRows` post-step `sql-client.create.query` applies on the
    // buffered path. Both pieces mirror the non-hook
    // `consumeRetoolReactExecuteStream` helper exactly.
    try {
      // R2 sandpack callers want every binary REST response as a bare base64
      // string regardless of query version. See `RestApiBinaryOptions` in
      // `@tryretool/common/dbcs-headers` for the variant the flag selects.
      let transformed = await _dbcsSetup({ flattenRestApiBinaryResponses: true }).transform(
        Uint8Array.from(resultBytes),
        headers as Record<string, string | string[] | undefined>,
      )
      // Read the DBCS-enabled and columnar-to-rows headers case-insensitively.
      let dbcsEnabled = false
      let columnarToRowsRequested = false
      for (const k of Object.keys(headers)) {
        const lower = k.toLowerCase()
        if (lower !== DBCS_ENABLED_HEADER && lower !== COLUMNAR_TO_ROWS_HEADER) continue
        const v = (headers as any)[k]
        const single = typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null
        if (single !== 'true') continue
        if (lower === DBCS_ENABLED_HEADER) dbcsEnabled = true
        else columnarToRowsRequested = true
      }
      // Mirrors `makeQuery` (resource-query/src/index.ts): only DBCS results
      // get the `unsafelyStrip(<unwrapped>)` envelope — the legacy
      // `{ data: parsed.data ?? parsed }` extraction, which also peels the
      // REST/OpenAPI `{ data, metadata }` inner envelope. Plain scalars
      // round-trip through the transformer and surface as-is.
      if (dbcsEnabled) {
        // `_dbcsSetup().transform()` already strips the outer
        // `__retoolWrappedQuery__` envelope; `unsafelyStrip` peels the
        // REST/OpenAPI inner `{ data, metadata }` envelope to match the
        // legacy DBCS-off shape, mirroring `makeQuery` (resource-query).
        let inner: unknown = unsafelyStrip(transformed).data
        if (columnarToRowsRequested && isColumnarShape(inner)) {
          inner = columnarToRows(inner)
        }
        transformed = { data: inner }
      }
      resolveResult(transformed as T)
      finishStream(null)
    } catch (err: any) {
      const e = err instanceof Error ? err : new Error(String(err))
      rejectResult(e); finishStream(e)
    }
  })()

  return { result, stream }
}