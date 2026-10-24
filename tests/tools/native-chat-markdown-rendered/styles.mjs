import assert from 'node:assert/strict'

export async function verifyStyles(field, phase, kinds) {
  const result = await field.evaluate(
    (element, kinds) =>
      Object.fromEntries(
        kinds.map((kind) => {
          const span = element.querySelector(`[data-prompt-markdown="${kind}"]`)
          if (!span) {
            return [kind, null]
          }
          const style = getComputedStyle(span)
          return [
            kind,
            {
              text: span.textContent,
              weight: Number(style.fontWeight),
              style: style.fontStyle,
              decoration: style.textDecorationLine,
              family: style.fontFamily,
              background: style.backgroundColor,
              className: span.className,
              muted: style.getPropertyValue('--muted'),
              size: style.fontSize
            }
          ]
        })
      ),
    kinds
  )
  if (phase === 'before') {
    assert.ok(
      Object.values(result).every((style) => style === null),
      'Baseline must have no Markdown decorations'
    )
    return result
  }
  for (const [kind, style] of Object.entries(result)) {
    assert.ok(style, `Missing ${kind} decoration`)
    if (['heading', 'strong'].includes(kind)) {
      assert.ok(style.weight >= 600, `${kind} should be semibold`)
    }
    if (['blockquote', 'listItem'].includes(kind)) {
      assert.ok(style.weight >= 500, `${kind} marker should be medium weight`)
    }
    if (kind === 'emphasis') {
      assert.equal(style.style, 'italic')
    }
    if (kind === 'delete') {
      assert.ok(style.decoration.includes('line-through'))
    }
    if (kind === 'link') {
      assert.ok(style.decoration.includes('underline'))
    }
    if (['inlineCode', 'code'].includes(kind)) {
      assert.ok(/mono/i.test(style.family), `${kind} should use monospace`)
      assert.notEqual(style.background, 'rgba(0, 0, 0, 0)', `${kind}: ${JSON.stringify(style)}`)
    }
  }
  return result
}
