import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadXlsx } from './xlsx';

afterEach(() => vi.unstubAllGlobals());

describe('downloadXlsx', () => {
  it('builds a zip workbook with the rows and triggers a download', async () => {
    let blob: Blob | null = null;
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: (value: Blob) => { blob = value; return 'blob:test'; },
      revokeObjectURL: () => undefined
    }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadXlsx('rent.xlsx', 'Rent', [['Tenant', 'Amount'], ['Asha & Co', 8000], [null, undefined]]);

    expect(click).toHaveBeenCalledTimes(1);
    expect(blob).not.toBeNull();
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe('PK');
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('xl/worksheets/sheet1.xml');
    expect(text).toContain('Asha &amp; Co');
    expect(text).toContain('8000');
  });
});
