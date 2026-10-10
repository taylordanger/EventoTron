export type ShoppingOffer = { store: string; packageQty: number; packageUnit?: string; packageYield?: number; price: number; note?: string };
export type ShoppingIngredient = { name: string; qty: number; unit: string; offers?: ShoppingOffer[]; conversionQty?: number; conversionUnit?: string };
const measures: Record<string, { family: string; factor: number }> = {
  tsp: { family: "volume", factor: 1 }, tbsp: { family: "volume", factor: 3 }, cup: { family: "volume", factor: 48 },
  "fl oz": { family: "volume", factor: 6 }, pt: { family: "volume", factor: 96 }, qt: { family: "volume", factor: 192 }, gal: { family: "volume", factor: 768 },
  mg: { family: "weight", factor: 1 }, g: { family: "weight", factor: 1000 }, oz: { family: "weight", factor: 28349.523125 }, lb: { family: "weight", factor: 453592.37 },
  each: { family: "count", factor: 1 }, dozen: { family: "count", factor: 12 },
};
export function convert(qty: number, from: string, to: string) {
  if (from === to) return qty;
  return measures[from] && measures[to] && measures[from].family === measures[to].family
    ? qty * measures[from].factor / measures[to].factor : null;
}
export function packageInRecipeUnits(item: ShoppingIngredient, offer: ShoppingOffer) {
  const unit = offer.packageUnit ?? item.unit;
  const automatic = convert(offer.packageQty, unit, item.unit);
  if (automatic !== null) return automatic;
  if ((item.conversionQty ?? 0) > 0) {
    const converted = convert(offer.packageQty, unit, item.conversionUnit ?? "oz");
    if (converted !== null) return converted / item.conversionQty!;
  }
  return (offer.packageYield ?? 0) > 0 ? offer.packageYield! : null;
}
export function buildMealShopping<I extends ShoppingIngredient>(
  recipes: Array<{ id: string; baseServings: number; ingredients: I[] }>,
  entries: Array<{ recipeId: string; servings: number }>,
) {
  const combined: Array<I & { offers: NonNullable<I["offers"]> }> = [];
  for (const entry of entries) {
    const recipe = recipes.find((candidate) => candidate.id === entry.recipeId);
    if (!recipe) continue;
    for (const ingredient of recipe.ingredients) {
      const amount = ingredient.qty * entry.servings / Math.max(1, recipe.baseServings);
      if (amount <= 0) continue;
      const existing = combined.find((item) => item.name.trim().toLowerCase() === ingredient.name.trim().toLowerCase() && convert(amount, ingredient.unit, item.unit) !== null);
      if (existing) {
        existing.qty += convert(amount, ingredient.unit, existing.unit)!;
        // Preserve each offer's original unit when recipes use different units.
        existing.offers.push(...(ingredient.offers ?? []).map((offer) => ({ ...offer, packageUnit: offer.packageUnit ?? ingredient.unit })));
      } else {
        combined.push({ ...ingredient, qty: amount, offers: [...(ingredient.offers ?? [])] } as I & { offers: NonNullable<I["offers"]> });
      }
    }
  }
  return combined.map((item) => {
    const choices = item.offers.flatMap((offer) => {
      const equivalent = packageInRecipeUnits(item, offer);
      if (!equivalent || equivalent <= 0) return [];
      const packages = Math.ceil(item.qty / equivalent);
      return [{ ...offer, packageUnit: offer.packageUnit ?? item.unit, packages, cost: packages * offer.price }];
    }).sort((a, b) => a.cost - b.cost);
    return { item, required: item.qty, best: choices[0], choices };
  });
}
