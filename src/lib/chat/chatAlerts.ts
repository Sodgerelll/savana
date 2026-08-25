// Tells someone who is not looking at the chat screen that a customer is.
//
// The sidebar already counts escalations and new requests, which is enough when
// an admin is in the panel and useless when they are in another tab — and a
// customer who has just been told a person will answer is waiting on exactly
// that person noticing. This adds the two things a browser can do about it: a
// count in the tab title, and a desktop notification when the count goes up.

/** What a rise in either count is called, so the notification can say which. */
export interface ChatAlertCounts {
  awaiting: number;
  newLeads: number;
}

export type AlertPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function alertPermission(): AlertPermission {
  if (typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission as AlertPermission;
}

/**
 * Asks once. Browsers refuse a request that is not tied to a click, so this is
 * only ever called from a button — never on load.
 */
export async function requestAlertPermission(): Promise<AlertPermission> {
  if (typeof Notification === 'undefined') {
    return 'unsupported';
  }
  if (Notification.permission !== 'default') {
    return Notification.permission as AlertPermission;
  }
  return (await Notification.requestPermission()) as AlertPermission;
}

/**
 * What to announce, given what the counts were and what they are now.
 *
 * Only a rise is worth announcing: a count that stays at three is three people
 * already known about, and re-announcing them on every snapshot would train
 * whoever is watching to ignore the whole thing. Returns null when there is
 * nothing new — including on the first reading, where every count is "new" and
 * none of it is news.
 */
export function alertFor(
  previous: ChatAlertCounts | null,
  current: ChatAlertCounts,
  copy: { awaiting: (n: number) => string; leads: (n: number) => string },
): string | null {
  if (!previous) {
    return null;
  }

  const parts: string[] = [];
  if (current.awaiting > previous.awaiting) {
    parts.push(copy.awaiting(current.awaiting - previous.awaiting));
  }
  if (current.newLeads > previous.newLeads) {
    parts.push(copy.leads(current.newLeads - previous.newLeads));
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

/** `(3) SAVANA` — the count first, because a tab strip shows very little else. */
export function titleWithCount(baseTitle: string, count: number): string {
  const clean = baseTitle.replace(/^\(\d+\)\s*/, '');
  return count > 0 ? `(${count}) ${clean}` : clean;
}

/** Shows the notification. Silent no-op without permission, which is the point. */
export function showChatAlert(title: string, body: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return;
  }

  try {
    // Same tag every time, so a second alert replaces the first rather than
    // stacking a column of them down the corner of the screen.
    new Notification(title, { body, tag: 'savana-chat', icon: '/vite.svg' });
  } catch {
    // Some browsers refuse construction outside a service worker. Nothing to
    // do about it here, and it must not break the page.
  }
}
