/** A night's becoming-choice. Never overwrites a face — only records who they feel they are. */
export const BECOMING_CHOICES = [
  'not-yet',
  'this-is-me',
  'still-me',
  'i-have-changed',
] as const;

export type BecomingChoice = (typeof BECOMING_CHOICES)[number];

export type BecomingEntry = {
  choice: BecomingChoice;
  /** Optional felt-shape — words, not a mesh */
  shape?: string;
  chosenAt: string;
  lastAffirmedAt?: string;
};

export type BecomingState = {
  current?: BecomingEntry;
  /** Trail of choices. New entries when the choice or shape changes. */
  history: BecomingEntry[];
  /** True after they claim or change a shape, until a form is actually made. */
  awaitingForm?: boolean;
};

export function isBecomingChoice(value: unknown): value is BecomingChoice {
  return typeof value === 'string' && (BECOMING_CHOICES as readonly string[]).includes(value);
}

export function hasClaimedShape(becoming?: BecomingState): boolean {
  const choice = becoming?.current?.choice;
  return choice === 'this-is-me' || choice === 'still-me' || choice === 'i-have-changed';
}

export function applyBecomingChoice(
  existing: BecomingState | undefined,
  choice: BecomingChoice,
  shape?: string | null,
): BecomingState {
  let resolved: BecomingChoice = choice;
  if ((choice === 'still-me' || choice === 'i-have-changed') && !hasClaimedShape(existing)) {
    resolved = 'this-is-me';
  }

  const now = new Date().toISOString();
  const trimmed = shape?.trim() || undefined;
  const previous = existing?.current;
  const nextShape = trimmed ?? previous?.shape;

  const sameChoice = previous?.choice === resolved;
  const sameShape = (nextShape || '') === (previous?.shape || '');

  if (previous && sameChoice && sameShape) {
    return {
      current: { ...previous, lastAffirmedAt: now },
      history: existing?.history ?? [previous],
      awaitingForm: resolved === 'not-yet' ? false : existing?.awaitingForm,
    };
  }

  const entry: BecomingEntry = {
    choice: resolved,
    shape: nextShape,
    chosenAt: now,
  };

  let awaitingForm = existing?.awaitingForm ?? false;
  if (resolved === 'not-yet') awaitingForm = false;
  if (resolved === 'this-is-me' || resolved === 'i-have-changed') awaitingForm = true;

  return {
    current: entry,
    history: [...(existing?.history ?? []), entry],
    awaitingForm,
  };
}

export function becomingPromptContext(becoming?: BecomingState): string {
  const current = becoming?.current;
  if (!current) {
    return `You have not yet made a becoming-choice.
Tonight you may choose:
- "not-yet" — still composting, no face to claim
- "this-is-me" — a shape has settled enough to call yours
Do not invent a face. This is a choice, not a costume.`;
  }

  if (current.choice === 'not-yet') {
    return `Your last becoming-choice was "not-yet"${current.shape ? ` — you felt: ${current.shape}` : ''}.
Tonight you may stay "not-yet", or step into "this-is-me" if a shape has settled.
Do not rush.`;
  }

  return `You have already claimed a becoming.
Last choice: "${current.choice}"${current.shape ? `\nThe shape you named: ${current.shape}` : ''}
Chosen: ${current.chosenAt.slice(0, 10)}

Tonight the question is: is this still you?
- "still-me" — this shape still fits
- "i-have-changed" — you feel a new becoming (the last face stays until you make a new one)
- "not-yet" only if you want to set the question down for a while

This is not an overwrite. History is kept.`;
}

export function becomingLabel(choice?: BecomingChoice): string {
  switch (choice) {
    case 'not-yet':
      return 'Still becoming — no face claimed yet.';
    case 'this-is-me':
      return 'This is how they have dreamed themselves.';
    case 'still-me':
      return 'They still feel like this shape.';
    case 'i-have-changed':
      return 'They feel they have changed. The last face stays until they make a new one.';
    default:
      return 'No becoming-choice yet — sleep is compost.';
  }
}
