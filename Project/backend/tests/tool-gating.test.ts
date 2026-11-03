import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toolCatalogue, toolDefinitionsFor } from '../src/services/ai-tools.js';

function toolNamesFor(role: string): string[] {
  return toolDefinitionsFor(role).map((tool) => tool.name).sort();
}

function rolesOf(toolName: string): string[] {
  return [...(toolCatalogue[toolName]?.roles || [])].sort();
}

describe('agent tool gating by role', () => {
  it('gives guests only discovery and their own booking tools', () => {
    assert.deepEqual(toolNamesFor('GUEST'), [
      'check_bed_availability',
      'create_booking_request',
      'get_booking_status',
      'get_property_details',
      'search_properties'
    ]);
  });

  it('gives residents their own stay tools plus guest discovery', () => {
    const names = toolNamesFor('PG_TENANT');
    for (const tool of [
      'search_properties', 'get_property_details', 'check_bed_availability',
      'create_booking_request', 'get_booking_status',
      'get_my_stay', 'get_my_maintenance_requests', 'create_maintenance_ticket',
      'set_meal_preference'
    ]) {
      assert.ok(names.includes(tool), `PG_TENANT should have ${tool}`);
    }
    assert.ok(!names.includes('get_pending_rent'), 'residents must not see dues detail');
    assert.ok(!names.includes('log_expense'), 'residents must not log expenses');
    assert.ok(!names.includes('get_occupancy_report'), 'residents must not see occupancy reports');
  });

  it('gives wardens operations tools but no dues detail', () => {
    const names = toolNamesFor('PG_WARDEN');
    for (const tool of [
      'get_occupancy_report', 'update_maintenance_status', 'send_rent_reminders',
      'log_expense', 'get_expense_summary', 'propose_electricity_split',
      'approve_electricity_bill', 'get_booking_status'
    ]) {
      assert.ok(names.includes(tool), `PG_WARDEN should have ${tool}`);
    }
    assert.ok(!names.includes('get_pending_rent'), 'wardens must not see outstanding-dues detail');
    assert.ok(!names.includes('get_my_stay'), 'wardens must not use resident tools');
    assert.ok(!names.includes('create_booking_request'), 'wardens must not book as guests');
  });

  it('gives owners everything wardens have plus dues detail', () => {
    const warden = new Set(toolNamesFor('PG_WARDEN'));
    const owner = toolNamesFor('PG_OWNER');
    for (const tool of warden) {
      assert.ok(owner.includes(tool), `PG_OWNER should have ${tool}`);
    }
    assert.ok(owner.includes('get_pending_rent'), 'owners must see outstanding-dues detail');
  });

  it('gives superadmins the owner tool set', () => {
    assert.deepEqual(toolNamesFor('SUPER_ADMIN'), toolNamesFor('PG_OWNER'));
  });

  it('keeps maintenance write access staff-side only', () => {
    assert.deepEqual(rolesOf('update_maintenance_status'), ['PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN']);
    assert.deepEqual(rolesOf('create_maintenance_ticket'), ['PG_TENANT']);
  });

  it('keeps dues detail owner-side only', () => {
    assert.deepEqual(rolesOf('get_pending_rent'), ['PG_OWNER', 'SUPER_ADMIN']);
  });
});
