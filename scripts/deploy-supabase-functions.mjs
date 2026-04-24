import fs from "node:fs/promises";
import path from "node:path";
import { loadAdminRuntime, requestJson } from "./supabase-admin-helpers.mjs";

const FUNCTION_NAMES = [
  "session-start",
  "session-heartbeat",
  "session-end",
  "payload-fetch",
  "license-status",
  "stripe-checkout",
  "stripe-webhook",
  "stripe-success"
];
const CONTENT_TYPES = new Map([
  [".ts", "application/typescript"],
  [".js", "application/javascript"],
  [".json", "application/json"]
]);

function toPosix(value) {
  return value.split(path.sep).join("/");
}

async function collectFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

async function buildForm(functionName, functionsRoot) {
  const form = new FormData();
  form.append("metadata", JSON.stringify({
    entrypoint_path: `${functionName}/index.ts`,
    name: functionName,
    verify_jwt: false
  }));

  const sharedDir = path.join(functionsRoot, "_shared");
  const functionDir = path.join(functionsRoot, functionName);
  const files = [
    ...(await collectFiles(sharedDir)),
    ...(await collectFiles(functionDir))
  ];

  for (const filePath of files) {
    const relativePath = filePath.startsWith(functionDir)
      ? path.join(functionName, path.relative(functionDir, filePath))
      : path.join("_shared", path.relative(sharedDir, filePath));
    const extension = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES.get(extension) || "application/octet-stream";
    const contents = await fs.readFile(filePath);
    form.append("file", new Blob([contents], { type: contentType }), toPosix(relativePath));
  }

  return form;
}

async function deployFunction(runtime, functionName) {
  const functionsRoot = path.join(runtime.rootDir, "supabase", "functions");
  const form = await buildForm(functionName, functionsRoot);
  const url = `https://api.supabase.com/v1/projects/${runtime.projectRef}/functions/deploy?slug=${encodeURIComponent(functionName)}`;
  const payload = await requestJson(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtime.accessToken}`
    },
    body: form
  });

  return {
    slug: payload.slug,
    version: payload.version,
    status: payload.status
  };
}

async function main() {
  const runtime = await loadAdminRuntime();
  const requestedFunctions = process.argv.slice(2);
  const functionNames = requestedFunctions.length > 0 ? requestedFunctions : FUNCTION_NAMES;
  const results = [];

  for (const functionName of functionNames) {
    results.push(await deployFunction(runtime, functionName));
  }

  console.log(JSON.stringify({ deployed: results }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  if (error.payload) {
    console.error(JSON.stringify(error.payload, null, 2));
  }
  process.exit(1);
});
