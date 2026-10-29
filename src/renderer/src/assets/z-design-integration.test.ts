import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compile } from 'tailwindcss'
import source from './z-design-source.json'

describe('vendored z-design contract', () => {
  it('retains the generated upstream stylesheet byte for byte', () => {
    const css = readFileSync(resolve('src/renderer/src/assets/z-design.css'))
    expect(createHash('sha256').update(css).digest('hex')).toBe(source.sha256)
  })

  it('loads the shared source before the Orca theme adapter', () => {
    const css = readFileSync(resolve('src/renderer/src/assets/main.css'), 'utf8')
    const sharedImport = css.indexOf("@import './z-design.css';")
    expect(sharedImport).toBeGreaterThan(-1)
    expect(sharedImport).toBeLessThan(css.indexOf(':root {'))
    expect(css).toContain('--radius-md: var(--ui-radius-control)')
    expect(css).toContain('--radius-xl: var(--ui-radius-card)')
  })

  it('floors arbitrary font lengths after Tailwind defaults without affecting colors or chat settings', async () => {
    const sourceCss = readFileSync(resolve('src/renderer/src/assets/main.css'), 'utf8')
    const utility = sourceCss.match(/^@utility text-\* \{[^}]+\}/m)?.[0]
    if (!utility) {
      throw new Error('Missing arbitrary text size floor')
    }
    const compiler = await compile(`
      ${utility}
      @theme {
        --breakpoint-md: 48rem;
        --color-primary: #00ff44;
        --text-sm: 0.875rem;
      }
      @tailwind utilities;
    `)
    const css = compiler.build([
      'text-[10px]',
      'text-[0.625rem]',
      'text-[18px]',
      'md:text-[11px]',
      'hover:text-[9px]',
      'text-primary',
      'text-[#ff0000]',
      'text-sm'
    ])
    const declarations = css.replace(/\s+/g, ' ')
    for (const size of ['10px', '0.625rem', '18px', '11px', '9px']) {
      expect(declarations).toContain(
        `font-size: ${size}; font-size: max(var(--ui-font-size-meta), ${size});`
      )
    }
    expect(css).toContain('@media (width >= 48rem)')
    expect(css).toContain('.hover\\:text-\\[9px\\]:hover')
    expect(css.match(/\.text-primary \{([^}]+)\}/)?.[1]).toContain('color: var(--color-primary)')
    expect(css.match(/\.text-primary \{([^}]+)\}/)?.[1]).not.toContain('font-size')
    expect(css).toContain('color: #ff0000')
    expect(css.match(/\.text-sm \{([^}]+)\}/)?.[1]).toContain('font-size: var(--text-sm)')
    expect(css.match(/\.text-sm \{([^}]+)\}/)?.[1]).not.toContain('max(')
  })

  it('removes decorative shadow tiers while retaining focus rings', async () => {
    const sourceCss = readFileSync(resolve('src/renderer/src/assets/main.css'), 'utf8')
    const theme = sourceCss.match(/@theme inline \{([\s\S]*?)\n\}/)?.[1]
    if (!theme) {
      throw new Error('Missing Orca theme bindings')
    }
    const compiler = await compile(`@theme inline { ${theme} } @tailwind utilities;`)
    const css = compiler.build(['shadow-xs', 'shadow-lg', 'ring-2', 'focus-visible:ring-ring'])
    for (const tier of ['xs', 'lg']) {
      expect(css.match(new RegExp(`\\.shadow-${tier} \\{([^}]+)\\}`))?.[1]).toContain(
        '--tw-shadow: none'
      )
    }
    expect(css).toContain('--tw-ring-shadow:')
    expect(css).toContain('--tw-ring-color: var(--ring)')
  })
})
