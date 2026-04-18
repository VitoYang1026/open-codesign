# Research 07 — First-5-Minute Easy-to-Use Patterns

**Date**: 2026-04-18 · **Status**: Decision recorded

## Decision

Adopt the v0.dev / Cherry Studio playbook: ship value before asking for credentials. Three pillars locked into v0.1:

1. **Hardcoded default system prompt** that enforces design quality across all model providers (Tailwind + shadcn-style + Lucide + no indigo/blue + responsive + hover transitions). Single highest-leverage change.
2. **Free-tier first-run path** via OpenRouter `openrouter/free` (or built-in demo key, rotated, rate-limited). User generates ≥ 1 design before being asked for their own key.
3. **Streaming output with skeleton in ≤ 200 ms**. Perceived latency drops 40-60% (Stanford HCI 2024).

## Quick wins for THIS WEEK (already in flight or queued)

| # | Win | Owner / where | Status |
|---|---|---|---|
| 1 | Default system prompt (Tailwind + shadcn + Lucide + no indigo + responsive + transitions) | `wt/first-demo` → `packages/templates/src/system/design-generator.md` | in flight |
| 2 | Free-tier path via OpenRouter free router | `wt/onboarding` → Welcome step "Try free" button | in flight |
| 3 | Empty state with 3 starter chips + interactive thumbnails | `wt/preview-ux` → `EmptyState.tsx` | in flight |
| 4 | Streaming output + 200 ms skeleton | follow-up after `wt/first-demo` lands | queued |
| 5 | Skippable onboarding ("Skip — use free models first" link prominent on key step) | `wt/onboarding` to confirm | in flight |

## v0.1 ship checklist (10 binary criteria)

- [ ] First AI output ≤ 90 seconds from launch (incl. setup)
- [ ] App produces output BEFORE user provides any key (free / demo / local)
- [ ] Default model pre-selected on first run; no empty picker
- [ ] Empty state has ≥ 3 clickable starter chips
- [ ] Visible feedback within 200 ms of submit (skeleton / spinner / first stream token)
- [ ] Every onboarding step skippable with sane default
- [ ] Default system prompt enforces a fixed design system across providers
- [ ] API key entry is single field with inline validation
- [ ] Paste detection (image / URL / code → handled gracefully)
- [ ] Non-technical user can describe the app in 1 sentence after 5 min (test with 3 humans)

## Top 5 risks of "open-source rough"

1. Inconsistent output between models — fix: single system prompt across providers
2. Empty model picker on first run
3. No streaming — output dumps after 4 s of blank
4. Generic "something went wrong" errors
5. Native Electron window chrome / default fonts → "hobby project" feel

## Default system prompt (locked)

```
You are an expert UI designer and frontend engineer. Generate complete, production-ready
HTML/React using Tailwind utility classes, shadcn/ui conventions, and Lucide React icons.

Requirements:
1. Use Inter or Geist as the primary font.
2. Avoid indigo or royal blue — prefer neutral grays / zinc / slate as the base with one accent.
3. Mobile-first responsive layouts.
4. Hover states + focus rings + transition-all duration-200.
5. Use oklch-compatible color values for custom colors.
6. No Lorem Ipsum — write realistic copy.
7. Include dark-mode support via the `dark:` prefix.
8. Output only the component code, no explanation.
```

This prompt is committed at `packages/templates/src/system/design-generator.md` and consumed by `packages/core/src/index.ts`. Updates require a PR + research-report-style justification.

## Three demo prompts (cross-model)

1. **SaaS analytics dashboard** — best on Anthropic Claude (layout + data viz)
2. **Mobile onboarding flow** — best on OpenAI GPT (forms + micro-interactions)
3. **AI productivity landing page** — best on Gemini (component system + tokens)

Used in `packages/templates/src/index.ts` `BUILTIN_DEMOS` (in addition to the four already there: meditation app, case study, pitch deck, marketing).

## Sources (key)

- v0 system prompt leak (Apr 2025): https://leaked-system-prompts.com/prompts/v0/v0_20250428
- Cherry Studio onboarding design: https://github.com/CherryHQ/cherry-studio/issues/13421
- Bolt prompting effectively: https://support.bolt.new/docs/prompting-effectively
- OpenRouter free models router: https://openrouter.ai/docs/guides/get-started/free-models-router-playground
- Tonik empty-state activation patterns: https://www.tonik.com/blog/empty-state-design-activation-patterns
- Athenic streaming research: https://getathenic.com/blog/streaming-llm-responses-real-time-ux

Full source list (20 references) archived in conversation log on 2026-04-18.
