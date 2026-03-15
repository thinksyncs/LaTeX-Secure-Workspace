"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fc = require("fast-check");

const { getParser, toString } = require("../../resources/unified.js");

const letters = "abcdefghijklmnopqrstuvwxyz";
const words = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_";

const commandNameArb = fc.string({ minLength: 1, maxLength: 8, unit: fc.constantFrom(...letters) });
const textArb = fc.string({ maxLength: 32, unit: fc.constantFrom(...words.split("")) });
const texSnippetArb = fc.oneof(
  textArb,
  fc.tuple(commandNameArb, textArb).map(([name, value]) => `\\${name}{${value}}`),
  fc.tuple(textArb, textArb).map(([title, body]) => `\\section{${title}}\n${body}`),
  fc.array(fc.tuple(commandNameArb, textArb), { maxLength: 6 }).map((pairs) => pairs.map(([name, value]) => `\\${name}{${value}}`).join("\n"))
);

test("unified parser handles generated TeX snippets", () => {
  const parser = getParser({ flags: { autodetectExpl3AndAtLetter: true } });
  fc.assert(
    fc.property(texSnippetArb, (snippet) => {
      const ast = parser.parse(snippet);
      const rendered = toString(ast);
      assert.equal(typeof rendered, "string");
    }),
    { numRuns: 200 }
  );
});
