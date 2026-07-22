#!/usr/bin/env node
// Dean regression suite. No framework, no dependency. Run: node test.js
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  parseSource,
  renderCursorCore,
  renderCursorReview,
  renderClaudeSkill,
  validateOutput,
  build,
  yamlQuote,
  CURSOR_CORE_OUT,
  CURSOR_REVIEW_OUT,
  CLAUDE_OUT,
} = require("./generate.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok  - ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL - ${name}`);
    console.log(`     ${err.message}`);
  }
}

function minimalSource(overrides) {
  const o = Object.assign(
    {
      brainstorm: "Brainstorm content.",
      ponytail: "Ponytail content.",
      review: "Review content.",
      note: "Standalone note.",
    },
    overrides
  );
  return `---
title: Dean
description: test fixture
---

<!-- BLOCK:BRAINSTORM -->
${o.brainstorm}
<!-- /BLOCK -->

<!-- BLOCK:PONYTAIL -->
${o.ponytail}
<!-- /BLOCK -->

<!-- BLOCK:REVIEW -->
${o.review}
<!-- /BLOCK -->

<!-- BLOCK:REVIEW_STANDALONE_NOTE -->
${o.note}
<!-- /BLOCK -->
`;
}

test("parses a well-formed source", () => {
  const { fm, blocks } = parseSource(minimalSource());
  assert.strictEqual(fm.title, "Dean");
  assert.strictEqual(blocks.BRAINSTORM, "Brainstorm content.");
});

test("rejects a missing block", () => {
  const src = minimalSource().replace(
    /<!-- BLOCK:REVIEW_STANDALONE_NOTE -->[\s\S]*?<!-- \/BLOCK -->/,
    ""
  );
  assert.throws(() => parseSource(src), /missing block: REVIEW_STANDALONE_NOTE/);
});

test("rejects a duplicated block", () => {
  const dupe = minimalSource();
  const src = dupe + `\n<!-- BLOCK:BRAINSTORM -->\nagain\n<!-- /BLOCK -->\n`;
  assert.throws(() => parseSource(src), /duplicate block: BRAINSTORM/);
});

test("rejects an empty block", () => {
  const src = minimalSource({ ponytail: "" });
  assert.throws(() => parseSource(src), /block PONYTAIL is empty/);
});

test("rejects missing frontmatter fields", () => {
  const src = minimalSource().replace("title: Dean\n", "");
  assert.throws(() => parseSource(src), /missing 'title'/);
});

test("REGRESSION: parses correctly with CRLF line endings", () => {
  const crlfSource = minimalSource().replace(/\n/g, "\r\n");
  const { fm, blocks } = parseSource(crlfSource);
  assert.strictEqual(fm.title, "Dean");
  assert.strictEqual(blocks.REVIEW, "Review content.");
});

test("REGRESSION: a stray '---' divider inside a block body doesn't break frontmatter parsing", () => {
  const src = minimalSource({ ponytail: "Some text.\n\n---\n\nMore text after a divider." });
  const { fm, blocks } = parseSource(src);
  assert.strictEqual(fm.title, "Dean");
  assert.ok(blocks.PONYTAIL.includes("More text after a divider."));
});

test("REGRESSION: mentioning marker syntax inline in prose doesn't break parsing", () => {
  const src = minimalSource({
    brainstorm: "Here's how markers work: `<!-- BLOCK:PONYTAIL --> ... <!-- /BLOCK -->` is the syntax.",
  });
  const { blocks } = parseSource(src);
  assert.ok(blocks.BRAINSTORM.includes("is the syntax."));
});

test("REGRESSION: parses correctly with a UTF-8 BOM prefix", () => {
  const src = "\uFEFF" + minimalSource();
  const { fm } = parseSource(src);
  assert.strictEqual(fm.title, "Dean");
});

// Regression test: a colon or quote inside a description must not corrupt
// the emitted YAML frontmatter (found during external review).
test("REGRESSION: yamlQuote escapes colons and quotes so frontmatter stays valid YAML", () => {
  const quoted = yamlQuote('has a colon: and a "quote" too');
  assert.strictEqual(quoted, '"has a colon: and a \\"quote\\" too"');
  // A line "description: <quoted>" must have exactly one unescaped, unquoted colon.
  const line = `description: ${quoted}`;
  assert.strictEqual(line.match(/(?<!\\)"/g).length, 2, "quotes must be paired and escaped internally");
});

test("rendered outputs carry no leaked BLOCK markers and pass validateOutput", () => {
  const { blocks } = parseSource(minimalSource());
  validateOutput("cursor-core", renderCursorCore(blocks));
  validateOutput("cursor-review", renderCursorReview(blocks));
  validateOutput("claude", renderClaudeSkill(blocks));
});

test("cursor-core is Always Apply and cursor-review is Agent Requested", () => {
  const { blocks } = parseSource(minimalSource());
  const core = renderCursorCore(blocks);
  const review = renderCursorReview(blocks);
  assert.match(core, /alwaysApply: true/);
  assert.match(review, /alwaysApply: false/);
  // REVIEW content must live in the review file, not leak into core, and vice versa.
  assert.ok(core.includes("Ponytail content."));
  assert.ok(!core.includes("Review content."));
  assert.ok(review.includes("Review content."));
  assert.ok(!review.includes("Ponytail content."));
});

test("build() is deterministic (same input -> byte-identical output)", () => {
  const src = minimalSource();
  const a = build(src);
  const b = build(src);
  assert.deepStrictEqual(a, b);
});

test("INTEGRATION: real RULES.md generates and passes --check", () => {
  const rulesPath = path.join(__dirname, "RULES.md");
  const raw = fs.readFileSync(rulesPath, "utf8");
  const { cursorCoreContent, cursorReviewContent, claudeContent } = build(raw);
  validateOutput("cursor-core", cursorCoreContent);
  validateOutput("cursor-review", cursorReviewContent);
  validateOutput("claude", claudeContent);
  assert.ok(cursorCoreContent.split("\n").length > 80, "cursor-core output should be substantial");
  assert.ok(claudeContent.split("\n").length > 150, "claude output should be substantial");
});

test("INTEGRATION: CLI --check exits 0 on the real file", () => {
  const out = execFileSync("node", [path.join(__dirname, "generate.js"), "--check"], {
    encoding: "utf8",
  });
  assert.match(out, /check: OK/);
});

// Rewritten per external review: the old version of this test named itself
// after the CLI but actually called build() directly via `node -e`, never
// exercising main()'s try/catch, exit code, or "Dean: " error prefix. This
// version runs the real CLI as a subprocess against a genuinely broken file.
test("INTEGRATION: CLI fails loudly (non-zero exit, 'Dean:' prefix) on a broken file", () => {
  console.log("     --- expected failure below: this test intentionally breaks the input ---");
  const tmp = path.join(require("os").tmpdir(), `dean-broken-${Date.now()}.md`);
  fs.writeFileSync(tmp, minimalSource().replace("<!-- /BLOCK -->\n\n<!-- BLOCK:PONYTAIL -->", ""));
  let exitCode = 0;
  let stderr = "";
  try {
    execFileSync("node", [path.join(__dirname, "generate.js"), "--check"], {
      env: Object.assign({}, process.env, { DEAN_RULES_PATH: tmp }),
      encoding: "utf8",
    });
  } catch (e) {
    exitCode = e.status;
    stderr = e.stderr;
  } finally {
    fs.unlinkSync(tmp);
  }
  assert.strictEqual(exitCode, 1, "expected the real CLI to exit 1 on a broken RULES.md");
  assert.match(stderr, /^Dean: /, "expected the 'Dean: ' error prefix from main()'s catch block");
});

// Drift check per external review: nothing previously verified that the
// files actually checked into build/ match what RULES.md currently produces.
// If someone edits RULES.md and forgets to run `npm run generate` before
// committing, this is the test that catches it.
test("INTEGRATION: committed build/ files match a fresh generate from RULES.md (no drift)", () => {
  const rulesPath = path.join(__dirname, "RULES.md");
  const raw = fs.readFileSync(rulesPath, "utf8");
  const fresh = build(raw);
  const onDisk = {
    cursorCoreContent: fs.readFileSync(CURSOR_CORE_OUT, "utf8"),
    cursorReviewContent: fs.readFileSync(CURSOR_REVIEW_OUT, "utf8"),
    claudeContent: fs.readFileSync(CLAUDE_OUT, "utf8"),
  };
  assert.deepStrictEqual(
    onDisk,
    fresh,
    "committed build/ is stale — run `npm run generate` and commit the result"
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
