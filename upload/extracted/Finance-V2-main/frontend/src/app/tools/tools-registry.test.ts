import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Integrity checks on the calculator registry in tools-client.tsx.
 *
 * The registry is a flat array of forty-odd entries that decide which card
 * renders, what the search matches, and which tab it lands under. Its failure
 * modes are all SILENT: a duplicated key means one calculator quietly renders
 * in place of another, a mistyped group drops a card off every tab, and a
 * Component name left behind by a rename crashes only when that tab is
 * opened. None of these fail a build and none fail a unit test of the
 * underlying maths.
 *
 * This reads the source rather than importing it, because importing the
 * client component would drag in React, recharts and every icon just to
 * inspect an array of strings. That trade brings one real risk — a
 * reformatting that stops the patterns matching would leave the checks
 * passing vacuously — so the parse asserts its own yield first. If the shape
 * of the file changes, `finds every entry` fails loudly instead.
 */

const SOURCE = readFileSync(
  join(process.cwd(), "src/app/tools/tools-client.tsx"),
  "utf-8"
);

const registryBlock = (): string => {
  const start = SOURCE.indexOf("const CALCULATORS: CalculatorEntry[] = [");
  expect(start).toBeGreaterThan(-1);
  const end = SOURCE.indexOf("\n]", start);
  expect(end).toBeGreaterThan(start);
  return SOURCE.slice(start, end);
};

const collect = (pattern: RegExp): string[] =>
  [...registryBlock().matchAll(pattern)].map((match) => match[1]);

const keys = () => collect(/key:\s*"([^"]+)"/g);
const titles = () => collect(/title:\s*"([^"]+)"/g);
const groups = () => collect(/group:\s*"([^"]+)"/g);
const components = () => collect(/Component:\s*(\w+)/g);

const duplicates = (values: string[]): string[] =>
  [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];

const VALID_GROUPS = ["trading", "equity", "fno", "planning"];

describe("calculator registry", () => {
  it("finds every entry", () => {
    // Guards every other check in this file: if the parse silently stopped
    // matching, the assertions below would pass on an empty array.
    const found = keys().length;
    expect(found).toBeGreaterThanOrEqual(42);
    expect(titles()).toHaveLength(found);
    expect(groups()).toHaveLength(found);
    expect(components()).toHaveLength(found);
  });

  it("keeps every key unique", () => {
    // A duplicate key makes one calculator render in place of another, with
    // no error anywhere.
    expect(duplicates(keys())).toEqual([]);
  });

  it("keeps every title unique", () => {
    expect(duplicates(titles())).toEqual([]);
  });

  it("wires each entry to its own component", () => {
    expect(duplicates(components())).toEqual([]);
  });

  it("assigns every entry to a real tab", () => {
    // A group outside this set is not a build error; the card simply never
    // appears, because no tab claims it.
    expect([...new Set(groups())].filter((g) => !VALID_GROUPS.includes(g))).toEqual([]);
  });

  it("defines every component it references", () => {
    // Catches a rename that updated the function but not the registry.
    const undefinedComponents = components().filter(
      (name) => !SOURCE.includes(`function ${name}(`)
    );
    expect(undefinedComponents).toEqual([]);
  });

  it("gives every entry search keywords", () => {
    // Keywords are how anything past the first screenful gets found. An entry
    // without them is reachable only by scrolling to it.
    const entries = registryBlock().split(/\n  \{/).slice(1);
    const withoutKeywords = entries.filter((entry) => !/keywords:\s*\n?\s*"/.test(entry));
    expect(withoutKeywords).toEqual([]);
  });

  it("leaves no tab empty", () => {
    const present = new Set(groups());
    expect(VALID_GROUPS.filter((group) => !present.has(group))).toEqual([]);
  });
});
