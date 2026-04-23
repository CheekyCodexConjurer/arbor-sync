import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function lineCount(relativePath) {
  return read(relativePath).split(/\r?\n/).length;
}

const agents = read('AGENTS.md');
const gitignore = read('.gitignore');
const popupHtml = read('src/popup.html');
const serviceWorker = read('src/service-worker.js');

test('AGENTS.md defines the soft anti-godfile policy', () => {
  assert.match(agents, /300 linhas|300 lines/i, 'expected AGENTS.md to define a 300-line target');
  assert.match(agents, /360 linhas|360 lines/i, 'expected AGENTS.md to define a soft upper tolerance');
  assert.match(agents, /godfiles/i, 'expected AGENTS.md to mention godfiles explicitly');
  assert.match(agents, /se tocou em arquivo grande/i, 'expected AGENTS.md to require reduction when touching oversized files');
});

test('AGENTS.md locks infrastructure changes to Supabase free tier', () => {
  assert.match(agents, /Supabase Free/i, 'expected AGENTS.md to explicitly require Supabase Free tier');
  assert.match(agents, /sem custo|zero custo|no paid/i, 'expected AGENTS.md to forbid paid infrastructure');
  assert.match(agents, /Edge Functions|Postgres|Storage/i, 'expected AGENTS.md to define allowed free-tier Supabase surfaces');
});

test('.gitignore excludes local spreadsheet exports and Supabase generated state', () => {
  assert.match(gitignore, /\*\.xlsx/, 'expected .gitignore to ignore local spreadsheet exports');
  assert.match(gitignore, /supabase\/\.branches\//, 'expected .gitignore to ignore Supabase branch state');
  assert.match(gitignore, /supabase\/\.cache\//, 'expected .gitignore to ignore Supabase cache state');
  assert.match(gitignore, /supabase\/\.output\//, 'expected .gitignore to ignore Supabase output state');
});

test('popup shell extracts CSS and supporting scripts out of popup.html', () => {
  const requiredCss = [
    'popup-shell.css',
    'popup-views.css',
    'popup-components.css',
    'popup-settings.css'
  ];
  const requiredScripts = [
    'popup-dom.js',
    'popup-view-state.js',
    'popup-renderers.js',
    'popup-catalog.js',
    'popup-actions.js'
  ];

  for (const cssFile of requiredCss) {
    assert.match(popupHtml, new RegExp(`href="${cssFile}"`), `expected popup.html to load ${cssFile}`);
  }

  for (const scriptFile of requiredScripts) {
    assert.match(popupHtml, new RegExp(`src="${scriptFile}"`), `expected popup.html to load ${scriptFile}`);
  }
});

test('godfile targets are reduced to the soft threshold', () => {
  const thresholds = {
    'src/popup.html': 320,
    'src/popup.js': 320,
    'src/service-worker.js': 320,
    'src/cookie-proxy-manager.js': 320
  };

  for (const [relativePath, maxLines] of Object.entries(thresholds)) {
    assert.ok(
      lineCount(relativePath) <= maxLines,
      `expected ${relativePath} to stay at or below ${maxLines} lines`
    );
  }
});

test('service worker delegates behavior to split modules', () => {
  const requiredImports = [
    'service-worker-guards.js',
    'service-worker-status.js',
    'service-worker-session.js',
    'service-worker-router.js'
  ];

  for (const importName of requiredImports) {
    assert.match(serviceWorker, new RegExp(`"${importName}"`), `expected service-worker.js to import ${importName}`);
  }
});
