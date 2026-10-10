import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

/**
 * Furniture could only ever face one way. A rectangular table, a ramp or
 * anything set along a wall is useless at a fixed orientation, and a hallway
 * is mostly things turned to run lengthwise.
 */

const page = () => readFile(new URL("../app/tabletron/page.tsx", import.meta.url), "utf8");

test("placed furniture carries a rotation", async () => {
  const source = await page();
  assert.match(source, /rotation\?: number;/, "placed items cannot be rotated");
  // Optional, so layouts saved before this keep loading and read as unrotated.
  assert.match(source, /const normalizeRotation =/, "rotation is not normalised");
  assert.match(source, /\(\(degrees % 360\) \+ 360\) % 360/, "rotation does not wrap cleanly");
});

test("rotation composes with the centring, never replaces it", async () => {
  // Both the canvas item and the printed map are centred on their point with a
  // transform. Overwriting it would shift every object by half its size.
  const source = await page();
  const transforms = [...source.matchAll(/translate\(-50%, -50%\) rotate\(\$\{[^}]+\}deg\)/g)];
  assert.ok(
    transforms.length >= 2,
    `expected the canvas and the printed map to compose rotation, found ${transforms.length}`,
  );
});

test("names stay readable on a turned object", async () => {
  const source = await page();
  assert.match(
    source,
    /rotate\(\$\{-normalizeRotation\(o\.rotation\)\}deg\)/,
    "a rotated object's label turns with it and becomes hard to read",
  );
});

test("the printed map shows the same orientation as the screen", async () => {
  const source = await page();
  const map = source.slice(source.indexOf("ops-map-object"));
  assert.match(
    map.slice(0, 600),
    /rotate\(\$\{normalizeRotation\(object\.rotation\)\}deg\)/,
    "the setup sheet would print objects facing the wrong way",
  );
});

test("rotation can be set and nudged", async () => {
  const source = await page();
  assert.match(source, /function setObjectRotation\(/, "rotation cannot be set directly");
  assert.match(source, /function nudgeObjectRotation\(/, "rotation cannot be stepped");
  assert.match(source, /nudgeObjectRotation\(selectedObject\.id, -90\)/, "no anticlockwise control");
  assert.match(source, /nudgeObjectRotation\(selectedObject\.id, 90\)/, "no clockwise control");
  assert.match(source, /setObjectRotation\(selectedObject\.id, 0\)/, "no way back to square");
});
