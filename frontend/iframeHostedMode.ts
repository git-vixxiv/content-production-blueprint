const IFRAME_HOSTED =
  new URLSearchParams(window.location.search).get('retool-iframe-hosted-mode') === 'true' ||
  import.meta.env['VITE_IFRAME_HOSTED_MODE'] === 'true'

/** True when served inside a sandboxed null-origin iframe (on-prem iframe-hosted topology). */
export function isIframeHosted(): boolean {
  return IFRAME_HOSTED
}