export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const url = new URL(`../src/${specifier.slice(2)}`, import.meta.url).href;
    return next(/\.[a-z]+$/.test(url) ? url : `${url}.js`, context);
  }
  return next(specifier, context);
}
