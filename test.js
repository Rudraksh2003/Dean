#!/usr/bin/env node
// Dean regression suite. No framework, no dependency. Run: node test.js
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { parseSource, renderCursor, renderClaudeSkill, validateOutput, build } = require("./generate.js");

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

// Regression test for the CRLF bug found during review: a file saved with
// Windows line endings (or checked out with core.autocrlf) must still parse.
test("REGRESSION: parses correctly with CRLF line endings", () => {
  const crlfSource = minimalSource().replace(/\n/g, "\r\n");
  const { fm, blocks } = parseSource(crlfSource);
  assert.strictEqual(fm.title, "Dean");
  assert.strictEqual(blocks.REVIEW, "Review content.");
});

// Regression test: a "---" markdown divider inside a block body must not be
// mistaken for the frontmatter's closing delimiter.
test("REGRESSION: a stray '---' divider inside a block body doesn't break frontmatter parsing", () => {
  const src = minimalSource({ ponytail: "Some text.\n\n---\n\nMore text after a divider." });
  const { fm, blocks } = parseSource(src);
  assert.strictEqual(fm.title, "Dean");
  assert.ok(blocks.PONYTAIL.includes("More text after a divider."));
});

test("rendered outputs carry no leaked BLOCK markers and pass validateOutput", () => {
  const { fm, blocks } = parseSource(minimalSource());
  const cursor = renderCursor(fm, blocks);
  const claude = renderClaudeSkill(fm, blocks);
  validateOutput("cursor", cursor);
  validateOutput("claude", claude);
});

test("build() is deterministic (same input -> byte-identical output)", () => {
  const src = minimalSource();
  const a = build(src);
  const b = build(src);
  assert.strictEqual(a.cursorContent, b.cursorContent);
  assert.strictEqual(a.claudeContent, b.claudeContent);
});

// Integration test against the real, checked-in RULES.md.
test("INTEGRATION: real RULES.md generates and passes --check", () => {
  const rulesPath = path.join(__dirname, "RULES.md");
  const raw = fs.readFileSync(rulesPath, "utf8");
  const { cursorContent, claudeContent } = build(raw);
  validateOutput("cursor", cursorContent);
  validateOutput("claude", claudeContent);
  assert.ok(cursorContent.split("\n").length > 150, "cursor output should be substantial");
  assert.ok(claudeContent.split("\n").length > 150, "claude output should be substantial");
});

test("INTEGRATION: CLI --check exits 0 on the real file", () => {
  const out = execFileSync("node", [path.join(__dirname, "generate.js"), "--check"], {
    encoding: "utf8",
  });
  assert.match(out, /check: OK/);
});

test("INTEGRATION: CLI fails loudly (non-zero exit) on a broken file", () => {
  console.log("     --- expected failure below: this test intentionally breaks the input ---");
  const tmp = path.join(require("os").tmpdir(), `dean-broken-${Date.now()}.md`);
  fs.writeFileSync(tmp, minimalSource().replace("<!-- /BLOCK -->\n\n<!-- BLOCK:PONYTAIL -->", ""));
  let threw = false;
  try {
    execFileSync("node", ["-e",
      `const {build}=require(${JSON.stringify(path.join(__dirname, "generate.js"))});` +
      `build(require('fs').readFileSync(${JSON.stringify(tmp)},'utf8'));`
    ]);
  } catch (e) {
    threw = true;
  }
  fs.unlinkSync(tmp);
  assert.ok(threw, "expected build() to throw on a broken source file");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
