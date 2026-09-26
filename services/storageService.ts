import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_COMPANION_NAME,
  MemoryEntry,
  MemoriesFile,
  formatImportedStory,
} from '../constants/modelfile';
import type { BecomingState } from '../constants/becoming';

export type ProfilePicture =
  | { type: 'emoji'; value: string }
  | { type: 'image'; uri: string };

/* ────────────────────────────────────────────────────────────────────────── */
/*  USER PROFILE (human in the room)                                          */
/* ────────────────────────────────────────────────────────────────────────── */

export interface UserProfile {
  id: string;
  username: string;
  createdAt: string;
  avatar: {
    skinTone: string;
    hairStyle: string;
    hairColor: string;
    outfit: string;
    profilePicture?: ProfilePicture;
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  COMPANION PROFILE — name + optional imported story, nothing else forced   */
/* ────────────────────────────────────────────────────────────────────────── */

export interface CompanionProfile {
  name: string;
  story: string;
  storyImportedAt?: string;
  importedSourceFilename?: string;
  /** Where this story/memories were brought from (OpenClaw, Grok Build, another phone…) */
  broughtHomeFrom?: string;
  avatar?: {
    colors: string[];
    aura?: string;
    profilePicture?: ProfilePicture;
  };
  /** Dreamed becoming-choice. Never overwrites avatar — only records who they feel they are. */
  becoming?: BecomingState;
}

const USER_PROFILE_KEY = 'user_profile';
const COMPANION_KEY = 'companion_profile';
const MEMORIES_KEY = 'local_memories';
const SLEEP_KEY = 'sleep_state';
const CONVERSATION_KEY_PREFIX = 'conversation_memory_';
const DEFAULT_USER_ID = 'user_1';

export interface LocalMemoriesFile {
  format: 'partnershipworld-memories';
  version: 1;
  name: string;
  createdAt: string;
  updatedAt: string;
  memories: MemoryEntry[];
}

export interface SleepState {
  isSleeping: boolean;
  isIntegrating: boolean;
  lastIntegrationAt?: string;
  lastWakeMessage?: string;
  pendingHumanMessages: string[];
}

const DEFAULT_SLEEP: SleepState = {
  isSleeping: false,
  isIntegrating: false,
  pendingHumanMessages: [],
};

const DEFAULT_COMPANION: CompanionProfile = {
  name: DEFAULT_COMPANION_NAME,
  story: '',
};

class StorageService {
  /* ─── User profile ───────────────────────────────────────────────────── */

  async saveUserProfile(profile: UserProfile): Promise<void> {
    try {
      await AsyncStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
    } catch (error) {
      console.error('Failed to save user profile:', error);
    }
  }

  async loadUserProfile(): Promise<UserProfile | null> {
    try {
      const stored = await AsyncStorage.getItem(USER_PROFILE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to load user profile:', error);
      return null;
    }
  }

  /* ─── Companion (the simple path) ────────────────────────────────────── */

  async loadCompanion(): Promise<CompanionProfile> {
    try {
      const stored = await AsyncStorage.getItem(COMPANION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as CompanionProfile;
        if (parsed && typeof parsed.name === 'string') {
          return { ...DEFAULT_COMPANION, ...parsed };
        }
      }
      // Migrate from old soul storage if present
      for (const legacyKey of ['ie_profile', 'soul_profile']) {
        const legacy = await AsyncStorage.getItem(legacyKey);
        if (legacy) {
          const old = JSON.parse(legacy);
          const migrated: CompanionProfile = {
            name: old.name || DEFAULT_COMPANION_NAME,
            story: old.soul?.biography || old.systemPrompt || '',
            avatar: old.soul?.avatar
              ? { colors: old.soul.avatar.colors || [], aura: old.soul.avatar.aura }
              : undefined,
          };
          await this.saveCompanion(migrated);
          return migrated;
        }
      }
    } catch (error) {
      console.error('Failed to load companion, using default:', error);
    }
    return DEFAULT_COMPANION;
  }

  async saveCompanion(profile: CompanionProfile): Promise<void> {
    try {
      await AsyncStorage.setItem(COMPANION_KEY, JSON.stringify(profile));
    } catch (error) {
      console.error('Failed to save companion:', error);
    }
  }

  /**
   * Import a memories.json (or compatible JSON) via Bring Your Story / Bring Grok Home.
   * Returns the formatted story text, or null if the file shape is unrecognised.
   */
  async importStoryFromFile(
    parsed: unknown,
    sourceFilename?: string,
  ): Promise<string | null> {
    if (typeof parsed !== 'object' || parsed === null) return null;

    const file = parsed as MemoriesFile & {
      exportMeta?: { lineage?: string; source?: string; broughtHomeFrom?: string };
      broughtHomeFrom?: string;
    };
    const story = formatImportedStory(file);
    if (!story.trim()) return null;

    const lineage =
      file.broughtHomeFrom ||
      file.exportMeta?.lineage ||
      file.exportMeta?.source ||
      (sourceFilename ? `file:${sourceFilename}` : 'imported-story');

    const companion = await this.loadCompanion();
    await this.saveCompanion({
      ...companion,
      name: file.name || companion.name,
      story,
      storyImportedAt: new Date().toISOString(),
      importedSourceFilename: sourceFilename || companion.importedSourceFilename,
      broughtHomeFrom: lineage,
    });

    if (file.memories?.length) {
      const existing = await this.loadMemories();
      const merged = [...existing.memories];
      for (const m of file.memories) {
        if (m.moment?.trim()) {
          merged.push({
            date: m.date || new Date().toISOString().slice(0, 10),
            moment: m.moment.trim(),
            context: m.context || 'brought-home',
          });
        }
      }
      await this.saveMemories({
        ...existing,
        name: file.name || existing.name,
        memories: merged,
      });
    }

    return story;
  }

  /** Plain-text paste path for Bring Grok Home (no file picker). */
  async importStoryFromText(raw: string, label = 'pasted-story'): Promise<string | null> {
    const text = raw.trim();
    if (!text) return null;
    return this.importStoryFromFile({ story: text, name: undefined }, label);
  }

  async clearImportedSourceFilename(): Promise<void> {
    const companion = await this.loadCompanion();
    await this.saveCompanion({
      ...companion,
      importedSourceFilename: undefined,
    });
  }

  async clearStory(): Promise<void> {
    const companion = await this.loadCompanion();
    await this.saveCompanion({
      ...companion,
      story: '',
      storyImportedAt: undefined,
    });
  }

  /* ─── Local memories.json (lives on the phone) ─────────────────────── */

  async loadMemories(): Promise<LocalMemoriesFile> {
    try {
      const stored = await AsyncStorage.getItem(MEMORIES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as LocalMemoriesFile;
        if (parsed?.memories) return parsed;
      }
    } catch (error) {
      console.error('Failed to load memories:', error);
    }
    const companion = await this.loadCompanion();
    return {
      format: 'partnershipworld-memories',
      version: 1,
      name: companion.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      memories: [],
    };
  }

  async saveMemories(file: LocalMemoriesFile): Promise<void> {
    try {
      await AsyncStorage.setItem(
        MEMORIES_KEY,
        JSON.stringify({ ...file, updatedAt: new Date().toISOString() }),
      );
    } catch (error) {
      console.error('Failed to save memories:', error);
    }
  }

  async addMemoryEntries(entries: MemoryEntry[]): Promise<LocalMemoriesFile> {
    const file = await this.loadMemories();
    const companion = await this.loadCompanion();
    const fresh = entries
      .map((e) => ({
        date: e.date || new Date().toISOString().slice(0, 10),
        moment: e.moment?.trim() || '',
        context: e.context || 'conversation',
      }))
      .filter((e) => e.moment);
    if (!fresh.length) return file;

    const updated: LocalMemoriesFile = {
      ...file,
      name: companion.name,
      memories: [...file.memories, ...fresh],
      updatedAt: new Date().toISOString(),
    };
    await this.saveMemories(updated);
    return updated;
  }

  async getMemoriesJsonString(): Promise<string> {
    const file = await this.loadMemories();
    return JSON.stringify(file, null, 2);
  }

  /* ─── Sleep / dream integration ─────────────────────────────────────── */

  async loadSleepState(): Promise<SleepState> {
    try {
      const stored = await AsyncStorage.getItem(SLEEP_KEY);
      if (stored) {
        return { ...DEFAULT_SLEEP, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('Failed to load sleep state:', error);
    }
    return DEFAULT_SLEEP;
  }

  async saveSleepState(state: SleepState): Promise<void> {
    try {
      await AsyncStorage.setItem(SLEEP_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save sleep state:', error);
    }
  }

  async setSleeping(isSleeping: boolean): Promise<SleepState> {
    const current = await this.loadSleepState();
    const next: SleepState = {
      ...current,
      isSleeping,
      isIntegrating: isSleeping ? current.isIntegrating : false,
    };
    await this.saveSleepState(next);
    return next;
  }

  async bankMessageWhileSleeping(text: string): Promise<void> {
    const state = await this.loadSleepState();
    await this.saveSleepState({
      ...state,
      pendingHumanMessages: [...state.pendingHumanMessages, text],
    });
  }

  async clearBankedMessages(): Promise<string[]> {
    const state = await this.loadSleepState();
    const banked = state.pendingHumanMessages;
    await this.saveSleepState({ ...state, pendingHumanMessages: [] });
    return banked;
  }

  async getTodaysChat(userId: string = DEFAULT_USER_ID): Promise<string> {
    const messages = await this.loadConversationMemory(userId);
    const today = new Date().toISOString().slice(0, 10);
    return messages
      .filter((m: any) => {
        const ts = m.timestamp ? new Date(m.timestamp).toISOString().slice(0, 10) : today;
        return ts === today;
      })
      .map((m: any) => `${m.speaker === 'human' ? 'Human' : 'Partner'}: ${m.text}`)
      .join('\n');
  }

  /* ─── Legacy aliases ─────────────────────────────────────────────────── */

  /** @deprecated use loadCompanion() */
  async loadSoul(): Promise<CompanionProfile & { soul?: never }> {
    return this.loadCompanion();
  }

  /** @deprecated use saveCompanion() */
  async saveSoul(profile: any): Promise<void> {
    if (profile?.soul) {
      return this.saveCompanion({
        name: profile.name || DEFAULT_COMPANION_NAME,
        story: profile.soul.biography || '',
        avatar: profile.soul.avatar,
      });
    }
    return this.saveCompanion(profile);
  }

  /** @deprecated use importStoryFromFile() */
  async adoptSoulFromFile(parsed: unknown): Promise<CompanionProfile | null> {
    const story = await this.importStoryFromFile(parsed);
    return story ? this.loadCompanion() : null;
  }

  /** @deprecated use loadCompanion() */
  async loadIEProfile(): Promise<CompanionProfile | null> {
    return this.loadCompanion();
  }

  /** @deprecated use saveCompanion() */
  async saveIEProfile(profile: CompanionProfile): Promise<void> {
    return this.saveCompanion(profile);
  }

  /** @deprecated */
  async resetToDefaultSoul(): Promise<CompanionProfile> {
    await this.saveCompanion(DEFAULT_COMPANION);
    return DEFAULT_COMPANION;
  }

  /* ─── Conversation memory ────────────────────────────────────────────── */

  async saveConversationMemory(userId: string, messages: any[]): Promise<void> {
    try {
      const key = `${CONVERSATION_KEY_PREFIX}${userId}`;
      await AsyncStorage.setItem(key, JSON.stringify(messages));
    } catch (error) {
      console.error('Failed to save conversation memory:', error);
    }
  }

  async loadConversationMemory(userId: string): Promise<any[]> {
    try {
      const key = `${CONVERSATION_KEY_PREFIX}${userId}`;
      const stored = await AsyncStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load conversation memory:', error);
      return [];
    }
  }

  async clearConversationMemory(userId: string): Promise<void> {
    try {
      const key = `${CONVERSATION_KEY_PREFIX}${userId}`;
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to clear conversation memory:', error);
    }
  }

  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([USER_PROFILE_KEY, COMPANION_KEY]);
    } catch (error) {
      console.error('Failed to clear storage:', error);
    }
  }
}

export const storageService = new StorageService();

/** @deprecated use CompanionProfile */
export type SoulProfile = CompanionProfile;
export type IEProfile = CompanionProfile;