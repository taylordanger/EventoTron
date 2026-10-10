import assert from "node:assert/strict";
import test from "node:test";
import { buildMealShopping } from "../app/food-shopping.ts";

test("shopping chooses the lowest total purchase cost, rather than cheapest sticker price", () => {
  const recipes = [{ id: "soup", baseServings: 10, ingredients: [{ name: "Cream", qty: 1, unit: "gal", offers: [
    { store: "Small packs", packageQty: 1, packageUnit: "qt", price: 4 },
    { store: "Bulk", packageQty: 1, packageUnit: "gal", price: 10 },
  ] }] }];
  const [row] = buildMealShopping(recipes, [{ recipeId: "soup", servings: 10 }]);
  assert.equal(row.best.store, "Bulk");
  assert.equal(row.best.packages, 1);
  assert.equal(row.best.cost, 10);
});

test("ingredients used by multiple recipes combine before rounding packages", () => {
  const recipes = [
    { id: "a", baseServings: 1, ingredients: [{ name: "Rice", qty: 8, unit: "oz", offers: [{ store: "Bulk", packageQty: 1, packageUnit: "lb", price: 3 }] }] },
    { id: "b", baseServings: 1, ingredients: [{ name: " rice ", qty: .5, unit: "lb", offers: [{ store: "Local", packageQty: 1, price: 5 }] }] },
  ];
  const rows = buildMealShopping(recipes, [{ recipeId: "a", servings: 1 }, { recipeId: "b", servings: 1 }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].required, 16);
  assert.equal(rows[0].best.packages, 1);
  assert.equal(rows[0].choices.find((offer) => offer.store === "Local").packageUnit, "lb");
  assert.equal(rows[0].choices.find((offer) => offer.store === "Local").packages, 1);
});

test("custom conversions and unpriced ingredients are preserved", () => {
  const recipes = [{ id: "a", baseServings: 1, ingredients: [
    { name: "Onion", qty: 4, unit: "each", conversionQty: 8, conversionUnit: "oz", offers: [{ store: "Local", packageQty: 2, packageUnit: "lb", price: 4 }] },
    { name: "Salt", qty: 1, unit: "tsp", offers: [{ store: "Local", packageQty: 1, packageUnit: "lb", price: 2 }] },
    { name: "Skipped", qty: 0, unit: "each", offers: [] },
  ] }];
  const rows = buildMealShopping(recipes, [{ recipeId: "a", servings: 1 }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].best.packages, 1);
  assert.equal(rows[1].best, undefined);
  assert.equal(rows[1].required, 1);
});
