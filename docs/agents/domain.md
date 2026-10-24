# Domain docs

## Layout

Use a single-context layout for the whole repository:

- `GLOSSARY.md` at the repository root for domain terminology.
- `docs/adr/` for architecture decision records.

## Read before exploring

Before exploring domain concepts or proposing architecture changes, read the glossary and ADRs relevant to the area being changed.

If these files do not exist, proceed silently. Create them through `/domain-modeling` when terminology or decisions are actually resolved, rather than adding empty scaffolding.

If a root `GLOSSARY-MAP.md` is deliberately introduced later, follow its links to the relevant context glossaries and check context-scoped ADRs as well as system-wide ADRs.

## Vocabulary and decisions

Use glossary terms consistently in issue titles, proposals, hypotheses and tests. For a missing term, check existing project language before proposing an addition through `/domain-modeling`.

If a proposal contradicts an ADR, name the conflicting record and explain why the decision should be reconsidered. Preserve its status until an explicit decision changes it.
