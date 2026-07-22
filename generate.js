#!/usr/bin/env node
// Dean: generates Cursor rules and a Claude skill from RULES.md.
// Usage: node generate.js [--check]
// Env: DEAN_RULES_PATH overrides the source file (used by test.js for CLI integration tests).
"use strict";

const fs = require("fs");
const path = require("path");

const SRC = process.env.DEAN_RULES_PATH || path.join(__dirname, "RULES.md");
const CURSOR_CORE_OUT = path.join(__dirname, "build/.cursor/rules/dean-core.mdc");
const CURSOR_REVIEW_OUT = path.join(__dirname, "build/.cursor/rules/dean-review.mdc");
const CLAUDE_OUT = path.join(__dirname, "build/.claude/skills/dean/SKILL.md");

const BLOCK_NAMES = ["BRAINSTORM", "PONYTAIL", "REVIEW", "REVIEW_STANDALONE_NOTE"];

// parseSource/render*/validateOutput throw on error (not process.exit), so
// they're unit-testable in isolation from test.js. Only main() exits.

function yamlQuote(str) {
  // Wraps a value as a double-quoted YAML scalar and escapes backslashes and
  // double quotes, so a colon or quote inside the value can never be
  // misread as a new key or terminate the string early.
  return '"' + String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

function parseSource(rawInput) {
  // Strip a UTF-8 BOM if present. Notepad and some Windows tooling default to
  // writing one; without stripping it, the frontmatter regex below never
  // matches because the file doesn't start with a literal "---".
  let raw = rawInput.charCodeAt(0) === 0xfeff ? rawInput.slice(1) : rawInput;

  // Normalize CRLF -> LF first. Without this, files saved on Windows (or
  // checked out with core.autocrlf) fail every regex below, because "\n---\n"
  // never appears verbatim in a CRLF file (it's "\r\n---\r\n" instead).
  raw = raw.replace(/\r\n/g, "\n");

  // Bound the frontmatter search to the text before the first block marker.
  // This guarantees a "---" divider anywhere inside a block's body content
  // can never be mistaken for the frontmatter's closing delimiter.
  const firstBlockIdx = raw.indexOf("<!-- BLOCK:");
  if (firstBlockIdx === -1) throw new Error("no BLOCK markers found in RULES.md");
  const preamble = raw.slice(0, firstBlockIdx);

  const fmMatch = preamble.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) throw new Error("RULES.md is missing YAML frontmatter before the first BLOCK marker");
  const fm = {};
  for (const line of fmMatch[1].split("\n")) {
    if (!line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx === -1) throw new Error(`frontmatter line is not key: value -> "${line}"`);
    fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  if (!fm.title) throw new Error("frontmatter missing 'title'");
  if (!fm.description) throw new Error("frontmatter missing 'description'");

  const blocks = {};
  for (const name of BLOCK_NAMES) {
    // Markers must occupy their own line (only whitespace besides the marker
    // itself). This means mentioning the marker syntax inline inside a
    // sentence -- e.g. documenting how Dean's own format works -- is treated
    // as ordinary prose, not a real marker, because it shares a line with
    // other text. A marker written alone on its own line, even as a
    // documentation example, is indistinguishable from a real one; that's a
    // known limitation, not silently mishandled (see README).
    const re = new RegExp(
      `^[ \\t]*<!--\\s*BLOCK:${name}\\s*-->[ \\t]*$\\n([\\s\\S]*?)\\n^[ \\t]*<!--\\s*/BLOCK\\s*-->[ \\t]*$`,
      "gm"
    );
    const matches = [...raw.matchAll(re)];
    if (matches.length === 0) throw new Error(`missing block: ${name}`);
    if (matches.length > 1) throw new Error(`duplicate block: ${name}`);
    const content = matches[0][1].trim();
    if (!content) throw new Error(`block ${name} is empty`);
    blocks[name] = content;
  }
  return { fm, blocks };
}

// Cursor has real activation modes (verified against current docs): Always
// Apply (alwaysApply: true) loads on every single request and should stay
// small; Agent Requested (alwaysApply: false, no globs, description as a
// semantic signal) lets the model pull the rule in only when relevant. Phase
// 3 (REVIEW) is already designed to be invoked standalone/on demand, so it
// maps directly onto Agent Requested instead of paying its token cost on
// every request. BRAINSTORM + PONYTAIL apply to every coding task, so they
// stay Always Apply -- full detail preserved, nothing trimmed; the fix here
// is *which file loads by default*, not shrinking the text.

function renderCursorCore(blocks) {
  const description = yamlQuote(
    "Design-first gate before building features, plus lazy/minimal-diff implementation discipline (architecture and token discipline included). Always applies."
  );
  return `---
description: ${description}
alwaysApply: true
---
# Dean — Core (Cursor, Always Apply)

Note: Cursor cannot hard-block tool calls. The gate below is a strong directive,
not a technical guarantee — treat "do not implement before approval" as binding
prompt pressure the model is expected to follow, not something this file can
enforce mechanically.

${blocks.BRAINSTORM}

${blocks.PONYTAIL}
`;
}

function renderCursorReview(blocks) {
  const description = yamlQuote(
    "Strict code review: security (XSS/SQLi/secrets/authz), resource use (N+1, sprawl, god objects), business-logic risk, and code-review-reception discipline. Use when reviewing a diff, PR, or file — does not require the design or implementation phases to have run first."
  );
  return `---
description: ${description}
alwaysApply: false
---
# Dean — Review (Cursor, Agent Requested)

${blocks.REVIEW}

${blocks.REVIEW_STANDALONE_NOTE}
`;
}

function renderClaudeSkill(blocks) {
  const description = yamlQuote(
    "Use before creating features, building components, or modifying behavior (design-first gate + lazy implementation); also use standalone whenever reviewing code for resource use, security, or business-logic risk."
  );
  return `---
name: dean
description: ${description}
---
# Dean

${blocks.BRAINSTORM}

${blocks.PONYTAIL}

${blocks.REVIEW}

${blocks.REVIEW_STANDALONE_NOTE}
`;
}

function validateOutput(label, content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) throw new Error(`${label} output missing frontmatter`);
  for (const line of fmMatch[1].split("\n")) {
    if (line.trim() && line.indexOf(":") === -1) {
      throw new Error(`${label} output frontmatter line invalid: "${line}"`);
    }
  }
  if (/<!--\s*BLOCK:/.test(content)) throw new Error(`${label} output leaked a BLOCK marker`);
  if (content.trim().length === 0) throw new Error(`${label} output is empty`);
}

function build(rawSource) {
  const { blocks } = parseSource(rawSource);
  return {
    cursorCoreContent: renderCursorCore(blocks),
    cursorReviewContent: renderCursorReview(blocks),
    claudeContent: renderClaudeSkill(blocks),
  };
}

function main() {
  const check = process.argv.includes("--check");
  try {
    const raw = fs.readFileSync(SRC, "utf8");
    const { cursorCoreContent, cursorReviewContent, claudeContent } = build(raw);

    if (check) {
      validateOutput("cursor-core", cursorCoreContent);
      validateOutput("cursor-review", cursorReviewContent);
      validateOutput("claude", claudeContent);
      console.log("check: OK");
      return;
    }

    fs.mkdirSync(path.dirname(CURSOR_CORE_OUT), { recursive: true });
    fs.mkdirSync(path.dirname(CLAUDE_OUT), { recursive: true });
    fs.writeFileSync(CURSOR_CORE_OUT, cursorCoreContent);
    fs.writeFileSync(CURSOR_REVIEW_OUT, cursorReviewContent);
    fs.writeFileSync(CLAUDE_OUT, claudeContent);
    console.log("wrote " + CURSOR_CORE_OUT);
    console.log("wrote " + CURSOR_REVIEW_OUT);
    console.log("wrote " + CLAUDE_OUT);
  } catch (err) {
    console.error("Dean: " + err.message);
    process.exit(1);
  }
}

module.exports = {
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
};

if (require.main === module) main();
