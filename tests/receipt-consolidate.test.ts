import { describe, it, expect } from 'vitest';
import { consolidateReceiptLines } from '../electron/services/fees';

describe('consolidateReceiptLines', () => {
  it('merges consecutive months of the same head into one range row', () => {
    const lines = [
      { head_name: 'Tuition Fee', amount: 1000, month_label: '2026-04' },
      { head_name: 'Exam Fee', amount: 300, month_label: '2026-04' },
      { head_name: 'Tuition Fee', amount: 1000, month_label: '2026-05' },
      { head_name: 'Exam Fee', amount: 300, month_label: '2026-05' },
      { head_name: 'Tuition Fee', amount: 1000, month_label: '2026-06' },
      { head_name: 'Exam Fee', amount: 300, month_label: '2026-06' },
    ];
    const out = consolidateReceiptLines(lines);
    expect(out).toHaveLength(2);
    expect(out[0].head_name).toBe('Tuition Fee');
    expect(out[0].amount).toBe(3000);
    expect(out[0].month_display).toBe('Apr 2026 – Jun 2026');
    expect(out[1].head_name).toBe('Exam Fee');
    expect(out[1].amount).toBe(900);
    expect(out[1].month_display).toBe('Apr 2026 – Jun 2026');
  });

  it('splits non-consecutive months into separate rows', () => {
    const lines = [
      { head_name: 'Tuition Fee', amount: 1000, month_label: '2026-04' },
      { head_name: 'Tuition Fee', amount: 1000, month_label: '2026-06' },
    ];
    const out = consolidateReceiptLines(lines);
    expect(out).toHaveLength(2);
    expect(out[0].month_display).toBe('Apr 2026');
    expect(out[0].amount).toBe(1000);
    expect(out[1].month_display).toBe('Jun 2026');
  });

  it('handles a single month and year boundary (Dec -> Jan)', () => {
    const lines = [
      { head_name: 'Tuition Fee', amount: 1000, month_label: '2026-12' },
      { head_name: 'Tuition Fee', amount: 1000, month_label: '2027-01' },
      { head_name: 'Tuition Fee', amount: 1000, month_label: '2027-02' },
    ];
    const out = consolidateReceiptLines(lines);
    expect(out).toHaveLength(1);
    expect(out[0].month_display).toBe('Dec 2026 – Feb 2027');
    expect(out[0].amount).toBe(3000);
  });

  it('handles lines without a month label', () => {
    const lines = [
      { head_name: 'Miscellaneous', amount: 500 },
    ];
    const out = consolidateReceiptLines(lines);
    expect(out).toHaveLength(1);
    expect(out[0].month_display).toBe('—');
  });
});
