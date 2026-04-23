import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const heartbeatPath = path.join(root, 'src', 'session-heartbeat.js');

function loadHeartbeatModule() {
  const source = fs.readFileSync(heartbeatPath, 'utf8');
  let sendMessageCalls = 0;
  let clearIntervalCalls = 0;

  const context = {
    Date,
    Promise,
    URL,
    setInterval() {
      return 42;
    },
    clearInterval() {
      clearIntervalCalls += 1;
    },
    location: { href: 'https://chatgpt.com/c/test' },
    document: {
      title: 'Test',
      visibilityState: 'visible',
      addEventListener() {}
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(payload, callback) {
          sendMessageCalls += 1;
          if (sendMessageCalls === 2) {
            throw new Error('Extension context invalidated.');
          }

          callback();
        }
      }
    },
    globalThis: {}
  };

  context.globalThis = context;

  vm.runInNewContext(source, context, { filename: heartbeatPath });

  return {
    heartbeat: context.globalThis.ArborSessionHeartbeat,
    getSendMessageCalls: () => sendMessageCalls,
    getClearIntervalCalls: () => clearIntervalCalls
  };
}

test('session heartbeat swallows invalidated-extension sendMessage throws', async () => {
  const { heartbeat, getSendMessageCalls, getClearIntervalCalls } = loadHeartbeatModule();

  assert.equal(getSendMessageCalls(), 1, 'expected startup heartbeat to send once during load');

  const result = await heartbeat.sendHeartbeat('manual');

  assert.equal(result.sent, false, 'expected invalidated heartbeat send to resolve as a failed send');
  assert.match(result.error, /context invalidated/i, 'expected the invalidated context error to be surfaced');
  assert.equal(getSendMessageCalls(), 2, 'expected the manual heartbeat to reach the invalidated send');
  assert.equal(getClearIntervalCalls(), 1, 'expected the heartbeat timer to stop after invalidation');
});
