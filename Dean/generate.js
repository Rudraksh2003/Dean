#!/usr/bin/env node
// Generates the Cursor rules file and Claude skill from RULES.md.
// Usage: node generate.js [--check]
"use strict";

const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "RULES.md");
const CURSOR_OUT = path.join(__dirname, "build/.cursor/rules/dev-workflow.mdc");
const CLAUDE_OUT = path.join(__dirname, "build/.claude/skills/dev-workflow/SKILL.md");

const BLOCK_NAMES = ["BRAINSTORM", "PONYTAIL", "REVIEW", "REVIEW_STANDALONE_NOTE"];

function fail(msg) {
  console.error("generate.js: " + msg);
  process.exit(1);
}

function parseSource(raw) {
  // Frontmatter: first --- ... --- block.
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) fail("RULES.md is missing YAML frontmatter");
  const fm = {};
  for (const line of fmMatch[1].split("\n")) {
    if (!line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx === -1) fail(`frontmatter line is not key: value -> "${line}"`);
    fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  if (!fm.title) fail("frontmatter missing 'title'");
  if (!fm.description) fail("frontmatter missing 'description'");

  const blocks = {};
  for (const name of BLOCK_NAMES) {
    const re = new RegExp(
      `<!--\\s*BLOCK:${name}\\s*-->([\\s\\S]*?)<!--\\s*/BLOCK\\s*-->`,
      "g"
    );
    const matches = [...raw.matchAll(re)];
    if (matches.length === 0) fail(`missing block: ${name}`);
    if (matches.length > 1) fail(`duplicate block: ${name}`);
    const content = matches[0][1].trim();
    if (!content) fail(`block ${name} is empty`);
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
# Dev Workflow (Cursor)

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
name: dev-workflow
description: Use before creating features, building components, or modifying behavior (design-first gate + lazy implementation); also use standalone whenever reviewing code for resource use, security, or business-logic risk.
---
# Dev Workflow

${blocks.BRAINSTORM}

${blocks.PONYTAIL}

${blocks.REVIEW}

${blocks.REVIEW_STANDALONE_NOTE}
`;
}

function main() {
  const check = process.argv.includes("--check");
  const raw = fs.readFileSync(SRC, "utf8");
  const { fm, blocks } = parseSource(raw);

  const cursorContent = renderCursor(fm, blocks);
  const claudeContent = renderClaudeSkill(fm, blocks);

  if (check) {
    for (const [label, content] of [["cursor", cursorContent], ["claude", claudeContent]]) {
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
      if (!fmMatch) fail(`${label} output missing frontmatter`);
      for (const line of fmMatch[1].split("\n")) {
        if (line.trim() && line.indexOf(":") === -1) {
          fail(`${label} output frontmatter line invalid: "${line}"`);
        }
      }
      if (/<!--\s*BLOCK:/.test(content)) fail(`${label} output leaked a BLOCK marker`);
      if (content.trim().length === 0) fail(`${label} output is empty`);
    }
    console.log("check: OK");
    return;
  }

  fs.mkdirSync(path.dirname(CURSOR_OUT), { recursive: true });
  fs.mkdirSync(path.dirname(CLAUDE_OUT), { recursive: true });
  fs.writeFileSync(CURSOR_OUT, cursorContent);
  fs.writeFileSync(CLAUDE_OUT, claudeContent);
  console.log("wrote " + CURSOR_OUT);
  console.log("wrote " + CLAUDE_OUT);
}

main();
