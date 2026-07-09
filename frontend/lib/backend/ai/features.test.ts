import { describe, it, expect } from "vitest";
import { extractJson } from "@/lib/backend/ai/features";

describe("extractJson", () => {
  it("parses a plain JSON object", () => {
    expect(extractJson('{"a": 1, "b": "two"}')).toEqual({ a: 1, b: "two" });
  });

  it("extracts JSON embedded in surrounding prose", () => {
    expect(extractJson('Here is the answer: {"verdict": "buy"} — hope that helps!')).toEqual({ verdict: "buy" });
  });

  it("does not stop at a '}' inside a quoted string value", () => {
    const raw = '{"note": "use a {placeholder} here", "score": 5}';
    expect(extractJson(raw)).toEqual({ note: "use a {placeholder} here", score: 5 });
  });

  it("ignores a stray trailing '}' after the real object closes", () => {
    const raw = '{"a": 1} — as a closing remark: totally unrelated text with a stray }';
    expect(extractJson(raw)).toEqual({ a: 1 });
  });

  it("falls through to the next candidate when the first balanced block fails to parse", () => {
    // First `{...}` is malformed (trailing comma); the second is valid.
    const raw = 'Draft: {"a": 1,} Final: {"a": 2}';
    expect(extractJson(raw)).toEqual({ a: 2 });
  });

  it("handles nested objects", () => {
    const raw = '{"outer": {"inner": [1, 2, {"deep": true}]}}';
    expect(extractJson(raw)).toEqual({ outer: { inner: [1, 2, { deep: true }] } });
  });

  it("returns null when there is no JSON object at all", () => {
    expect(extractJson("no json here")).toBeNull();
  });

  it("returns null for empty/falsy input", () => {
    expect(extractJson("")).toBeNull();
  });

  it("uses the provided pattern when given, instead of the balanced-brace scan", () => {
    const raw = 'value=42 more text';
    expect(extractJson(raw, /value=\d+/)).toBeNull(); // not valid JSON, so parse fails -> null
  });
});
