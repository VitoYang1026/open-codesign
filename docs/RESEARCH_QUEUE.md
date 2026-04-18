# Research Queue

Tracking of architectural-decision-blocking investigations.

## Completed

| # | Topic | Decision | Report |
|---|---|---|---|
| 0 | Initial Claude Design product survey | Eight demos as v1.0 success criteria | (in conversation, 2026-04-18) |
| 1 | Claude Design hands-on teardown | UI = left chat / right canvas + sliders; need to acquire one exported HTML sample for reverse-engineering | [01](research/01-claude-design-teardown.md) |
| 2 | Inline comment + AI slider POC | `data-codesign-id` injection + str_replace patch for comments; CSS variables + `design_params` JSON for sliders | [02](research/02-inline-comment-and-sliders.md) |
| 3 | Sandbox runtime selection | **Electron iframe srcdoc + esbuild-wasm** primary; Sandpack fallback; WebContainers rejected | [03](research/03-sandbox-runtime.md) |
| 4 | PPTX library selection | **pptxgenjs + dom-to-pptx** primary; screenshot fallback; python-pptx rejected on bundle size | [04](research/04-pptx-export.md) |
| 5 | pi-ai capability boundary | Use pi-ai, pin version, wrap 6 missing capabilities in `packages/providers`; do not fork | [05](research/05-pi-ai-boundary.md) |
| 6 | API key onboarding UX | 3-step flow (welcome path picker / paste with auto-detect / model defaults); zero-config path mandatory; OS keychain storage | [06](research/06-api-onboarding-ux.md) |
| 7 | First-5-minute easy-to-use patterns | Default system prompt (Tailwind + shadcn + Lucide + no indigo); OpenRouter free-tier first-run path; streaming + 200 ms skeleton | [07](research/07-first-5-minutes.md) |

## In flight

None. All initial research closed 2026-04-18.

## Future / opportunistic

- Acquire and reverse-engineer a Claude Design exported HTML (blocks final artifact schema)
- Compare Vercel AI SDK `streamUI` vs our planned artifact stream parser (cosmetic, not blocking)
- Profile esbuild-wasm cold start on lower-end hardware (M1 Air, 8GB Win laptop)
- Survey free-tier API options (OpenRouter, Groq, Cerebras) for "no-key first run" experience

## How to use this file

- Don't make a decision in code that depends on a row that's still in flight — file a TODO with the row number
- When research returns: add a "Completed" entry with one-line decision + link to full report in `docs/research/`
- If a completed decision is reversed, leave the original entry, add a new entry, and explain in the new report's "Supersedes" field
