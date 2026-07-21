# Dean

A dev-workflow plugin: brainstorm-first design gate → lazy/minimal-diff
implementation → standalone strict code review. One canonical source
(`RULES.md`), generated into both a Cursor rule and a Claude Code skill.
<p align="center">
  <img src="Dean/Dean/Dean.png" alt="Dean Banner" width="400">
</p>

## Install

**Cursor:** copy `build/.cursor/rules/dean.mdc` into your repo's `.cursor/rules/`.

**Claude Code:** copy `build/.claude/skills/dean/` into your repo's `.claude/skills/`.

## Editing the rules

Edit `RULES.md`, then regenerate:

```
npm run generate   # writes both platform files
npm run check       # validates output without writing (CI-friendly)
npm test            # full regression suite
```

## How it's structured

`RULES.md` has YAML frontmatter (`title`, `description`) followed by four
HTML-comment-delimited blocks, in fixed order: `BRAINSTORM`, `PONYTAIL`,
`REVIEW`, `REVIEW_STANDALONE_NOTE`. `generate.js` extracts each block verbatim
and places it into both output files — there's no per-block templating logic,
just extraction and placement.

The two outputs aren't identical:
- Cursor can't hard-block tool calls, so its brainstorm section is worded as a
  strong advisory directive with an explicit note that enforcement isn't
  guaranteed.
- The Claude skill's `description` field (always resident in context once the
  skill is installed) is a single trigger-condition line; the full rule text
  lives in the body, which only loads when the skill actually fires.
- `REVIEW` is independently invocable in both — it doesn't require the other
  two phases to have run first.

## Benchmark (last run)

200 consecutive `generate` runs on the reference machine:

| metric | value |
|---|---|
| avg | 41.6 ms |
| p50 | 40.6 ms |
| p95 | 50.0 ms |
| max | 68.1 ms |
| output hash variance across 200 runs | 0 (fully deterministic) |

Re-run it yourself with `node generate.js` in a loop — there's nothing
environment-specific baked into these numbers, they're just Node startup +
regex parsing of a ~10KB file, so they should hold on any machine.

## Known limitations (honest, not marketing)

- **Frontmatter parsing is a hand-rolled `key: value` line reader, not a real
  YAML parser.** It will reject multi-line values, lists, or nested structures
  in the frontmatter. Fine for the current two fields; would need a real
  parser (e.g. `js-yaml`) if the frontmatter grows more complex.
- **No CI configured yet.** `npm test` exists and passes locally; there's no
  GitHub Actions workflow wired up to run it on push/PR. Anyone forking this
  should add one before accepting outside contributions.
- **Cursor enforcement is advisory only.** Nothing in the `.mdc` format can
  actually force the "don't implement before approval" gate the way the
  Claude skill's tool-call restraint can. This is stated in the generated file
  itself, not hidden.
- **No versioning/changelog automation.** Bumping `package.json`'s version is
  manual; there's no semantic-release or similar wired in.
- **Single maintainer's judgment calls are baked into `RULES.md`.** The review
  checklist (security, resource use, business logic) is a reasonable general
  checklist, not an exhaustive one — treat it as a floor, not a ceiling.

## Fixed during review

A CRLF (Windows line-ending) file previously failed to parse at all — the
frontmatter regex required a literal `\n---\n` which never appears in a
`\r\n`-terminated file. This is now normalized on read and covered by a
regression test in `test.js` (`REGRESSION: parses correctly with CRLF line
endings`), along with a second regression test confirming a stray `---`
markdown divider inside a block's body can't be mistaken for the frontmatter
delimiter (frontmatter search is now bounded to the text before the first
block marker, so body content is never in scope for that regex at all).

## License

MIT (see `LICENSE`) — picked as the default for a small open-source utility;
swap it if you want something else before publishing.
