# Dev Workflow Plugin — Design Spec

## Goal
One canonical source of coding-workflow rules, generated into two platform-specific
files: a Cursor rules file and a Claude Code skill. Three phases: brainstorm-first
design gate, "ponytail" lazy/minimal-diff implementation discipline, and a strict
review pass (resource/security/business-logic + code-review-reception discipline).
Review is independently invocable, not gated behind the other two phases.

## Architecture
```
plugin-source/
  RULES.md              canonical source, YAML frontmatter + 4 marker blocks
  generate.js            zero-dependency Node script: RULES.md -> both outputs
  build/
    .cursor/rules/dev-workflow.mdc
    .claude/skills/dev-workflow/SKILL.md
```

## RULES.md block markers (fixed order, HTML comments)
`<!-- BLOCK:BRAINSTORM -->...<!-- /BLOCK -->`, then `PONYTAIL`, then `REVIEW`,
then `REVIEW_STANDALONE_NOTE`. Content is prose/markdown, copied verbatim into
each output — no per-block templating logic, just extraction + placement.

## Output differences (why they aren't identical)
- Cursor `.mdc` cannot hard-block tool calls, so its BRAINSTORM section is worded
  as a strong advisory directive, with an explicit note that enforcement is not
  technically guaranteed.
- Claude `SKILL.md` description field is a single trigger-condition line (always
  resident in context); the full HARD-GATE text lives in the body (only loaded
  when the skill fires), and is written as an enforceable instruction Claude
  actually follows via tool-call restraint.
- Both outputs state REVIEW is standalone-invocable.
- Per latest direction: no token-minimization constraint on the generated files.
  Full detail from the three source docs is preserved in both outputs (200+
  lines each is acceptable and expected).

## generate.js behavior
- Parses frontmatter (title, description) and the 4 blocks from RULES.md.
- Fails loudly (throws, non-zero exit) if a marker is missing, duplicated, or a
  block is empty.
- Writes both output files with their own correct frontmatter.
- `--check` mode: runs generation into memory, additionally verifies each output
  file's frontmatter parses as valid YAML and that no leftover `BLOCK:` marker
  text appears in either generated file. Non-zero exit on any failure.

## Testing
Run `node generate.js --check` after generation and show the actual pass/fail
output — not assumed. This is the "one runnable check" for a non-trivial script,
per ponytail's own rule about leaving a check behind.

## Scope
No config options, no CLI flags beyond `--check`, no npm dependency. This is the
whole plugin — not a general-purpose plugin framework.
