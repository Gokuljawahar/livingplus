import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createLiveProtocol } from '@livingplus/shared';

const { parseLiveClientMessage, parseLiveServerMessage } = createLiveProtocol(z);

describe('live voice WebSocket protocol (Zod)', () => {
  it('validates client audio, text, and pause frames and rejects malformed ones', () => {
    assert.deepEqual(parseLiveClientMessage(JSON.stringify({ type: 'audio', data: 'AQIDBA==' })), { type: 'audio', data: 'AQIDBA==' });
    assert.deepEqual(parseLiveClientMessage(JSON.stringify({ type: 'text', text: '  hello  ' })), { type: 'text', text: 'hello' });
    assert.deepEqual(parseLiveClientMessage(JSON.stringify({ type: 'pause' })), { type: 'pause' });

    assert.equal(parseLiveClientMessage('{not json'), null);
    assert.equal(parseLiveClientMessage(JSON.stringify({ type: 'audio', data: 'not base64!' })), null);
    assert.equal(parseLiveClientMessage(JSON.stringify({ type: 'text', text: '   ' })), null);
    assert.equal(parseLiveClientMessage(JSON.stringify({ type: 'unknown' })), null);
  });

  it('validates server frames including audio defaults and habits payloads', () => {
    assert.deepEqual(parseLiveServerMessage(JSON.stringify({ type: 'ready' })), { type: 'ready' });
    assert.deepEqual(parseLiveServerMessage(JSON.stringify({ type: 'audio', data: 'AAAA' })), { type: 'audio', data: 'AAAA', mimeType: 'audio/pcm;rate=24000' });
    assert.deepEqual(parseLiveServerMessage(JSON.stringify({ type: 'habits', answers: { sleep: 1 }, summary: 'Early', done: false })), {
      type: 'habits', answers: { sleep: 1 }, summary: 'Early', done: false
    });
    assert.equal(parseLiveServerMessage(JSON.stringify({ type: 'habits', answers: { sleep: 9 }, summary: null, done: false })), null);
    assert.equal(parseLiveServerMessage(JSON.stringify({ type: 'audio', data: '' })), null);
  });
});
