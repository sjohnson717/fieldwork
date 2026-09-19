// The app imports by "@/…" and reads Vite's import.meta.env, neither of which
// node provides. Registering the hook here means the modules under test are the
// same files the app loads, with no second convention kept for the tests.
//
// The modules under test are pure by design and reach no further than this: a
// test that needed a browser standing up would be testing the wrong thing, and
// the one time it happened the answer was to move the rule out of the module
// that builds the backend client — see src/lib/activity-kind.js.
import { register } from "node:module";

globalThis.__VITE_ENV__ = { MODE: "test", DEV: false, PROD: false };
register("./alias-hooks.mjs", import.meta.url);
