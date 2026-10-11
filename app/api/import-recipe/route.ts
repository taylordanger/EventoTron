import { withRole } from "../_lib/auth";
import { isPublicImportUrl } from "../_lib/import-url";
type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;
function findRecipe(value: JsonValue): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object") {
        const found = findRecipe(item as JsonValue);
        if (found)
          return found
      }
    }
    return null
  }
  if (!value || typeof value !== "object")
    return null;
  const object = value as Record<string, unknown>;
  const type = object["@type"];
  if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe")))
    return object;
  for (const child of Object.values(object)) {
    if (child && typeof child === "object") {
      const found = findRecipe(child as JsonValue);
      if (found)
        return found
    }
  }
  return null;
}
function text(value: unknown) {
  return typeof value === "string" ? value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim() : ""
}
export const POST = withRole("staff", async (request: Request) => {
  try {
    const body = await request.json() as {
      url?: string
    };
    let target = new URL(String(body.url ?? ""));
    if (!isPublicImportUrl(target))
      return Response.json({ error: "Please enter a public recipe link." }, { status: 400 });
    let response: Response | null = null;
    for (let redirects = 0; redirects < 4; redirects++) {
      response = await fetch(target.toString(), { redirect: "manual", headers: { "User-Agent": "Foodotron Recipe Importer/1.0", "Accept": "text/html,application/xhtml+xml" } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location)
          break;
        target = new URL(location, target);
        if (!isPublicImportUrl(target))
          return Response.json({ error: "The recipe link redirected to an unsupported address." }, { status: 400 });
        continue
      }
      break;
    }
    if (!response?.ok)
      return Response.json({ error: "That website would not provide the recipe. Paste the ingredient text instead." }, { status: 422 });
    const html = (await response.text()).slice(0, 2_500_000);
    const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    let recipe: Record<string, unknown> | null = null;
    for (const match of scripts) {
      try {
        recipe = findRecipe(JSON.parse(match[1]) as JsonValue);
        if (recipe)
          break
      }
      catch {
      }
    }
    if (!recipe)
      return Response.json({ error: "No structured recipe was found. Paste the ingredient list instead." }, { status: 422 });
    const rawYield = Array.isArray(recipe.recipeYield) ? recipe.recipeYield[0] : recipe.recipeYield;
    const servings = Number(String(rawYield ?? "").match(/\d+(?:\.\d+)?/)?.[0] ?? 1);
    const ingredients = Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient.map(text).filter(Boolean) : [];
    if (!ingredients.length)
      return Response.json({ error: "The page did not include an ingredient list." }, { status: 422 });
    return Response.json({ name: text(recipe.name) || "Imported Recipe", servings: Math.max(1, servings), ingredients, source: target.toString() });
  }
  catch {
    return Response.json({ error: "Foodotron could not read that recipe link." }, { status: 400 })
  }
});
