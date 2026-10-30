import { GRAB_BUDGET, type BrowserAnnotationPayload } from '../../../../shared/browser-grab-types'

export function isOrcaAnnotationShortcut(event: KeyboardEvent): boolean {
  return (
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.repeat &&
    !event.isComposing &&
    event.key.toLowerCase() === 'á'
  )
}

export function captureOrcaElement(element: Element): BrowserAnnotationPayload {
  const bounds = element.getBoundingClientRect()
  const rect = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
  const parts: string[] = []
  let current: Element | null = element
  while (current && current !== document.body && parts.length < 10) {
    const tag = current.tagName.toLowerCase()
    const testId = current.getAttribute('data-testid')
    if (testId && testId.length < 100) {
      parts.unshift(`${tag}[data-testid=${JSON.stringify(testId)}]`)
      break
    }
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter((e) => e.tagName.toLowerCase() === tag)
      : []
    parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current) + 1})`)
    current = current.parentElement
  }
  const style = getComputedStyle(element)
  // Input values and descendant markup can contain credentials or private conversation text.
  const text = element.matches('input, textarea, [contenteditable]')
    ? ''
    : Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join(' ')
        .slice(0, GRAB_BUDGET.textSnippetMaxLength)
  return {
    page: {
      sanitizedUrl: 'orca://ui',
      title: 'Orca UI',
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      scrollX,
      scrollY,
      devicePixelRatio,
      capturedAt: new Date().toISOString()
    },
    target: {
      tagName: element.tagName.toLowerCase(),
      selector: parts.join(' > ').slice(0, GRAB_BUDGET.selectorMaxLength),
      textSnippet: text,
      htmlSnippet: '',
      attributes: {},
      accessibility: {
        role: element.getAttribute('role'),
        accessibleName: element.getAttribute('aria-label'),
        ariaLabel: element.getAttribute('aria-label'),
        ariaLabelledBy: null
      },
      rectViewport: rect,
      rectPage: { ...rect, x: rect.x + scrollX, y: rect.y + scrollY },
      cssClasses: Array.from(element.classList).join(' ').slice(0, GRAB_BUDGET.cssClassesMaxLength),
      computedStyles: {
        display: style.display,
        position: style.position,
        width: style.width,
        height: style.height,
        margin: style.margin,
        padding: style.padding,
        color: style.color,
        backgroundColor: style.backgroundColor,
        border: style.border,
        borderRadius: style.borderRadius,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        textAlign: style.textAlign,
        zIndex: style.zIndex
      }
    },
    nearbyText: [],
    ancestorPath: parts,
    screenshot: null
  }
}
