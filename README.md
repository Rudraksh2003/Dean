# Dean (Dean on testing and improving day by day)

<p align="center">
  <img src="Dean/Dean/Dean.png" alt="Dean Banner" width="400">
</p>
**Guardrails for AI coding assistants — one rules file, generated into a Cursor rule and a Claude Code skill.**

Dean makes Cursor and Claude Code design before they build, stay lazy about
code volume while staying strict about architecture, and run a real code
review — security, resource waste, and business-logic risk — on demand.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D14-brightgreen.svg)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-14%20passing%20(local)-brightgreen.svg)](./test.js)

---

## Why Dean exists

AI coding assistants are fast at producing code and slow at knowing when to
stop. Left alone, they'll happily turn one feature request into
`auth.go`, `auth2.go`, `helper.go`, `utils.go`, `middleware.go`,
`manager.go`, `service.go`, `controller.go`, `validator.go`, `factory.go` —
ten files where one function would've done, because nothing in the default
setup ever told it to check first.

Dean is three enforced habits, not three hundred lines of vague advice:

1. **Design before code.** A hard gate against implementation until a design
   is proposed and approved — even for "simple" tasks, especially for
   "simple" tasks.
2. **Lazy, architecture-respecting implementation.** A 7-rung laziness ladder
   (YAGNI → reuse → stdlib → platform → existing dependency → one-liner →
   minimum new code), plus explicit rules against file sprawl, god objects,
   and circular dependencies — the stuff plain "write less code" advice
   misses.
3. **A real review pass, usable standalone.** Security (XSS, SQLi, secrets in
   code, authz gaps, unsafe deserialization, injection), resource waste
   (N+1s, unbounded queries, redundant recomputation), business-logic
   stability, and a code-review-reception discipline that bans performative
   agreement in favor of actually verifying feedback.

## Install

Two files, no runtime dependency, works in either tool or both:

```
your-project/
├── .cursor/rules/dean.mdc              ← Cursor: auto-discovered, no config
└── .claude/skills/dean/SKILL.md        ← Claude Code: picked up next session
```

Grab both from [`build/`](./build) in this repo, or generate your own copy
(see below). Use just one file if you only run one tool.

## Quick start (editing the rules yourself)

```bash
git clone https://github.com/<your-org>/dean.git
cd dean
npm run generate   # RULES.md -> build/.cursor + build/.claude
npm run check       # validates output without writing anything (CI-friendly)
npm test            # 14-test regression suite
```

Then copy the two files out of `build/` into your target project's
`.cursor/rules/` and `.claude/skills/dean/`.

## How it works

One canonical file, `RULES.md`, holds four marker-delimited blocks —
`BRAINSTORM`, `PONYTAIL`, `REVIEW`, `REVIEW_STANDALONE_NOTE` — and
`generate.js` extracts each block verbatim into both platform files. No
templating engine, no build step beyond string extraction, because a prose
rules file doesn't need one.

The two outputs genuinely differ, not just cosmetically:
- **Cursor** can't hard-block tool calls, so its design-gate section is
  worded as a strong advisory directive, with an explicit note in the file
  that enforcement isn't guaranteed by the platform.
- **Claude Code**'s skill `description` field (always resident in context
  once installed) is a single trigger-condition line; the full rule text
  only loads when the skill actually fires.
- **Review** is independently invocable in both — reviewing a diff you
  didn't write doesn't require having run the other two phases on it.

## Dean vs. a plain `.cursorrules` file

| | Plain `.cursorrules` / ad-hoc prompt | Dean |
|---|---|---|
| Design-before-code gate | Rare, usually forgotten under deadline pressure | Built in, phase 1, non-negotiable |
| Stops file sprawl (`auth2.go`, `helper.go`...) | Not unless you wrote it yourself | Explicit architecture-discipline rules |
| Security/resource review | Ad hoc, whatever you remember to ask for | Standing checklist, invocable standalone |
| Works on Cursor **and** Claude Code | Usually one or the other, drifting apart over time | One source, both platforms, always in sync |
| Claims about reliability | Untested | 14 regression tests, adversarially fuzzed, documented limitations below |

## Testing

`npm test` runs 14 checks — unit tests, permanent regressions for every real
bug found during development, and integration tests against the actual
`RULES.md`. One test intentionally triggers a crash to prove the CLI fails
loudly on bad input instead of silently producing garbage; it prints
`--- expected failure below ---` right before the stack trace so it doesn't
look like something broke when it's actually the test working.

## Benchmark (last run)

100 consecutive `generate` runs, reference machine:

| metric | value |
|---|---|
| avg | 33.2 ms |
| p95 | 37.8 ms |
| output hash variance across 100 runs | 0 — fully deterministic |

Nothing environment-specific is baked in — it's Node startup plus regex
parsing of a ~10KB file. Re-run it yourself; the numbers should hold on most
machines.

## Bugs found, fixed, and locked in (the honest changelog)

Every one of these was found by deliberately trying to break the parser, not
assumed away, and every fix has a permanent regression test so it can't
silently come back:

- **CRLF line endings** (Windows saves, `core.autocrlf`) — the frontmatter
  regex required a literal `\n---\n`, which doesn't exist in a `\r\n` file.
  Fixed by normalizing on read; `.gitattributes` now also forces LF at the
  git layer.
- **UTF-8 BOM** (Notepad's default) — same root failure, different cause.
  Fixed by stripping a BOM before parsing anything else.
- **Marker syntax mentioned inline in prose** — documenting Dean's own
  format inside a block ("here's how `<!-- BLOCK:X -->` works") was
  misread as a real marker. Fixed by requiring markers to occupy their own
  line.
- **Investigated, not a bug:** a stray `---` divider inside a block body was
  suspected to confuse frontmatter detection. It doesn't — the parser always
  takes the first `---` in the file. Hardened anyway so it's structurally
  impossible rather than just untested.

## Known limitations (no marketing gloss)

- Frontmatter parsing is a hand-rolled `key: value` reader, not real YAML —
  fine for two fields, would need `js-yaml` if that grows.
- No CI configured. `npm test` passes locally; nothing runs it automatically
  on push/PR yet.
- Cursor's design gate is advisory only — nothing in `.mdc` can technically
  enforce it, and the generated file says so rather than overclaiming.
- A marker written *alone on its own line* purely as a documentation example
  is still indistinguishable from a real one. Use a fenced code block with
  extra text on the line if you ever need to show the syntax verbatim.
- The review checklist is one reasonable set of judgment calls, not an
  exhaustive security audit standard. Treat it as a floor.

## Contributing

1. Edit `RULES.md`.
2. `npm run generate && npm test` — all 14 tests must pass.
3. Fixing a bug? Add a regression test for it first (see the CRLF test in
   `test.js` for the pattern) — that's what stops it coming back silently.
4. Open a PR with your local `npm test` output pasted in, since there's no CI
   yet.

## License

MIT — see [`LICENSE`](./LICENSE).

---

*Cursor rules · Claude Code skill · AI coding assistant guardrails · code
review checklist · dev workflow enforcement*
