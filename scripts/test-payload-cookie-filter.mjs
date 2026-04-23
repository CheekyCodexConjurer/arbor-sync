import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const helperPath = path.join(rootDir, "src", "shared", "payload-cookie-filter.js");

function loadHelper() {
  const source = fs.readFileSync(helperPath, "utf8");
  const context = {
    URL,
    globalThis: {}
  };

  vm.runInNewContext(source, context, { filename: helperPath });
  return context.globalThis.ArborPayloadCookieFilter;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const helper = loadHelper();
const inputCookies = [
  {
    name: "__Secure-next-auth.session-token.0",
    value: "wildcard-token",
    domain: ".chatgpt.com",
    path: "/",
    secure: true
  },
  {
    name: "__Secure-next-auth.session-token.0",
    value: "exact-token",
    domain: "chatgpt.com",
    path: "/",
    secure: true
  },
  {
    name: "oai-chat-web-route",
    value: "route",
    domain: "chatgpt.com",
    path: "/chat/frontend",
    secure: false
  },
  {
    name: "canva-cookie",
    value: "ignore-me",
    domain: "www.canva.com",
    path: "/",
    secure: true
  },
  {
    name: "pplx.visitor-id",
    value: "keep-parent-domain",
    domain: ".perplexity.ai",
    path: "/",
    secure: true
  }
];

const chatgptCookies = helper.filterPayloadCookies(inputCookies, "https://chatgpt.com/");
assert(chatgptCookies.length === 1, `Expected exactly 1 chatgpt cookie, received ${chatgptCookies.length}`);
assert(chatgptCookies[0].value === "exact-token", "Expected exact-domain cookie to win over wildcard duplicate.");

const perplexityCookies = helper.filterPayloadCookies(inputCookies, "https://www.perplexity.ai/");
assert(perplexityCookies.length === 1, `Expected parent-domain perplexity cookie to remain, received ${perplexityCookies.length}`);
assert(perplexityCookies[0].name === "pplx.visitor-id", "Expected perplexity wildcard cookie to be preserved for subdomain targets.");

console.log("Payload cookie filter test passed.");
