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
