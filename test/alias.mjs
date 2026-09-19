// The app imports by "@/…", which Vite resolves and node does not. Registering
// the hook here means the modules under test are the same files the app loads,
// with no second import convention kept for the tests' benefit.
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
