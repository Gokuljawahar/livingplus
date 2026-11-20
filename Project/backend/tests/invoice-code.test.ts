import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adHocInvoiceCode, invoiceCode } from '../src/services/invoice-code.js';

describe('invoice codes', () => {
  it('stay unique for residents whose ids start the same way', () => {
    const arjun = invoiceCode('FOOD', 'pg-demo-hp-arjun', '2026-11');
    const karthik = invoiceCode('FOOD', 'pg-demo-hp-karthik', '2026-11');
    assert.notEqual(arjun, karthik, 'the old 8-character prefix made these identical');
    assert.match(arjun, /^FOOD-2026-11-[0-9A-F]{12}$/);
  });

  it('are stable for the same resident and period, so monthly jobs can re-run safely', () => {
    assert.equal(invoiceCode('RENT', 'tenant-1', '2026-12'), invoiceCode('RENT', 'tenant-1', '2026-12'));
    assert.notEqual(invoiceCode('RENT', 'tenant-1', '2026-12'), invoiceCode('RENT', 'tenant-1', '2027-01'));
    assert.notEqual(invoiceCode('RENT', 'tenant-1', '2026-12'), invoiceCode('FOOD', 'tenant-1', '2026-12'));
    assert.match(invoiceCode('DEP', 'tenant-1'), /^DEP-[0-9A-F]{12}$/);
  });

  it('give hand-added charges a fresh code every time', () => {
    const codes = new Set(Array.from({ length: 200 }, () => adHocInvoiceCode()));
    assert.equal(codes.size, 200);
  });
});
