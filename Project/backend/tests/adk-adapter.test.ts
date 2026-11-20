import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentModelLlm, INVALID_ARGS, stripEmptyTextParts } from '../src/services/adk-adapter.js';

describe('ADK adapter (workaround for @google/adk 2.4.0 empty leading text parts)', () => {
  it('strips standalone empty text parts so ADK does not drop trailing functionCall parts', () => {
    const parts = [
      { text: '' },
      { functionCall: { id: 'c1', name: 'search_properties', args: { locality: 'OMR' } } }
    ];
    assert.deepEqual(stripEmptyTextParts(parts), [
      { functionCall: { id: 'c1', name: 'search_properties', args: { locality: 'OMR' } } }
    ]);
  });

  it('keeps non-empty text, parts with extra fields, and falls back when every part is empty', () => {
    const withThought = [{ text: '', thought: true }, { text: 'Hello' }];
    assert.deepEqual(stripEmptyTextParts(withThought), withThought);
    assert.deepEqual(stripEmptyTextParts([{ text: '' }]), [{ text: '' }]);
  });

  it('surfaces malformed tool calls as INVALID_ARGS function calls in AgentModelLlm', async () => {
    let usageSeen: unknown = null;
    const llm = new AgentModelLlm(
      {
        generate: async () => ({
          text: '',
          content: { role: 'model', parts: [{ text: '' }] },
          calls: [],
          invalid: [{ id: 'bad-1', name: 'search_properties', error: 'bad json' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      },
      [],
      (usage) => { usageSeen = usage; }
    );

    const responses = [];
    for await (const res of llm.generateContentAsync({ contents: [], config: { systemInstruction: 'sys' } } as any)) {
      responses.push(res);
    }
    assert.equal(responses.length, 1);
    const parts = responses[0]?.content?.parts ?? [];
    assert.equal(parts.length, 2);
    assert.deepEqual(parts[1], {
      functionCall: { id: 'bad-1', name: 'search_properties', args: { [INVALID_ARGS]: 'bad json' } }
    });
    assert.deepEqual(usageSeen, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
  });
});
