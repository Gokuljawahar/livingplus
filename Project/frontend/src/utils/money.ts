/** Indian rupee formatting used everywhere: ₹8,200 and ₹1,25,000 (DESIGN.md §7). */
export function rupees(amount: number | null | undefined): string {
  return `₹${Math.round(Number(amount) || 0).toLocaleString('en-IN')}`;
}

/** "5 Dec" within the current year, "5 Dec 2027" otherwise. */
export function shortDate(value: string | Date): string {
  const date = new Date(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

const ENTRY_NAMES: Record<string, string> = { RENT: 'rent', ELECTRICITY: 'electricity', FOOD: 'food', DEPOSIT: 'deposit', MAINTENANCE: 'maintenance' };

/** "2026-10" + "RENT" -> "October 2026 rent". */
export function billName(period: string, entryType: string): string {
  const [year, month] = period.split('-').map(Number);
  const when = year && month ? new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : period;
  return `${when} ${ENTRY_NAMES[entryType] ?? entryType.toLowerCase().replace(/_/g, ' ')}`;
}
