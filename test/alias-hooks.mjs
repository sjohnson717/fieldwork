// Two things the app's modules assume and node does not provide.
//
// "@/…" is Vite's alias. import.meta.env is Vite's build-time environment, and
// a module that only reads a variable from it still throws on the property
// access, which takes down anything importing it transitively — health-checks
// reaches it through activities and app-params without using a single value.
//
// Both are handled here rather than by giving the modules under test a second
// import convention or a node-shaped fallback they would carry into production.
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const url = new URL(`../src/${specifier.slice(2)}`, import.meta.url).href;
    return next(/\.[a-z]+$/.test(url) ? url : `${url}.js`, context);
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  const loaded = await next(url, context);
  if (!url.includes("/src/") || loaded.source == null) return loaded;
  // node hands module source back as a buffer, not a string.
  const text = typeof loaded.source === "string"
    ? loaded.source
    : new TextDecoder().decode(loaded.source);
  if (!text.includes("import.meta.env")) return loaded;
  return { ...loaded, source: text.replaceAll("import.meta.env", "globalThis.__VITE_ENV__") };
}
