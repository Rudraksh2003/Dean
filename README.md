# Dean (currently on testing )
# Dean improving day by day
Brainstorm-first design gate → lazy, minimal-diff implementation → standalone
strict code review. One canonical rules file, generated into both a Cursor
rule and a Claude Code skill, so you write the rules once and get both.


A dev-workflow plugin: brainstorm-first design gate → lazy/minimal-diff
implementation → standalone strict code review. One canonical source
(`RULES.md`), generated into both a Cursor rule and a Claude Code skill.
<p align="center">
  <img src="Dean/Dean/Dean.png" alt="Dean Banner" width="400">
</p>

- **License:** MIT
- **Requires:** Node.js 14+ (only for editing/regenerating — installing the
  generated files needs nothing)


## Table of contents

- [What's in the box](#whats-in-the-box)
- [Install (using Dean as-is)](#install-using-dean-as-is)
- [Editing the rules (contributing to Dean itself)](#editing-the-rules-contributing-to-dean-itself)
- [Project structure](#project-structure)
- [How it works](#how-it-works)
- [Testing](#testing)
- [Benchmark](#benchmark-last-run)
- [Known limitations](#known-limitations-honest-not-marketing)
- [Contributing](#contributing)
- [License](#license)

## What's in the box

Three phases, one source of truth:

1. **Brainstorm** — a hard gate against writing code before a design is
   proposed and approved, even for "simple" tasks. One clarifying question at
   a time, 2–3 approaches with a recommendation, incremental section-by-section
   approval.
2. **Ponytail** — a 7-rung laziness ladder (YAGNI → reuse → stdlib → platform
   → existing dependency → one-liner → minimum new code), root-cause-not-symptom
   bug fixing, and a `ponytail:` comment convention for marking deliberate
   shortcuts with their ceiling.
3. **Review** *(works standalone — doesn't need the other two phases to have run)*
   — a checklist for DB-calls-in-loops and other resource waste, a security
   pass (XSS, SQLi, secrets in code, authz gaps, unsafe deserialization,
   injection), a business-logic/stability check, and a code-review-reception
   discipline (verify before implementing, no performative agreement, source-
   specific handling for trusted vs. external feedback).

## Install (using Dean as-is)

You don't need Node, npm, or this repo's tooling just to *use* Dean — only the
two generated files matter. Drop them into your own project at its repo root:

```
your-project/
├── .cursor/
│   └── rules/
│       └── dean.mdc              <- from build/.cursor/rules/dean.mdc
├── .claude/
│   └── skills/
│       └── dean/
│           └── SKILL.md          <- from build/.claude/skills/dean/SKILL.md
└── (the rest of your project)
```

- **Cursor** auto-discovers `.cursor/rules/` from the repo root — nothing to
  configure.
- **Claude Code** auto-discovers `.claude/skills/` from the repo root — new
  skills are picked up on the next session.

You can install just one of the two files if you only use one tool.

## Editing the rules (contributing to Dean itself)

If you want to change what Dean actually says — not just install it — clone
this repo and work from `RULES.md`:

```bash
npm run generate   # writes both platform files to build/
npm run check       # validates output without writing anything (CI-friendly)
npm test            # full regression suite
```

After `npm run generate`, copy the two files out of `build/` into wherever
your target project's `.cursor/rules/` and `.claude/skills/dean/` live.

## Project structure

```
Dean/
├── RULES.md              canonical source — edit this
├── generate.js            generator + CLI (node generate.js [--check])
├── test.js                regression suite (node test.js)
├── package.json
├── build/                 generated output — don't hand-edit, it's overwritten
│   ├── .cursor/rules/dean.mdc
│   └── .claude/skills/dean/SKILL.md
└── docs/superpowers/specs/  design history
```

## How it works

`RULES.md` has YAML frontmatter (`title`, `description`) followed by four
HTML-comment-delimited blocks, in fixed order: `BRAINSTORM`, `PONYTAIL`,
`REVIEW`, `REVIEW_STANDALONE_NOTE`. `generate.js` extracts each block verbatim
and places it into both output files — there's no per-block templating logic,
just extraction and placement into each platform's own frontmatter wrapper.

The two outputs aren't identical:
- Cursor can't hard-block tool calls, so its brainstorm section is worded as a
  strong advisory directive, with an explicit note in the file itself that
  enforcement isn't guaranteed.
- The Claude skill's `description` field (always resident in context once the
  skill is installed) is a single trigger-condition line; the full rule text
  lives in the body, which only loads into context when the skill actually
  fires.
- `REVIEW` is independently invocable in both outputs.

## Testing

`node test.js` runs 12 checks: unit tests against `parseSource`/`renderCursor`/
`renderClaudeSkill` directly, two permanent regression tests (see below), and
three integration tests that shell out to the real CLI against the real
`RULES.md`.

**One test prints a stack trace on purpose.** The test named `CLI fails
loudly (non-zero exit) on a broken file` feeds a deliberately broken RULES.md
into the generator to prove it dies loudly instead of silently producing bad
output. `execFileSync` passes that child process's stderr straight through to
your terminal even though the parent test catches it and marks it `ok`. The
test now prints `--- expected failure below ---` right before it runs, so the
trace is labeled rather than looking like something actually broke. If you
ever see `N passed, 0 failed` at the bottom, everything passed — the trace
above it is the test working as intended, not a crash.

## Benchmark (last run)

200 consecutive `generate` runs on the reference machine:

| metric | value |
|---|---|
| avg | 41.6 ms |
| p50 | 40.6 ms |
| p95 | 50.0 ms |
| max | 68.1 ms |
| output hash variance across 200 runs | 0 (fully deterministic) |

Re-run it yourself with a loop around `node generate.js` — there's nothing
environment-specific baked into these numbers, they're just Node startup +
regex parsing of a ~10KB file, so they should hold on most machines.

## Known limitations (honest, not marketing)

- **Frontmatter parsing is a hand-rolled `key: value` line reader, not a real
  YAML parser.** It'll reject multi-line values, lists, or nested structures
  in the frontmatter. Fine for the current two fields; would need a real
  parser (e.g. `js-yaml`) if the frontmatter grows more complex.
- **No CI configured yet.** `npm test` passes locally; there's no GitHub
  Actions workflow wired up to run it on push/PR yet — add one before
  accepting outside contributions at scale.
- **Cursor enforcement is advisory only.** Nothing in the `.mdc` format can
  actually force the "don't implement before approval" gate the way the
  Claude skill's tool-call restraint can, and the generated file says so.
- **No versioning/changelog automation.** Bumping `package.json`'s version is
  manual.
- **The review checklist reflects one set of judgment calls**, not an
  exhaustive security/performance audit standard — treat it as a floor, not a
  ceiling, and send a PR if you find a real gap.

### Fixed during review
A CRLF (Windows line-ending) file previously failed to parse at all — the
frontmatter regex required a literal `\n---\n`, which never appears in a
`\r\n`-terminated file. Fixed by normalizing line endings on read, with a
permanent regression test (`REGRESSION: parses correctly with CRLF line
endings`). A second regression test confirms a stray `---` markdown divider
inside a block's body can't be mistaken for the frontmatter delimiter — the
frontmatter search is bounded to only the text before the first block marker,
so block body content is never in scope for that regex at all.

## Contributing

1. Edit `RULES.md`.
2. `npm run generate && npm test` — all 12 tests must pass.
3. If you're fixing a bug, add a regression test for it in `test.js` before
   the fix (see the CRLF test for the pattern) — that's what stops it coming
   back silently.
4. Open a PR. There's no CI yet (see limitations above), so paste your local
   `npm test` output in the PR description until one exists.

## License

MIT — see [`LICENSE`](./LICENSE).
