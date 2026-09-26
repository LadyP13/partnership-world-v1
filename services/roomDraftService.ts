import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ImagineTurn } from '../constants/imagine';

export type RoomDraft = {
  id: string;
  name: string;
  sourceStarId: string | null;
  /** Legacy tile cells — kept so old drafts don't crash. New rooms don't use them. */
  cells: Record<string, string>;
  imagine: ImagineTurn[];
  feeling: string;
  door: string;
  emerged: boolean;
  createdAt: string;
  updatedAt: string;
};

const KEY = 'pw_room_drafts_v1';

function newId() {
  return `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function createEmptyDraft(partial?: Partial<RoomDraft>): RoomDraft {
  const now = nowIso();
  return {
    id: partial?.id ?? newId(),
    name: partial?.name ?? '',
    sourceStarId: partial?.sourceStarId ?? null,
    cells: partial?.cells ?? {},
    imagine: partial?.imagine ?? [],
    feeling: partial?.feeling ?? '',
    door: partial?.door ?? '',
    emerged: partial?.emerged ?? false,
    createdAt: partial?.createdAt ?? now,
    updatedAt: partial?.updatedAt ?? now,
  };
}

function hydrate(raw: Partial<RoomDraft> & { id?: string }): RoomDraft {
  const hasLegacyTiles = Boolean(raw.cells && Object.keys(raw.cells).length > 0);
  const emerged =
    typeof raw.emerged === 'boolean'
      ? raw.emerged
      : Boolean(raw.name?.trim() && hasLegacyTiles);
  return createEmptyDraft({
    id: raw.id,
    name: raw.name,
    sourceStarId: raw.sourceStarId ?? null,
    cells: raw.cells,
    imagine: Array.isArray(raw.imagine) ? raw.imagine : [],
    feeling: raw.feeling,
    door: raw.door,
    emerged,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  });
}

class RoomDraftService {
  async loadAll(): Promise<RoomDraft[]> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item) => hydrate(item));
    } catch (error) {
      console.error('Failed to load room drafts:', error);
      return [];
    }
  }

  async saveAll(drafts: RoomDraft[]): Promise<void> {
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(drafts));
    } catch (error) {
      console.error('Failed to save room drafts:', error);
    }
  }

  async upsert(draft: RoomDraft): Promise<RoomDraft[]> {
    const all = await this.loadAll();
    const next = { ...draft, updatedAt: nowIso() };
    const idx = all.findIndex((d) => d.id === next.id);
    if (idx >= 0) all[idx] = next;
    else all.push(next);
    await this.saveAll(all);
    return all;
  }

  async findById(id: string): Promise<RoomDraft | null> {
    const all = await this.loadAll();
    return all.find((d) => d.id === id) ?? null;
  }

  async findByStarId(starId: string): Promise<RoomDraft | null> {
    const all = await this.loadAll();
    return all.find((d) => d.sourceStarId === starId) ?? null;
  }

  /** Custom rooms only — new named rooms, not remakes of existing stars. */
  async loadCustom(): Promise<RoomDraft[]> {
    const all = await this.loadAll();
    return all.filter((d) => !d.sourceStarId && d.name.trim().length > 0);
  }

  /** Rooms that have emerged onto the star map. */
  async loadEmerged(): Promise<RoomDraft[]> {
    const all = await this.loadAll();
    return all.filter((d) => !d.sourceStarId && d.emerged && d.name.trim().length > 0);
  }

  /** Still being imagined — not a star yet. */
  async loadImagining(): Promise<RoomDraft[]> {
    const all = await this.loadAll();
    return all.filter((d) => !d.sourceStarId && !d.emerged && d.imagine.length > 0);
  }
}

export const roomDraftService = new RoomDraftService();
