;(() => {
  const RETOOL_PREVIEW_INSPECTOR_MODE_MESSAGE_TYPE = 'RETOOL_PREVIEW_INSPECTOR_MODE'
  const RETOOL_PREVIEW_TOGGLE_INSPECTOR_MODE_MESSAGE_TYPE = 'RETOOL_PREVIEW_TOGGLE_INSPECTOR_MODE'
  const RETOOL_PREVIEW_INSPECTOR_ELEMENT_SELECTED_MESSAGE_TYPE = 'RETOOL_PREVIEW_INSPECTOR_ELEMENT_SELECTED'
  const RETOOL_PREVIEW_INSPECTOR_FREEZE_SELECTION_MESSAGE_TYPE = 'RETOOL_PREVIEW_INSPECTOR_FREEZE_SELECTION'

  const expectedParentOrigin =
    new URLSearchParams(window.location.search).get('retool-parent-origin') ?? window.location.origin

  type ReactFiberNode = {
    type?: unknown
    return?: ReactFiberNode | null
  }

  type InspectorMessageData = Record<string, unknown> & {
    active?: unknown
    freeze?: unknown
    type?: unknown
  }

  function isRecord(value: unknown): value is InspectorMessageData {
    return typeof value === 'object' && value !== null
  }

  function normalizeSourceFilePath(fileName: string): string {
    const frontendIndex = fileName.indexOf('/frontend/')
    if (frontendIndex >= 0) {
      return fileName.slice(frontendIndex)
    }
    return fileName
  }

  function getReactFiber(el: Element): ReactFiberNode | undefined {
    const fiberKey = Object.keys(el).find((key) => key.startsWith('__reactFiber'))
    if (!fiberKey) {
      return undefined
    }
    return (el as unknown as Record<string, ReactFiberNode | undefined>)[fiberKey]
  }

  /**
   * Extracts the component display name from a fiber node's type.
   * Handles plain function components, React.forwardRef, and React.memo.
   */
  type NamedLike = { displayName?: string; name?: string }
  type ReactTypeObject = {
    displayName?: string
    render?: NamedLike
    type?: unknown
  }

  function getFiberComponentName(fiber: ReactFiberNode): string | undefined {
    const type = fiber.type
    if (typeof type === 'function') {
      const fn = type as NamedLike
      return fn.displayName || fn.name || undefined
    }
    if (typeof type === 'object' && type !== null) {
      const obj = type as ReactTypeObject
      if (obj.displayName) {
        return obj.displayName
      }
      // React.forwardRef: { $$typeof: Symbol(react.forward_ref), render: fn }
      if (obj.render) {
        return obj.render.displayName || obj.render.name || undefined
      }
      // React.memo: { $$typeof: Symbol(react.memo), type: component }
      const inner = obj.type
      if (typeof inner === 'function') {
        const fn = inner as NamedLike
        return fn.displayName || fn.name || undefined
      }
      if (typeof inner === 'object' && inner !== null) {
        const innerObj = inner as NamedLike
        if (innerObj.displayName) {
          return innerObj.displayName
        }
      }
    }
    return undefined
  }

  function isComponentFiber(fiber: ReactFiberNode): boolean {
    return typeof fiber.type !== 'string'
  }

  /**
   * Walks up from `el` looking for `data-insp-path` set by code-inspector-plugin.
   * Works in both React 18 and 19 (no reliance on _debugSource).
   */
  function getSourceFilePathFromInspectorAttrs(el: Element): string | undefined {
    let current: Element | null = el
    while (current) {
      const inspPath = current.getAttribute('data-insp-path')
      if (inspPath) {
        return normalizeSourceFilePath(inspPath)
      }
      current = current.parentElement
    }
    return undefined
  }

  function getComponentInfo(el: Element): { componentName: string; sourceFilePath?: string } {
    const sourceFilePath = getSourceFilePathFromInspectorAttrs(el)
    const fiber = getReactFiber(el)

    let walkFiber = fiber
    let componentName = 'Component'

    while (walkFiber) {
      if (isComponentFiber(walkFiber)) {
        const name = getFiberComponentName(walkFiber)
        if (name && name !== 'div' && name !== 'span' && !name.startsWith('_')) {
          componentName = name
          break
        }
      } else if (typeof walkFiber.type === 'string' && walkFiber.type !== 'div' && walkFiber.type !== 'span') {
        componentName = walkFiber.type
        break
      }
      walkFiber = walkFiber.return ?? undefined
    }

    return sourceFilePath ? { componentName, sourceFilePath } : { componentName }
  }

  function normalizeText(text: string | null | undefined): string {
    // Spread into code points before slicing so the 80-char cap can't bisect an
    // emoji's surrogate pair and leave a lone surrogate. A lone surrogate is invalid
    // as jsonb text, so it would later break persistence of sandpack_chat_messages.content.
    return [...(text || '').replace(/\s+/g, ' ').trim()].slice(0, 80).join('')
  }

  function getElementText(el: Element): string {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      return normalizeText(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title'))
    }
    return normalizeText(
      el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('title') || el.textContent,
    )
  }

  function describeElement(el: Element): string {
    const tag = el.tagName.toLowerCase()
    const id = el.id ? `#${el.id}` : ''
    const classes = Array.from(el.classList)
      .filter(Boolean)
      .slice(0, 3)
      .map((className) => `.${className}`)
      .join('')
    const text = getElementText(el)
    return tag + id + classes + (text ? ` "${text}"` : '')
  }

  function escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function getElementPath(el: Element): Element[] {
    const path: Element[] = []
    let current: Element | null = el
    while (current && current !== document.documentElement) {
      path.unshift(current)
      current = current.parentElement
    }
    return path
  }

  // Handles edge cases where we want to select the parent element instead of the child element
  function resolveSelectableTarget(el: Element): Element {
    // Handle SVG elements that are not the root SVG element (e.g., <path> <circle>)
    if (el instanceof SVGElement && !(el instanceof SVGSVGElement)) {
      const svg = el.closest('svg')
      if (svg) {
        return svg
      }
    }

    // Select the direct parent of a span if it's a meaningful element
    if (el.tagName.toLowerCase() === 'span' && el.parentElement) {
      const parentTag = el.parentElement.tagName.toLowerCase()
      if (parentTag !== 'span') {
        return el.parentElement
      }
    }

    return el
  }

  function buildVisualEditingContext(el: Element) {
    const rect = el.getBoundingClientRect()
    const path = getElementPath(el)
    const componentInfo = getComponentInfo(el)
    return {
      selectedElementLabel: describeElement(el),
      componentName: componentInfo.componentName,
      ...(componentInfo.sourceFilePath ? { sourceFilePath: componentInfo.sourceFilePath } : {}),
      selectorPath: path.map(describeElement).join(' > '),
      treeLines: path.map((node, index) => {
        const selected = node === el ? ' [selected]' : ''
        return '  '.repeat(index) + describeElement(node) + selected
      }),
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
    }
  }

  class InspectorMode {
    private isActive = false

    private currentTarget: Element | null = null
    private hasSelected = false
    private selectionCompleteTimeout: number | null = null
    private isFrozen = false

    private inspectorModeOverlay: HTMLDivElement | null = null
    private selection: HTMLDivElement | null = null
    private selectionTag: HTMLDivElement | null = null
    private relatedHighlights: HTMLDivElement[] = []

    // Cache of related target and elements to prevent rescanning the entire DOM on every mouse move
    // unless the target actually changes
    private cachedRelatedTarget: Element | null = null
    private cachedRelatedElements: Element[] = []

    private inspectorModeOverlayId = 'retool-inspector-overlay'

    private padding = 2
    private inset = 2

    constructor() {
      this.attachStateListeners()
    }

    activate(): void {
      if (this.isActive) {
        return
      }
      this.isActive = true
      this.hasSelected = false
      this.createOverlay()
      document.addEventListener('mousemove', this.handleMouseMove)
      document.addEventListener('mouseleave', this.handleMouseLeave)
      document.addEventListener('scroll', this.handleScroll, true)
      window.addEventListener('pointerdown', this.handlePointerDown, true)
      window.addEventListener('pointerup', this.handlePointerUp, true)
      window.addEventListener('pointercancel', this.handlePointerUp, true)
      window.addEventListener('mousedown', this.handleSuppressedEvent, true)
      window.addEventListener('mouseup', this.handleSuppressedEvent, true)
      window.addEventListener('click', this.handleClick, true)
      window.addEventListener('dblclick', this.handleSuppressedEvent, true)
      window.addEventListener('contextmenu', this.handleSuppressedEvent, true)
    }

    deactivate(): void {
      if (!this.isActive) {
        return
      }
      this.isActive = false
      this.isFrozen = false
      this.currentTarget = null
      this.hasSelected = false
      if (this.selectionCompleteTimeout !== null) {
        window.clearTimeout(this.selectionCompleteTimeout)
        this.selectionCompleteTimeout = null
      }
      this.removeOverlays()
      document.removeEventListener('mousemove', this.handleMouseMove)
      document.removeEventListener('mouseleave', this.handleMouseLeave)
      document.removeEventListener('scroll', this.handleScroll, true)
      window.removeEventListener('pointerdown', this.handlePointerDown, true)
      window.removeEventListener('pointerup', this.handlePointerUp, true)
      window.removeEventListener('pointercancel', this.handlePointerUp, true)
      window.removeEventListener('mousedown', this.handleSuppressedEvent, true)
      window.removeEventListener('mouseup', this.handleSuppressedEvent, true)
      window.removeEventListener('click', this.handleClick, true)
      window.removeEventListener('dblclick', this.handleSuppressedEvent, true)
      window.removeEventListener('contextmenu', this.handleSuppressedEvent, true)
    }

    private createOverlay(): void {
      if (!document.body) {
        window.addEventListener(
          'DOMContentLoaded',
          () => {
            if (this.isActive && !this.inspectorModeOverlay) {
              this.createOverlay()
            }
          },
          { once: true },
        )
        return
      }

      this.inspectorModeOverlay = document.createElement('div')
      this.inspectorModeOverlay.id = this.inspectorModeOverlayId
      this.inspectorModeOverlay.style.cssText = [
        'position: fixed',
        'top: 0',
        'left: 0',
        'width: 100vw',
        'height: 100vh',
        'z-index: 10000',
        'pointer-events: none',
        'user-select: none',
      ].join(';')

      this.selection = document.createElement('div')
      this.selection.style.cssText = [
        'position: absolute',
        'border: 2px solid #2870EA',
        'border-radius: 8px',
        'box-sizing: border-box',
        'transition: border 80ms ease-in-out',
        'pointer-events: none',
        'display: none',
      ].join(';')

      this.selectionTag = document.createElement('div')
      this.selectionTag.style.cssText = [
        'position: absolute',
        'align-items: center',
        'gap: 4px',
        'padding: 2px 8px',
        'border-radius: 4px',
        'background: #2870EA',
        'color: #fff',
        'font-size: 11px',
        'font-weight: 600',
        'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'line-height: 18px',
        'white-space: nowrap',
        'z-index: 10001',
        'pointer-events: none',
        'display: none',
      ].join(';')

      this.inspectorModeOverlay.appendChild(this.selection)
      this.inspectorModeOverlay.appendChild(this.selectionTag)
      document.body.appendChild(this.inspectorModeOverlay)
    }

    private removeOverlays(): void {
      this.clearRelatedHighlights()
      if (this.inspectorModeOverlay) {
        this.inspectorModeOverlay.remove()
        this.inspectorModeOverlay = null
        this.selection = null
        this.selectionTag = null
      }
    }

    private updateOverlayPosition(el: Element | null): void {
      if (!el || !this.selection || !this.selectionTag) {
        if (this.selection) {
          this.selection.style.display = 'none'
        }
        if (this.selectionTag) {
          this.selectionTag.style.display = 'none'
        }
        this.clearRelatedHighlights()
        return
      }

      const related = this.findRelatedElements(el)
      this.showRelatedHighlights(related)

      const rect = el.getBoundingClientRect()
      this.selection.style.display = 'block'

      const isFullViewport = this.isFullViewportElement(el, rect)

      if (isFullViewport) {
        this.selection.style.left = `${this.inset}px`
        this.selection.style.top = `${this.inset}px`
        this.selection.style.width = `calc(100vw - ${this.inset * 2}px)`
        this.selection.style.height = `calc(100vh - ${this.inset * 2}px)`
        this.selection.style.borderRadius = '20px' // # InspectorOverlaySync - keep identical to SandpackAgentOverlay.module.scss
      } else {
        this.selection.style.left = `${rect.left - this.padding}px`
        this.selection.style.top = `${rect.top - this.padding}px`
        this.selection.style.width = `${rect.width + this.padding * 2}px`
        this.selection.style.height = `${rect.height + this.padding * 2}px`
        this.selection.style.borderRadius = '8px' // Reset to default border radius
      }

      const name = getComponentInfo(el).componentName
      if (name) {
        this.selectionTag.style.display = 'flex'
        this.selectionTag.innerHTML =
          `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>` +
          `<span>${escapeHtml(name)}</span>`
        const labelHeight = 22

        if (isFullViewport) {
          this.selectionTag.style.left = `${this.inset + this.padding * 2}px`
          this.selectionTag.style.top = `${this.inset + this.padding * 2}px`
        } else {
          let top = rect.top - labelHeight - this.padding * 2
          if (top < 0) {
            top = rect.bottom + this.padding
          }
          this.selectionTag.style.left = `${rect.left}px`
          this.selectionTag.style.top = `${top}px`
        }
      } else {
        this.selectionTag.style.display = 'none'
      }
    }

    private findRelatedElements(el: Element): Element[] {
      if (el === this.cachedRelatedTarget) {
        return this.cachedRelatedElements
      }
      this.cachedRelatedTarget = el
      const inspPath = el.getAttribute('data-insp-path')
      if (!inspPath) {
        this.cachedRelatedElements = []
        return this.cachedRelatedElements
      }
      const all = document.querySelectorAll(`[data-insp-path="${CSS.escape(inspPath)}"]`)
      this.cachedRelatedElements = Array.from(all).filter((sibling) => sibling !== el)
      return this.cachedRelatedElements
    }

    private clearRelatedHighlights(): void {
      for (const highlight of this.relatedHighlights) {
        highlight.remove()
      }
      this.relatedHighlights = []
    }

    private showRelatedHighlights(elements: Element[]): void {
      this.clearRelatedHighlights()
      if (!this.inspectorModeOverlay) {
        return
      }

      for (const el of elements) {
        const rect = el.getBoundingClientRect()
        const highlight = document.createElement('div')
        highlight.style.cssText = [
          'position: absolute',
          'border: 2px dashed #2870EA',
          'border-radius: 8px',
          'box-sizing: border-box',
          'pointer-events: none',
          `left: ${rect.left - this.padding}px`,
          `top: ${rect.top - this.padding}px`,
          `width: ${rect.width + this.padding * 2}px`,
          `height: ${rect.height + this.padding * 2}px`,
        ].join(';')
        this.inspectorModeOverlay.appendChild(highlight)
        this.relatedHighlights.push(highlight)
      }
    }

    private isFullViewportElement(el: Element, rect: DOMRect): boolean {
      if (el === document.body || el === document.documentElement) {
        return true
      }
      if (el.id === 'root' && el.parentElement === document.body) {
        return true
      }
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const tolerance = 10
      return (
        rect.left <= tolerance &&
        rect.top <= tolerance &&
        rect.width >= viewportWidth - tolerance &&
        rect.height >= viewportHeight - tolerance
      )
    }

    private handleMouseMove = (event: MouseEvent): void => {
      if (!this.isActive || this.isFrozen) {
        return
      }

      const rawEl = document.elementFromPoint(event.clientX, event.clientY)
      if (!rawEl || rawEl.closest(`#${this.inspectorModeOverlayId}`)) {
        this.currentTarget = null
        this.updateOverlayPosition(null)
        return
      }

      const el = resolveSelectableTarget(rawEl)
      this.currentTarget = el
      this.updateOverlayPosition(el)
    }

    private handleSuppressedEvent = (event: Event): void => {
      if (!this.isActive) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    private selectTarget = (event: MouseEvent | PointerEvent): void => {
      if (this.hasSelected) {
        return
      }
      const eventTarget = event.target instanceof Element ? event.target : null
      const rawTarget = eventTarget || this.currentTarget || document.elementFromPoint(event.clientX, event.clientY)
      if (!rawTarget || rawTarget.closest(`#${this.inspectorModeOverlayId}`)) {
        return
      }

      const target = resolveSelectableTarget(rawTarget)
      this.hasSelected = true
      window.parent.postMessage(
        {
          type: RETOOL_PREVIEW_INSPECTOR_ELEMENT_SELECTED_MESSAGE_TYPE,
          visualContext: buildVisualEditingContext(target),
          pointer: { x: event.clientX, y: event.clientY },
        },
        expectedParentOrigin,
      )
    }

    private handlePointerDown = (event: PointerEvent): void => {
      this.handleSuppressedEvent(event)
      if (event.button !== 0) {
        return
      }
      this.selectTarget(event)
    }

    private completeSelection = (): void => {
      if (!this.hasSelected) {
        return
      }
      if (this.selectionCompleteTimeout !== null) {
        window.clearTimeout(this.selectionCompleteTimeout)
        this.selectionCompleteTimeout = null
      }
      window.parent.postMessage({ type: RETOOL_PREVIEW_INSPECTOR_ELEMENT_SELECTED_MESSAGE_TYPE }, expectedParentOrigin)
      this.hasSelected = false
    }

    private scheduleSelectionComplete = (): void => {
      if (!this.hasSelected || this.selectionCompleteTimeout !== null) {
        return
      }
      this.selectionCompleteTimeout = window.setTimeout(() => {
        this.selectionCompleteTimeout = null
        this.completeSelection()
      }, 500)
    }

    private handlePointerUp = (event: PointerEvent): void => {
      this.handleSuppressedEvent(event)
      this.scheduleSelectionComplete()
    }

    private handleClick = (event: MouseEvent): void => {
      this.handleSuppressedEvent(event)
      this.selectTarget(event)
      this.completeSelection()
    }

    private handleScroll = (): void => {
      this.updateOverlayPosition(this.currentTarget)
    }

    private handleMouseLeave = (): void => {
      if (this.isFrozen) {
        return
      }
      this.currentTarget = null
      if (this.selection) {
        this.selection.style.display = 'none'
      }
      if (this.selectionTag) {
        this.selectionTag.style.display = 'none'
      }
      this.clearRelatedHighlights()
    }

    private attachStateListeners(): void {
      window.addEventListener('message', (event: MessageEvent) => {
        if (event.source !== window.parent || event.origin !== expectedParentOrigin) {
          return
        }
        const data: unknown = event.data
        if (!isRecord(data)) {
          return
        }

        if (data.type === RETOOL_PREVIEW_INSPECTOR_MODE_MESSAGE_TYPE) {
          if (data.active) {
            this.activate()
          } else {
            this.deactivate()
          }
        }

        if (data.type === RETOOL_PREVIEW_INSPECTOR_FREEZE_SELECTION_MESSAGE_TYPE) {
          this.isFrozen = Boolean(data.freeze)
        }
      })

      window.addEventListener(
        'keydown',
        (event: KeyboardEvent) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'e' && !event.shiftKey && !event.altKey) {
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
            window.parent.postMessage({ type: RETOOL_PREVIEW_TOGGLE_INSPECTOR_MODE_MESSAGE_TYPE }, expectedParentOrigin)
          }
        },
        true,
      )
    }
  }

  new InspectorMode()
})()
