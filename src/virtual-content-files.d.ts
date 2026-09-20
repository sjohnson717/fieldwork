// The content files, read at build time by the content-files plugin in
// vite.config.js. Declared so the module resolves for tooling as well.
declare module "virtual:content-files" {
  const files: Record<string, string>;
  export default files;
}
