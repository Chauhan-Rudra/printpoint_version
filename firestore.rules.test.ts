import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import securityRulesPlugin from '@firebase/eslint-plugin-security-rules';

test('firestore.rules passes @firebase/eslint-plugin-security-rules with zero errors and warnings', async () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [securityRulesPlugin.configs['flat/recommended'] as unknown as never],
  });

  const results = await eslint.lintFiles(['firestore.rules']);
  assert.equal(results.length, 1);
  assert.equal(results[0].errorCount, 0, JSON.stringify(results[0].messages));
  assert.equal(results[0].warningCount, 0, JSON.stringify(results[0].messages));
});

test('firestore.rules enforces default deny, ownership, and blocks client writes on server-authoritative collections', () => {
  const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');

  // Default deny catch-all
  assert.match(rulesText, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);

  // Server-authoritative collections deny all client writes
  for (const collection of [
    'wallets/{uid}',
    'transactions/{txId}',
    'kioskStations/{stationId}',
    'kioskSessions/{token}',
    'printDocuments/{docId}',
    'printOrders/{orderId}',
    'paymentOrders/{paymentOrderId}',
  ]) {
    assert.ok(rulesText.includes(collection), `Missing collection rule for ${collection}`);
  }

  // Prevents role escalation & immutable email/uid/joinedDate changes on /users/{uid}
  assert.match(rulesText, /data\.role == 'user'/);
  assert.match(rulesText, /request\.resource\.data\.role == resource\.data\.role/);
  assert.match(rulesText, /request\.resource\.data\.email == resource\.data\.email/);
  assert.match(rulesText, /request\.resource\.data\.uid == resource\.data\.uid/);

  // Storage rules require auth.uid == uid and 100 MB cap
  const storageRules = fs.readFileSync(path.resolve(process.cwd(), 'storage.rules'), 'utf8');
  assert.match(storageRules, /request\.auth != null && request\.auth\.uid == uid/);
  assert.match(storageRules, /104857600/);
});
