// Test runner only. Production uses Cloudflare Workers' real env bindings.
import { register } from "node:module";

register(new URL("./cloudflare-test-loader.mjs", import.meta.url), import.meta.url);
