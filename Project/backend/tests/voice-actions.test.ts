import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import type { Actor, ToolExecutor } from '../src/services/ai-tools.js';
import {
  createVoiceActions,
  describeAction,
  STAGE_TTL_MS,
  voiceActionDeclarations,
  type ActionEvent,
  type HandoffEvent
} from '../src/services/voice-actions.js';
import { suggestOwnerAllotment } from '../src/services/owner-briefing.js';

const ownerActor: Actor = { userId: 'owner-1', role: 'PG_OWNER', phones: [], propertyIds: ['pg-1'] };
const wardenActor: Actor = { userId: 'warden-1', role: 'PG_WARDEN', phones: [], propertyIds: ['pg-1'] };

function mockTools(executed: { name: string; args: Record<string, unknown> }[]): Record<string, ToolExecutor> {
  return {
    list_staff: {
      description: 'List staff',
      schema: z.object({ property_id: z.string() }),
      requiresConfirmation: false,
      roles: ['PG_OWNER', 'PG_WARDEN'],
      execute: async (_actor, args) => {
        executed.push({ name: 'list_staff', args });
        return [{ name: 'Ravi', role: 'HOUSEKEEPING', open_tickets: 1 }];
      }
    },
    assign_maintenance_ticket: {
      description: 'Assign ticket',
      schema: z.object({ ticket_id: z.string(), staff_name: z.string() }),
      requiresConfirmation: true,
      roles: ['PG_OWNER', 'PG_WARDEN'],
      execute: async (_actor, args) => {
        executed.push({ name: 'assign_maintenance_ticket', args });
        return { ticket_id: args.ticket_id, assigned_to: args.staff_name };
      }
    },
    send_rent_reminders: {
      description: 'Send rent reminders',
      schema: z.object({ property_id: z.string().optional(), period: z.string().optional() }),
      requiresConfirmation: true,
      roles: ['PG_OWNER', 'PG_WARDEN'],
      execute: async (_actor, args) => {
        executed.push({ name: 'send_rent_reminders', args });
        return { sent: 3, skipped: 0, total: 3 };
      }
    },
    log_expense: {
      description: 'Log expense',
      schema: z.object({ property_id: z.string(), category: z.string().optional(), amount: z.number(), note: z.string().optional() }),
      requiresConfirmation: true,
      roles: ['PG_OWNER', 'PG_WARDEN'],
      execute: async (_actor, args) => {
        if (args.amount <= 0) throw new Error('INVALID_AMOUNT');
        executed.push({ name: 'log_expense', args });
        return { expense_id: 'exp-1', amount: args.amount };
      }
    }
  };
}

describe('voice-actions (read-back, confirm gating, and human handoff)', () => {
  it('scopes declared live tools by role', () => {
    const ownerTools = voiceActionDeclarations('PG_OWNER').map((d) => d.name);
    const wardenTools = voiceActionDeclarations('PG_WARDEN').map((d) => d.name);
    const residentTools = voiceActionDeclarations('PG_TENANT');
    const guestTools = voiceActionDeclarations('GUEST');

    for (const expected of [
      'list_staff', 'get_occupancy_report', 'get_pending_rent', 'get_expense_summary',
      'list_room_change_requests', 'assign_maintenance_ticket', 'update_maintenance_status',
      'send_property_notice', 'send_rent_reminders', 'log_expense',
      'confirm_action', 'cancel_action', 'hand_off_to_workspace'
    ]) {
      assert.ok(ownerTools.includes(expected), `PG_OWNER should have ${expected}`);
    }

    assert.ok(wardenTools.includes('assign_maintenance_ticket'));
    assert.ok(wardenTools.includes('hand_off_to_workspace'));
    assert.ok(!wardenTools.includes('get_pending_rent'), 'wardens must not inspect dues detail');

    assert.deepEqual(residentTools, []);
    assert.deepEqual(guestTools, []);
  });

  it('formats clear read-back descriptions for all voice write actions', () => {
    assert.equal(describeAction('assign_maintenance_ticket', { staff_name: 'Ravi' }), 'Assign the maintenance ticket to Ravi');
    assert.equal(describeAction('update_maintenance_status', { status: 'IN_PROGRESS' }), 'Mark the maintenance ticket as in progress');
    assert.match(describeAction('send_property_notice', { property_id: 'Palm Grove', title: 'Water cut', message: 'Sunday 10-12' }), /Water cut.*Palm Grove/);
    assert.match(describeAction('send_rent_reminders', { property_id: 'Palm Grove', period: '2026-11' }), /rent-due reminders.*Palm Grove.*2026-11/);
    assert.match(describeAction('log_expense', { property_id: 'Palm Grove', category: 'MAINTENANCE', amount: 1500, note: 'AC gas' }), /1,500.*maintenance.*Palm Grove.*AC gas/);
  });

  it('executes reads immediately, stages writes with read-back, and requires a new user utterance to confirm', async () => {
    const events: ActionEvent[] = [];
    const executed: { name: string; args: Record<string, unknown> }[] = [];
    let runAsCount = 0;

    const controller = createVoiceActions({
      actor: wardenActor,
      tools: mockTools(executed),
      runAs: async (fn) => { runAsCount += 1; return fn(); },
      notify: (event) => events.push(event)
    });

    const staff = await controller.callTool('list_staff', { property_id: 'pg-1' }, 1);
    assert.equal(Array.isArray(staff.result), true);
    assert.equal(executed.length, 1);
    assert.equal(runAsCount, 1);

    // Staging never writes immediately and refuses same-turn confirm_action.
    const staged = await controller.callTool('assign_maintenance_ticket', { ticket_id: 't-102', staff_name: 'Ravi' }, 1);
    assert.equal(staged.status, 'PREPARED_NOT_DONE');
    assert.equal(staged.read_back, 'Assign the maintenance ticket to Ravi');
    assert.equal(controller.hasStaged(), true);
    assert.equal(executed.length, 1);
    assert.deepEqual(events, [{ phase: 'proposed', summary: 'Assign the maintenance ticket to Ravi' }]);

    const premature = await controller.callTool('confirm_action', {}, 1);
    assert.match(String(premature.error), /not answered yet/);
    assert.equal(executed.length, 1);
    assert.equal(controller.hasStaged(), true);

    // After owner replies ("Aama") in turn 2, confirm_action executes via runAs and notifies done.
    const confirmed = await controller.callTool('confirm_action', {}, 2);
    assert.equal(confirmed.done, true);
    assert.equal(controller.hasStaged(), false);
    assert.equal(executed.length, 2);
    assert.equal(runAsCount, 2);
    assert.equal(events.at(-1)?.phase, 'done');
  });

  it('handles cancel_action, TTL expiry, failed executions, and human handoff safely', async () => {
    const events: ActionEvent[] = [];
    const handoffs: HandoffEvent[] = [];
    const executed: { name: string; args: Record<string, unknown> }[] = [];
    let clock = 1_000;

    const controller = createVoiceActions({
      actor: ownerActor,
      tools: mockTools(executed),
      runAs: async (fn) => fn(),
      notify: (event) => events.push(event),
      onHandoff: (event) => handoffs.push(event),
      now: () => clock
    });

    // Cancel path
    await controller.callTool('send_rent_reminders', { property_id: 'Palm Grove' }, 1);
    const cancelled = await controller.callTool('cancel_action', {}, 2);
    assert.equal(cancelled.cancelled, true);
    assert.equal(controller.hasStaged(), false);
    assert.equal(events.at(-1)?.phase, 'cancelled');

    // Expiry path
    await controller.callTool('send_rent_reminders', { property_id: 'Palm Grove' }, 2);
    clock += STAGE_TTL_MS + 1;
    const expired = await controller.callTool('confirm_action', {}, 3);
    assert.match(String(expired.error), /timed out/);
    assert.equal(controller.hasStaged(), false);
    assert.equal(events.at(-1)?.phase, 'cancelled');

    // Failed execution emits failed phase
    await controller.callTool('log_expense', { property_id: 'Palm Grove', amount: -5 }, 4);
    const failed = await controller.callTool('confirm_action', {}, 5);
    assert.equal(failed.done, false);
    assert.equal(events.at(-1)?.phase, 'failed');

    // Handoff validation + callback
    const badHandoff = await controller.callTool('hand_off_to_workspace', { target: 'unknown', reason: 'test' }, 5);
    assert.match(String(badHandoff.error), /Unknown workspace target/);

    const okHandoff = await controller.callTool('hand_off_to_workspace', {
      target: 'rent',
      reason: 'Mark Room 204 rent payment as received in the ledger'
    }, 5);
    assert.equal(okHandoff.handed_off, true);
    assert.deepEqual(handoffs, [{
      target: 'rent',
      reason: 'Mark Room 204 rent payment as received in the ledger'
    }]);
  });
});

describe('suggestOwnerAllotment (owner-controlled bed allocation)', () => {
  it('recommends the highest habit-fit room with an available bed', () => {
    const pick = suggestOwnerAllotment(
      { sleep: 2, tidy: 0, noise: 0 },
      [
        { roomNumber: '101', hasAc: false, availableBeds: ['Bed 2'], roommates: [{ sleep: 0, tidy: 2, noise: 2 }] },
        { roomNumber: '102', hasAc: true, availableBeds: ['Bed 1'], roommates: [{ sleep: 2, tidy: 0, noise: 0 }] }
      ]
    );
    assert.deepEqual(pick, {
      roomNumber: '102',
      bedLabel: 'Bed 1',
      hasAc: true,
      score: 100,
      consolidated: true
    });
  });

  it('prefers consolidating partially occupied rooms over empty rooms and ignores full rooms', () => {
    const pick = suggestOwnerAllotment(
      {},
      [
        { roomNumber: '101', hasAc: true, availableBeds: [], roommates: [{ sleep: 1 }] },
        { roomNumber: '103', hasAc: false, availableBeds: ['Bed 1'], roommates: [] },
        { roomNumber: '102', hasAc: true, availableBeds: ['Bed 2'], roommates: [{ sleep: 1 }] }
      ]
    );
    assert.deepEqual(pick, {
      roomNumber: '102',
      bedLabel: 'Bed 2',
      hasAc: true,
      score: null,
      consolidated: true
    });

    assert.equal(suggestOwnerAllotment({ sleep: 1 }, [
      { roomNumber: '101', hasAc: true, availableBeds: [], roommates: [{ sleep: 1 }] }
    ]), null);
  });
});
