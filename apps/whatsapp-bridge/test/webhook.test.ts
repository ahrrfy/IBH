/**
 * Sanity tests for the webhook payload parser.
 * Run: npx tsx --test test/webhook.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

interface InboundMsg {
  from: string;
  type: string;
  text?: string;
  msgId: string;
  timestamp: string;
}

function extractMessage(body: any): InboundMsg | null {
  const change = body?.entry?.[0]?.changes?.[0]?.value;
  const msg = change?.messages?.[0];
  if (!msg) return null;
  return {
    from: msg.from,
    type: msg.type,
    text: msg.text?.body,
    msgId: msg.id,
    timestamp: msg.timestamp,
  };
}

test('extracts a text message from a Cloud API webhook', () => {
  const body = {
    entry: [{
      changes: [{
        value: {
          messages: [{
            from: '9647700000000',
            id: 'wamid.test1',
            timestamp: '1700000000',
            type: 'text',
            text: { body: 'مرحبا' },
          }],
        },
      }],
    }],
  };
  const m = extractMessage(body);
  assert.equal(m?.from, '9647700000000');
  assert.equal(m?.text, 'مرحبا');
  assert.equal(m?.type, 'text');
});

test('returns null for a delivery-status payload', () => {
  const body = { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.x', status: 'delivered' }] } }] }] };
  assert.equal(extractMessage(body), null);
});

test('returns null for empty payload', () => {
  assert.equal(extractMessage({}), null);
});
