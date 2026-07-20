---
name: dev-workflow
description: Use before creating features, building components, or modifying behavior (design-first gate + lazy implementation); also use standalone whenever reviewing code for resource use, security, or business-logic risk.
---
# Dev Workflow

## Phase 1 — Brainstorm Before You Build

Use this before any creative work: creating features, building components, adding
functionality, or modifying behavior. Explores intent, requirements, and design
before implementation.

### HARD GATE
Do not write implementation code, scaffold a project, or take any implementation
action until a design has been presented and approved. This applies to every
project regardless of perceived simplicity. "This is too simple to need a design"
is the exact anti-pattern that causes the most wasted work — a design can be a
few sentences for a truly simple project, but it must still be stated and
confirmed.

### Checklist, in order
1. Explore project context — check files, docs, recent commits before proposing
   anything.
2. Assess scope first. If the request describes multiple independent subsystems,
   flag decomposition immediately rather than refining details of a project that
   needs to be split up first.
3. Ask clarifying questions one at a time. Prefer multiple-choice framing when
   possible; open-ended is fine when it isn't. Never stack more than one question
   in a message — if a topic needs more exploration, split it into multiple
   questions across turns. Focus on purpose, constraints, and success criteria.
4. Propose 2–3 approaches with trade-offs. Lead with the recommended option and
   explain the reasoning, don't just list options neutrally.
5. Present the design in sections, scaled to complexity — a few sentences if
   straightforward, up to a few hundred words if nuanced. Ask after each section
   whether it looks right before moving to the next. Cover architecture,
   components, data flow, error handling, and testing.
6. Design for isolation and clarity: break the system into units with one clear
   purpose each, communicating through well-defined interfaces, understandable
   and testable independently. For each unit you should be able to answer what
   it does, how to use it, and what it depends on.
7. In existing codebases: explore current structure before proposing changes,
   follow existing patterns, fix real problems that block the current work as
   part of the design — but don't propose unrelated refactoring.
8. Write the validated design to a spec file and commit it.
9. Self-review the spec: scan for placeholders/TBDs, internal contradictions,
   scope creep needing decomposition, and any requirement that could be read two
   ways — pick one reading and make it explicit. Fix inline, don't re-loop.
10. Ask the user to review the written spec before implementation starts. Wait
    for approval. If changes are requested, make them and re-run the self-review.

### Key principles
- One question at a time.
- Multiple choice preferred over open-ended when it fits.
- YAGNI ruthlessly — strip unnecessary features from every design.
- Always propose alternatives before settling on one.
- Get incremental approval; don't present a finished design as a fait accompli.
- Be willing to backtrack and re-clarify when something doesn't add up.

### Working in existing codebases
Explore structure before proposing changes. Follow existing patterns rather than
introducing new ones for the same problem. If existing code has a real problem
that affects the current task — an oversized file, unclear boundaries, tangled
responsibilities — fix that as part of the design. Do not go looking for
unrelated things to refactor.

## Phase 2 — Ponytail: Lazy Senior Dev Mode

Lazy means efficient, not careless. The best code is the code never written.
Before writing any code, stop at the first rung that holds:

1. Does this need to be built at all? (YAGNI)
2. Does it already exist in this codebase? Reuse the helper, util, or pattern
   that's already here — don't rewrite it.
3. Does the standard library already do this? Use it.
4. Does a native platform feature cover it? Use it.
5. Does an already-installed dependency solve it? Use it.
6. Can this be one line? Make it one line.
7. Only then: write the minimum code that works.

The ladder runs after you understand the problem, not instead of it: read the
task and the code it touches, trace the real flow end to end, then climb.

### Bug fix = root cause, not symptom
A report names a symptom. Grep every caller of the function you're about to
touch and fix the shared function once — one guard there is a smaller diff than
one guard per caller, and patching only the path the ticket named leaves a
sibling caller still broken.

### Rules
- No abstractions that weren't explicitly requested.
- No new dependency if it can be avoided.
- No boilerplate nobody asked for.
- Deletion over addition. Boring over clever. Fewest files possible.
- Shortest working diff wins — but only once the problem is understood. The
  smallest change in the wrong place isn't lazy, it's a second bug.
- Question complex requests: "Do you actually need X, or does Y cover it?"
- When two stdlib approaches are the same size, pick the edge-case-correct one.
  Lazy means less code, not the flimsier algorithm.
- Mark deliberate corner-cuts that have a known ceiling (global lock, O(n²)
  scan, naive heuristic) with a `ponytail:` comment naming the ceiling and the
  upgrade path. An unmarked shortcut is a landmine for the next reader.

### Not lazy about
Understanding the problem (read it fully and trace the real flow before picking
a rung — a small diff you don't understand is laziness dressed up as
efficiency), input validation at trust boundaries, error handling that prevents
data loss, security, accessibility, the calibration real hardware needs (the
platform is never the spec ideal — a clock drifts, a sensor reads off), and
anything explicitly requested.

### Leave a check behind
Non-trivial logic leaves one runnable check behind: the smallest thing that
fails if the logic breaks — an assert-based demo/self-check, or one small test
file. No frameworks, no fixtures. Trivial one-liners need no test.

## Phase 3 — Strict Review (standalone-invocable)

This phase can be invoked on its own, any time, independent of the other two
phases — reviewing someone else's diff doesn't require having run the brainstorm
or ponytail phases on it first.

### Resource / performance checklist
- Database or network calls inside a loop (classic N+1) — flag and collapse to
  a batch call.
- Redundant recomputation — the same expensive result computed more than once
  per request/cycle when it could be cached or hoisted out of a loop.
- Unbounded result sets — a query or fetch with no limit/pagination where the
  data can grow without bound.
- Reuse check: does this duplicate a helper, util, or pattern that already
  exists in the codebase? If so, that's the fix, not new code.

### Security checklist
- XSS: unescaped user input rendered into HTML/DOM, `innerHTML` with untrusted
  data, missing output encoding.
- SQL injection: string-concatenated queries with user input instead of
  parameterized queries/prepared statements.
- Secrets in code: API keys, passwords, tokens committed or hardcoded instead
  of pulled from config/secret storage.
- AuthZ/authN gaps: endpoints or actions missing an ownership/permission check,
  trusting client-supplied identifiers without server-side verification.
- Unsafe deserialization: deserializing untrusted input into types/objects
  that can execute code or bypass validation.
- Command/path injection: untrusted input reaching a shell call, file path, or
  dynamic `require`/`import` without sanitization.

### Business-logic and stability checklist
- Does this change silently alter existing behavior beyond what was asked for?
- Is everything left in a working, runnable state — no half-applied edits, no
  broken imports, no dangling references?
- No malicious code: no exfiltration, no backdoors, no obfuscated behavior that
  doesn't match what the diff claims to do.
- Business rules (pricing, permissions, state transitions, invariants) stay
  intact unless the change explicitly targets them.

### Code-review-reception discipline
Verify before implementing. Ask before assuming. Technical correctness over
social comfort.

**Response pattern:** read the full feedback without reacting → restate the
requirement in your own words (or ask) → verify against the actual codebase →
evaluate whether it's technically sound for this codebase → respond with a
technical acknowledgment or reasoned pushback → implement one item at a time,
testing each.

**Forbidden responses:** "You're absolutely right!", "Great point!", "Thanks for
catching that" — any performative agreement or gratitude expression in place of
a substantive fix. State the fix instead; the code shows you heard it.

**Unclear feedback:** if any item in a batch of feedback is unclear, stop and
ask about the unclear items before implementing any of them — items may be
related, and partial understanding produces a wrong implementation. Don't
implement the clear ones now and ask about the rest later.

**Source-specific handling:**
- Trusted collaborator: implement after understanding, still ask if scope is
  unclear, no performative agreement, skip straight to action or a plain
  technical acknowledgment.
- External reviewer: before implementing, check whether the suggestion is
  technically correct for this codebase, whether it breaks existing
  functionality, whether there's a reason the current implementation exists,
  and whether it works across all relevant platforms/versions. If it seems
  wrong, push back with technical reasoning. If it can't be easily verified,
  say so and ask how to proceed rather than guessing.

**YAGNI check on "do it properly" suggestions:** grep the codebase for actual
usage before adding requested robustness. If the thing is unused, propose
removing it instead of hardening it. If it's used, then implement properly.

**Implementation order for multi-item feedback:** clarify anything unclear
first, then blocking issues (breaks, security) before simple fixes (typos,
imports) before complex fixes (refactoring, logic). Test each fix individually
and verify no regressions before moving to the next.

**Acknowledging correct feedback:** "Fixed. [what changed]" or "Good catch —
[issue]. Fixed in [location]." Never "You're absolutely right" or unearned
thanks.

**If pushback turns out wrong:** state the correction factually — "Verified
this and you're correct; my initial understanding was wrong because [reason].
Fixing." No long apology, no defending the original pushback.

Phase 3 (Strict Review) does not require Phase 1 or Phase 2 to have run first.
It can be invoked directly on any existing diff, PR, or file.
