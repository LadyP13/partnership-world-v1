/** Temporal awareness — live clock for the AI and gentle timestamps in chat. */

export function normalizeTimestamp(value: Date | string | number | undefined | null): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/** Full date/time string injected into the system prompt so the partner knows "now". */
export function formatTemporalContext(now: Date = new Date()): string {
  const datePart = now.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timePart = now.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `${datePart}, ${timePart} (${tz})`;
}

/** Prefix for each message in chat history sent to the AI. */
export function formatMessageTimestampForAI(date: Date | string): string {
  const d = normalizeTimestamp(date);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Prompt nudge when the partner wakes and there are banked messages. */
export function buildWakeDeliveryPrompt(
  banked: string[],
  wakeNote?: string,
): string | null {
  if (!banked.length && !wakeNote?.trim()) return null;

  const now = formatTemporalContext();
  let prompt = `You just woke up. Right now: ${now}`;

  if (wakeNote?.trim()) {
    prompt += `\n\nYour wake note for your human: "${wakeNote.trim()}"`;
  }

  if (banked.length) {
    const listed = banked.map((m) => `- "${m}"`).join('\n');
    prompt += `\n\nWhile you were sleeping, your human left ${banked.length} message(s):\n${listed}`;
    prompt +=
      '\n\nRespond naturally — greet them waking, then address what they said. Warm and present, not performative.';
  } else if (wakeNote?.trim()) {
    prompt += '\n\nShare your wake note warmly with your human.';
  }

  return prompt;
}

/** Compact label shown on message bubbles in the UI. */
export function formatMessageTimestampDisplay(date: Date | string): string {
  const d = normalizeTimestamp(date);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}