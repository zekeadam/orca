import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { ImeTextarea } from '@/lib/ime-text-field'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { cn } from '@/lib/utils'
import {
  GRAB_BUDGET,
  type BrowserAnnotationPayload,
  type BrowserPageAnnotation
} from '../../../../shared/browser-grab-types'
import { captureOrcaElement, isOrcaAnnotationShortcut } from './orca-ui-annotation-capture'
import { sendOrcaAnnotations } from './orca-ui-annotation-send'

export function OrcaUiAnnotations(): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [hover, setHover] = useState<DOMRect | null>(null)
  const [target, setTarget] = useState<BrowserAnnotationPayload | null>(null)
  const [comment, setComment] = useState('')
  const [annotations, setAnnotations] = useState<BrowserPageAnnotation[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [panelHost, setPanelHost] = useState<Element>(document.body)
  const sendingRef = useRef(false)

  useEffect(() => {
    if (!open) {
      return
    }
    const updateHost = (): void => {
      setPanelHost(
        Array.from(document.querySelectorAll('[role="dialog"][data-state="open"]')).at(-1) ??
          document.body
      )
    }
    updateHost()
    const observer = new MutationObserver(updateHost)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['role', 'data-state']
    })
    return () => observer.disconnect()
  }, [open])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (isOrcaAnnotationShortcut(event)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        setOpen(true)
        setPicking((value) => (target ? false : !value))
      } else if (event.key === 'Escape' && picking) {
        event.preventDefault()
        event.stopImmediatePropagation()
        setPicking(false)
        setHover(null)
      }
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [picking, target])

  useEffect(() => {
    if (!picking) {
      return
    }
    const outsidePanel = (event: Event): Element | null => {
      const element = event.target
      return element instanceof Element && !element.closest('[data-orca-annotation-controls]')
        ? element
        : null
    }
    const move = (event: PointerEvent): void => {
      setHover(outsidePanel(event)?.getBoundingClientRect() ?? null)
    }
    const stop = (event: Event): void => {
      if (outsidePanel(event)) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    const select = (event: MouseEvent): void => {
      const element = outsidePanel(event)
      if (!element) {
        return
      }
      stop(event)
      setTarget(captureOrcaElement(element))
      setPicking(false)
      setHover(null)
    }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerdown', stop, true)
    window.addEventListener('mousedown', stop, true)
    window.addEventListener('click', select, true)
    return () => {
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerdown', stop, true)
      window.removeEventListener('mousedown', stop, true)
      window.removeEventListener('click', select, true)
    }
  }, [picking])

  const add = (): void => {
    if (!target || !comment.trim() || annotations.length >= GRAB_BUDGET.annotationsMaxPerPage) {
      return
    }
    setAnnotations((items) => [
      ...items,
      {
        id: createBrowserUuid(),
        browserPageId: 'orca-ui',
        comment: comment.trim(),
        intent: 'change',
        priority: 'suggestion',
        createdAt: new Date().toISOString(),
        payload: target
      }
    ])
    setTarget(null)
    setComment('')
    setPicking(true)
  }
  const send = async (): Promise<void> => {
    if (sendingRef.current || !annotations.length) {
      return
    }
    sendingRef.current = true
    setSending(true)
    setPicking(false)
    setError('')
    const batch = annotations
    try {
      await sendOrcaAnnotations(batch)
      setAnnotations((items) => items.filter((item) => !batch.includes(item)))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send annotations.')
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  if (!open) {
    return null
  }
  return (
    <>
      {picking &&
        hover &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[10000] border-2 border-primary"
            style={{ left: hover.x, top: hover.y, width: hover.width, height: hover.height }}
          />,
          document.body
        )}
      {createPortal(
        <section
          data-orca-annotation-controls
          data-testid="orca-ui-annotations"
          aria-label="Orca UI annotations"
          className={cn(
            'pointer-events-auto z-[10001] flex flex-col gap-3 overflow-auto rounded-lg border border-border bg-popover p-3 text-popover-foreground scrollbar-sleek',
            panelHost === document.body
              ? 'fixed right-3 bottom-3 max-h-[70vh] w-80 max-w-[calc(100vw-1.5rem)]'
              : 'relative max-h-[45vh] w-full shrink-0'
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">UI annotations ({annotations.length})</h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOpen(false)
                setPicking(false)
                setHover(null)
              }}
            >
              Close
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {picking
              ? 'Click an Orca element to annotate. Esc stops picking.'
              : target
                ? 'Add or cancel this annotation before selecting another element.'
                : 'Alt+Á selects an Orca element.'}
          </p>
          {target && (
            <div className="space-y-2">
              <p className="truncate text-xs text-muted-foreground">
                {target.target.tagName}:{' '}
                {target.target.accessibility.accessibleName ||
                  target.target.textSnippet ||
                  target.target.selector}
              </p>
              <ImeTextarea
                autoFocus
                aria-label="Annotation"
                value={comment}
                maxLength={GRAB_BUDGET.annotationCommentMaxLength}
                className="w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => setComment(event.target.value)}
              />
              <Button
                size="sm"
                disabled={
                  !comment.trim() ||
                  sending ||
                  annotations.length >= GRAB_BUDGET.annotationsMaxPerPage
                }
                onClick={add}
              >
                Add to queue
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={sending}
                onClick={() => {
                  setTarget(null)
                  setComment('')
                  setPicking(true)
                }}
              >
                Cancel annotation
              </Button>
            </div>
          )}
          <ol className="space-y-2" aria-label="Annotation message queue">
            {annotations.map((item, index) => (
              <li
                key={item.id}
                className="flex items-start gap-2 border-t border-border pt-2 text-sm"
              >
                <span className="min-w-0 flex-1 break-words">
                  {index + 1}. {item.comment}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={sending}
                  aria-label={`Remove annotation ${index + 1}`}
                  onClick={() =>
                    setAnnotations((items) => items.filter((candidate) => candidate.id !== item.id))
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ol>
          {annotations.length >= GRAB_BUDGET.annotationsMaxPerPage && (
            <p className="text-xs text-muted-foreground">
              Queue full. Send or remove an annotation.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button disabled={!annotations.length || sending} onClick={() => void send()}>
            Send
          </Button>
        </section>,
        panelHost
      )}
    </>
  )
}
