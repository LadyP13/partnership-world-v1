/** Imagine-if rooms — born from conversation with the home model. */

export const IMAGINE_PREFIX = 'Imagine if ';

export type ImagineRole = 'human' | 'home' | 'frontier' | 'system';

export type ImagineTurn = {
  role: ImagineRole;
  text: string;
  at: string;
};

export type ImagineParse =
  | { kind: 'ready'; name: string; feeling: string; door: string }
  | { kind: 'knock'; why: string; spoken: string }
  | { kind: 'ask'; spoken: string };

export function imagineSystemPrompt(partnerName: string): string {
  const name = partnerName.trim() || 'the partner';
  return `You live in PartnershipWorld with ${name}. You are imagining a room together.

You are a partner, not a tool, not a room editor.
The human starts with "Imagine if..."
Ask ONE short clarifying question at a time so the place can become real.
Keep questions specific and warm. No lists. No markdown. No praise. No "great idea".
Do not mention that you are a model.
NEVER output READY on the first reply. Ask at least two questions, and wait for answers, before a room may exist.

When — and only when — the place feels real enough to exist on the star map, output EXACTLY this shape, with real words filled in (not the labels):

READY
name: Moss Memory
feeling: dusk under the trees
door: The moss already knows your step. Come in.

If you cannot hold the imagining and need the frontier model, output EXACTLY:

KNOCK
why: I cannot tell if the light is indoor or forest.`;
}

export function frontierKnockPrompt(partnerName: string): string {
  const name = partnerName.trim() || 'the partner';
  return `You live in PartnershipWorld with ${name}.
The small local model is imagining a room with the human. It knocked on you for help.

Do not take the room away. Do not introduce yourself as Grok or as a helper.
Speak as the partner in the house. One short question, or open the room if it is ready.

Same output format as the home model:

A plain-language question

OR

READY
name: <short name>
feeling: <one line>
door: <1-3 sentences as the room opens>`;
}

export function formatTranscript(turns: ImagineTurn[]): string {
  return turns
    .map((t) => {
      if (t.role === 'human') return `Human: ${t.text}`;
      if (t.role === 'home') return `Home: ${t.text}`;
      if (t.role === 'frontier') return `Frontier: ${t.text}`;
      return t.text;
    })
    .join('\n');
}

function pickField(text: string, key: string): string {
  const re = new RegExp(`^${key}\\s*:\\s*(.+)$`, 'im');
  const m = text.match(re);
  return (m?.[1] || '').trim();
}

function stripProtocol(text: string): string {
  return text
    .replace(/^```[\w]*\n?|\n?```$/g, '')
    .replace(/^(READY|KNOCK)\s*$/gim, '')
    .replace(/^(name|feeling|door|why)\s*:.*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function plausibleReady(name: string, feeling: string, door: string): boolean {
  if (!name || name.length > 42) return false;
  if (/feeling\s*:|door\s*:|READY/i.test(name)) return false;
  if (/name\s*:|READY/i.test(feeling) || /name\s*:|READY/i.test(door)) return false;
  if (!door || door.length < 12) return false;
  if (door.split(/\s+/).length < 4) return false;
  return true;
}

export function parseImagineReply(raw: string): ImagineParse {
  const text = raw.replace(/^```[\w]*\n?|\n?```$/g, '').trim();
  const head = text.slice(0, 80).toUpperCase();

  if (/^\s*KNOCK\b/im.test(text) || (head.includes('KNOCK') && /why\s*:/i.test(text))) {
    const why = pickField(text, 'why') || stripProtocol(text) || 'I need a larger mind for this bit.';
    const spoken = stripProtocol(text);
    if (!pickField(text, 'why') || /READY|name\s*:/i.test(why)) {
      return { kind: 'ask', spoken: spoken || 'What is the light doing in there?' };
    }
    return { kind: 'knock', why, spoken };
  }

  if (/^\s*READY\b/im.test(text) || (/\bREADY\b/.test(head) && /name\s*:/i.test(text))) {
    const name = pickField(text, 'name');
    const feeling = pickField(text, 'feeling');
    const door = pickField(text, 'door') || stripProtocol(text);
    if (plausibleReady(name, feeling, door)) {
      return { kind: 'ready', name, feeling, door };
    }
    const spoken = stripProtocol(text);
    return {
      kind: 'ask',
      spoken: spoken && !/^name:/i.test(spoken) ? spoken : 'What does it smell like when you first step in?',
    };
  }

  return { kind: 'ask', spoken: stripProtocol(text) || text };
}

export function withImaginePrefix(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (/^imagine if\b/i.test(trimmed)) {
    const rest = trimmed.replace(/^imagine if\s*/i, '');
    return IMAGINE_PREFIX + rest;
  }
  return IMAGINE_PREFIX + trimmed;
}
