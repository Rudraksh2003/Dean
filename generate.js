#!/usr/bin/env node
// Dean: generates the Cursor rules file and Claude skill from RULES.md.
// Usage: node generate.js [--check]
"use strict";

const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "RULES.md");
const CURSOR_OUT = path.join(__dirname, "build/.cursor/rules/dean.mdc");
const CLAUDE_OUT = path.join(__dirname, "build/.claude/skills/dean/SKILL.md");

const BLOCK_NAMES = ["BRAINSTORM", "PONYTAIL", "REVIEW", "REVIEW_STANDALONE_NOTE"];

// parseSource/renderCursor/renderClaudeSkill throw on error (not process.exit),
// so they're unit-testable in isolation from test.js. Only main() exits.

function parseSource(rawInput) {
  // Normalize CRLF -> LF first. Without this, files saved on Windows (or
  // checked out with core.autocrlf) fail every regex below, because "\n---\n"
  // never appears verbatim in a CRLF file (it's "\r\n---\r\n" instead).
  const raw = rawInput.replace(/\r\n/g, "\n");

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
    const re = new RegExp(
      `<!--\\s*BLOCK:${name}\\s*-->([\\s\\S]*?)<!--\\s*/BLOCK\\s*-->`,
      "g"
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

function renderCursor(fm, blocks) {
  return `---
description: ${fm.description}
globs: ["**/*"]
alwaysApply: true
---
# Dean (Cursor)

Note: Cursor cannot hard-block tool calls. The gate below is a strong directive,
not a technical guarantee — treat "do not implement before approval" as binding
even though nothing here can force it.

${blocks.BRAINSTORM}

${blocks.PONYTAIL}

${blocks.REVIEW}

${blocks.REVIEW_STANDALONE_NOTE}
`;
}

function renderClaudeSkill(fm, blocks) {
  return `---
name: dean
description: Use before creating features, building components, or modifying behavior (design-first gate + lazy implementation); also use standalone whenever reviewing code for resource use, security, or business-logic risk.
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
  const { fm, blocks } = parseSource(rawSource);
  const cursorContent = renderCursor(fm, blocks);
  const claudeContent = renderClaudeSkill(fm, blocks);
  return { cursorContent, claudeContent };
}

function main() {
  const check = process.argv.includes("--check");
  try {
    const raw = fs.readFileSync(SRC, "utf8");
    const { cursorContent, claudeContent } = build(raw);

    if (check) {
      validateOutput("cursor", cursorContent);
      validateOutput("claude", claudeContent);
      console.log("check: OK");
      return;
    }

    fs.mkdirSync(path.dirname(CURSOR_OUT), { recursive: true });
    fs.mkdirSync(path.dirname(CLAUDE_OUT), { recursive: true });
    fs.writeFileSync(CURSOR_OUT, cursorContent);
    fs.writeFileSync(CLAUDE_OUT, claudeContent);
    console.log("wrote " + CURSOR_OUT);
    console.log("wrote " + CLAUDE_OUT);
  } catch (err) {
    console.error("Dean: " + err.message);
    process.exit(1);
  }
}

module.exports = { parseSource, renderCursor, renderClaudeSkill, validateOutput, build };

if (require.main === module) main();
