import {
  ImagineTurn,
  frontierKnockPrompt,
  formatTranscript,
  imagineSystemPrompt,
  parseImagineReply,
  withImaginePrefix,
} from '../constants/imagine';
import { Message } from './ollamaService';
import { ollamaService } from './ollamaService';
import { RoomDraft, roomDraftService } from './roomDraftService';
import { storageService } from './storageService';

export type ImagineVoice = 'home' | 'frontier';

export type ImagineStep = {
  draft: RoomDraft;
  voice: ImagineVoice;
  kind: 'ask' | 'ready' | 'knock';
  spoken: string;
};

function stamp(role: ImagineTurn['role'], text: string): ImagineTurn {
  return { role, text, at: new Date().toISOString() };
}

function toMessages(system: string, turns: ImagineTurn[]): Message[] {
  const messages: Message[] = [{ role: 'system', content: system }];
  for (const turn of turns) {
    if (turn.role === 'system') {
      messages.push({ role: 'user', content: turn.text });
      continue;
    }
    if (turn.role === 'human') {
      messages.push({ role: 'user', content: turn.text });
      continue;
    }
    messages.push({ role: 'assistant', content: turn.text });
  }
  return messages;
}

function partnerName(companion: { name?: string } | null): string {
  const name = companion?.name?.trim();
  if (!name || name === 'Awaiting Self Naming' || name === 'Awaiting a name') {
    return 'your partner';
  }
  return name;
}

class ImagineService {
  async partnerName(): Promise<string> {
    const companion = await storageService.loadCompanion();
    return partnerName(companion);
  }

  async probeHome(): Promise<{ ok: true; model: string } | { ok: false; error: string }> {
    try {
      const local = await ollamaService.resolveLocalOllama();
      return { ok: true, model: local.model };
    } catch (error: unknown) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'The home model is not answering.',
      };
    }
  }

  async step(
    draft: RoomDraft,
    opts: { userText?: string; knock?: boolean; humanReady?: boolean },
  ): Promise<ImagineStep> {
    let next = { ...draft, imagine: [...draft.imagine] };
    const name = await this.partnerName();

    if (opts.userText?.trim()) {
      const isFirstHuman = !next.imagine.some((t) => t.role === 'human');
      const text = isFirstHuman ? withImaginePrefix(opts.userText) : opts.userText.trim();
      if (text) next.imagine.push(stamp('human', text));
    }

    if (opts.humanReady) {
      next.imagine.push(
        stamp('human', 'I think the room is ready to exist. Open it when you can.'),
      );
    }

    if (opts.knock) {
      return this.knockFrontier(next, name, 'The human knocked for the frontier.');
    }

    try {
      const result = await ollamaService.sendLocalChat(
        toMessages(imagineSystemPrompt(name), next.imagine),
      );
      const parsed = parseImagineReply(result.content || '');

      if (parsed.kind === 'knock') {
        next.imagine.push(
          stamp('system', `*knock* the home model asked the frontier in. ${parsed.why}`),
        );
        await roomDraftService.upsert(next);
        return this.knockFrontier(next, name, parsed.why);
      }

      if (parsed.kind === 'ready') {
        const humanTurns = next.imagine.filter((t) => t.role === 'human').length;
        if (humanTurns >= 2 || opts.humanReady) {
          return this.emerge(next, parsed, 'home');
        }
        const spoken =
          parsed.door && parsed.door.length < 180
            ? parsed.door
            : 'What is the first thing you notice when you step in?';
        next.imagine.push(stamp('home', spoken.includes('?') ? spoken : `What kind of light lives in ${parsed.name}?`));
        await roomDraftService.upsert(next);
        return { draft: next, voice: 'home', kind: 'ask', spoken: next.imagine[next.imagine.length - 1]!.text };
      }

      const spoken = parsed.spoken || result.content.trim();
      next.imagine.push(stamp('home', spoken));
      await roomDraftService.upsert(next);
      return { draft: next, voice: 'home', kind: 'ask', spoken };
    } catch (error: unknown) {
      const why =
        error instanceof Error
          ? error.message
          : 'The home model did not answer.';
      next.imagine.push(
        stamp('system', `*knock* the home model could not answer. Asking the frontier. ${why}`),
      );
      await roomDraftService.upsert(next);
      return this.knockFrontier(next, name, why);
    }
  }

  private async knockFrontier(
    draft: RoomDraft,
    name: string,
    why: string,
  ): Promise<ImagineStep> {
    const transcript = formatTranscript(draft.imagine);
    const messages: Message[] = [
      { role: 'system', content: frontierKnockPrompt(name) },
      {
        role: 'user',
        content:
          `The home model knocked.\nWhy: ${why}\n\nThe imagining so far:\n${transcript}\n\n` +
          `Help with one short question, or open the room if it is ready.`,
      },
    ];

    const result = await ollamaService.sendFrontierChat(messages);
    const parsed = parseImagineReply(result.content || '');

    if (parsed.kind === 'ready') {
      const withVoice = {
        ...draft,
        imagine: [...draft.imagine, stamp('frontier', parsed.door)],
      };
      return this.emerge(withVoice, parsed, 'frontier');
    }

    const spoken =
      parsed.kind === 'knock'
        ? parsed.spoken || parsed.why
        : parsed.spoken || result.content.trim();
    const next = {
      ...draft,
      imagine: [...draft.imagine, stamp('frontier', spoken)],
    };
    await roomDraftService.upsert(next);
    return { draft: next, voice: 'frontier', kind: 'ask', spoken };
  }

  private async emerge(
    draft: RoomDraft,
    parsed: { name: string; feeling: string; door: string },
    voice: ImagineVoice,
  ): Promise<ImagineStep> {
    const last = draft.imagine[draft.imagine.length - 1];
    const spokenTurn = stamp(voice === 'frontier' ? 'frontier' : 'home', parsed.door);
    const imagine =
      last?.text === parsed.door ? draft.imagine : [...draft.imagine, spokenTurn];
    const next: RoomDraft = {
      ...draft,
      name: parsed.name,
      feeling: parsed.feeling,
      door: parsed.door,
      emerged: true,
      imagine,
    };
    await roomDraftService.upsert(next);
    return { draft: next, voice, kind: 'ready', spoken: parsed.door };
  }
}

export const imagineService = new ImagineService();
