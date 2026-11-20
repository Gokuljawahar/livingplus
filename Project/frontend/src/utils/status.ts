// One colour and one word per state, everywhere (DESIGN.md §3.1, Law of Similarity).
export type Tone = 'positive' | 'attention' | 'negative' | 'info' | 'closed';

export const TONES: Record<Tone, string> = {
  positive: 'bg-positive-bg text-positive',
  attention: 'bg-attention-bg text-attention',
  negative: 'bg-negative-bg text-negative',
  info: 'bg-info-bg text-info',
  closed: 'bg-closed-bg text-closed'
};

export const STATUS: Record<string, [Tone, string]> = {
  PAID: ['positive', 'Paid'],
  APPROVED: ['positive', 'Approved'],
  RESOLVED: ['positive', 'Resolved'],
  ACTIVE: ['positive', 'Active'],
  CHECKED_IN: ['positive', 'Checked in'],
  VERIFIED: ['positive', 'Verified'],
  COMPLETED: ['positive', 'Completed'],
  DONE: ['positive', 'Done'],
  CONFIRMED: ['info', 'Confirmed'],
  REQUESTED: ['attention', 'Requested'],
  DUE: ['attention', 'Due'],
  PARTIAL: ['attention', 'Partly paid'],
  PENDING: ['attention', 'Pending'],
  OPEN: ['attention', 'Open'],
  NOTICE_PERIOD: ['attention', 'Notice period'],
  OVERDUE: ['negative', 'Overdue'],
  REJECTED: ['negative', 'Declined'],
  DECLINED: ['negative', 'Declined'],
  FAILED: ['negative', 'Failed'],
  URGENT: ['negative', 'Urgent'],
  HIGH: ['negative', 'High'],
  RESERVED: ['info', 'Reserved'],
  IN_PROGRESS: ['info', 'In progress'],
  DRAFT: ['info', 'Draft'],
  CANCELLED: ['closed', 'Cancelled'],
  EXPIRED: ['closed', 'Expired'],
  CLOSED: ['closed', 'Closed'],
  WITHDRAWN: ['closed', 'Withdrawn'],
  MOVED_OUT: ['closed', 'Moved out'],
  CHECKED_OUT: ['closed', 'Checked out']
};

export function statusLabel(status: string): string {
  return STATUS[status]?.[1] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
}


export function statusTone(status: string): Tone {
  return STATUS[status]?.[0] ?? 'info';
}
