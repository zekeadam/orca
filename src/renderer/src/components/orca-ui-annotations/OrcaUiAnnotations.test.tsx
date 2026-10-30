// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { OrcaUiAnnotations } from './OrcaUiAnnotations'

vi.mock('./orca-ui-annotation-send', () => ({ sendOrcaAnnotations: vi.fn() }))

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})

function toggle(): void {
  fireEvent.keyDown(window, { key: 'á', altKey: true })
}

describe('Orca annotation drafts and modal ownership', () => {
  it('keeps a draft attached to its element until added or explicitly cancelled', () => {
    render(
      <>
        <button>First target</button>
        <button>Second target</button>
        <OrcaUiAnnotations />
      </>
    )
    toggle()
    fireEvent.click(screen.getByText('First target'))
    fireEvent.change(screen.getByLabelText('Annotation'), {
      target: { value: 'Change the first target' }
    })
    toggle()
    fireEvent.click(screen.getByText('Second target'))
    expect(screen.getByText('button: First target')).toBeTruthy()
    expect(screen.getByLabelText('Annotation')).toHaveProperty('value', 'Change the first target')
    fireEvent.click(screen.getByText('Cancel annotation'))
    fireEvent.click(screen.getByText('Second target'))
    expect(screen.getByText('button: Second target')).toBeTruthy()
    expect(screen.getByLabelText('Annotation')).toHaveProperty('value', '')
  })

  it('moves controls into and out of a live modal without losing queued annotations', async () => {
    render(
      <>
        <button>Target</button>
        <OrcaUiAnnotations />
      </>
    )
    toggle()
    fireEvent.click(screen.getByText('Target'))
    fireEvent.change(screen.getByLabelText('Annotation'), { target: { value: 'Keep this note' } })
    fireEvent.click(screen.getByText('Add to queue'))
    fireEvent.keyDown(window, { key: 'Escape' })
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.dataset.state = 'open'
    await act(async () => {
      document.body.append(dialog)
    })
    await waitFor(() =>
      expect(dialog.contains(screen.getByTestId('orca-ui-annotations'))).toBe(true)
    )
    await act(async () => {
      dialog.remove()
    })
    await waitFor(() =>
      expect(screen.getByTestId('orca-ui-annotations').parentElement).toBe(document.body)
    )
    expect(screen.getByText('1. Keep this note')).toBeTruthy()
  })
})
