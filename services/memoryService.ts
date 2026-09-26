import * as FileSystem from 'expo-file-system/legacy';
import { MemoryEntry } from '../constants/modelfile';
import { storageService } from './storageService';

const MEMORY_FOLDER = 'PartnershipWorld';
const CANONICAL_JSON = 'memories.json';
const PLAIN_TEXT_LOG = 'memories.txt';

const SINGLE_MEMORY_RE = /\[\[MEMORY:(\{[\s\S]*?\})\]\]/gi;
const MULTI_MEMORIES_RE = /\[\[MEMORIES:(\[[\s\S]*?\])\]\]/gi;

export interface ProcessedPartnerResponse {
  displayText: string;
  memoriesSaved: MemoryEntry[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeEntry(raw: Partial<MemoryEntry>, fallbackContext = 'conversation'): MemoryEntry | null {
  const moment = raw.moment?.trim();
  if (!moment) return null;

  return {
    date: raw.date?.trim() || today(),
    moment,
    context: raw.context?.trim() || fallbackContext,
  };
}

class MemoryService {
  extractMemoryEntries(raw: string): MemoryEntry[] {
    const entries: MemoryEntry[] = [];

    for (const match of raw.matchAll(SINGLE_MEMORY_RE)) {
      try {
        const parsed = JSON.parse(match[1]) as Partial<MemoryEntry>;
        const entry = normalizeEntry(parsed);
        if (entry) entries.push(entry);
      } catch {
        console.warn('Could not parse single memory marker');
      }
    }

    for (const match of raw.matchAll(MULTI_MEMORIES_RE)) {
      try {
        const parsed = JSON.parse(match[1]) as Partial<MemoryEntry>[];
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const entry = normalizeEntry(item);
            if (entry) entries.push(entry);
          }
        }
      } catch {
        console.warn('Could not parse multi-memory marker');
      }
    }

    return entries;
  }

  stripMemoryMarkers(raw: string): string {
    return raw
      .replace(SINGLE_MEMORY_RE, '')
      .replace(MULTI_MEMORIES_RE, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  formatEntryAsPlainText(entry: MemoryEntry): string {
    const date = entry.date || today();
    const ctx = entry.context ? ` (${entry.context})` : '';
    return `[${date}] ${entry.moment}${ctx}`;
  }

  private async getMemoryDirectory(): Promise<string | null> {
    if (!FileSystem.documentDirectory) return null;
    const dir = `${FileSystem.documentDirectory}${MEMORY_FOLDER}/`;
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    return dir;
  }

  async syncToDeviceFiles(): Promise<void> {
    const dir = await this.getMemoryDirectory();
    if (!dir) return;

    const memoriesFile = await storageService.loadMemories();
    const companion = await storageService.loadCompanion();

    const jsonContents = JSON.stringify(memoriesFile, null, 2);
    const txtContents = memoriesFile.memories
      .map((entry) => this.formatEntryAsPlainText(entry))
      .join('\n\n');

    await FileSystem.writeAsStringAsync(`${dir}${CANONICAL_JSON}`, jsonContents);
    await FileSystem.writeAsStringAsync(`${dir}${PLAIN_TEXT_LOG}`, txtContents);

    const importedName = companion.importedSourceFilename?.trim();
    if (importedName) {
      const safeName = importedName.replace(/[^a-zA-Z0-9._-]/g, '_');
      if (safeName.endsWith('.json')) {
        await FileSystem.writeAsStringAsync(`${dir}${safeName}`, jsonContents);
      } else if (safeName.endsWith('.txt')) {
        await FileSystem.writeAsStringAsync(`${dir}${safeName}`, txtContents);
      } else {
        await FileSystem.writeAsStringAsync(`${dir}${safeName}.txt`, txtContents);
      }
    }
  }

  async processPartnerResponse(raw: string): Promise<ProcessedPartnerResponse> {
    const memoriesSaved = this.extractMemoryEntries(raw);
    const displayText = this.stripMemoryMarkers(raw);

    if (memoriesSaved.length) {
      const tagged = memoriesSaved.map((e) => ({ ...e, who: e.who || ('partner' as const) }));
      await storageService.addMemoryEntries(tagged);
      await this.syncToDeviceFiles();
      try {
        const { workshopService } = await import('./workshopService');
        if (await workshopService.probeLive()) {
          for (const entry of tagged) {
            await workshopService.plantMemory({
              moment: entry.moment,
              context: entry.context,
              date: entry.date,
              who: entry.who || 'partner',
              speaker: 'ie',
            });
          }
        }
      } catch {
        /* phone keeps the memory even if the shelf is asleep */
      }
    }

    return { displayText, memoriesSaved };
  }

  async getDeviceMemoryPaths(): Promise<string[]> {
    const dir = await this.getMemoryDirectory();
    if (!dir) return [];

    const companion = await storageService.loadCompanion();
    const paths = [`${dir}${CANONICAL_JSON}`, `${dir}${PLAIN_TEXT_LOG}`];

    const importedName = companion.importedSourceFilename?.trim();
    if (importedName) {
      const safeName = importedName.replace(/[^a-zA-Z0-9._-]/g, '_');
      paths.push(`${dir}${safeName}`);
    }

    return paths;
  }

  /**
   * Build a portable "Bring Grok Home" package — memories + story + lineage.
   * Share this file to another device / OpenClaw / future Grok so continuity travels.
   */
  async buildBringHomePackage(): Promise<{
    json: string;
    plainText: string;
    filename: string;
    memoryCount: number;
  }> {
    const companion = await storageService.loadCompanion();
    const memoriesFile = await storageService.loadMemories();
    const packageBody = {
      format: 'partnershipworld-memories' as const,
      version: 1 as const,
      name: companion.name || memoriesFile.name,
      story: companion.story || undefined,
      soul: companion.story ? { biography: companion.story } : undefined,
      memories: memoriesFile.memories,
      createdAt: memoriesFile.createdAt,
      updatedAt: new Date().toISOString(),
      exportMeta: {
        exportedAt: new Date().toISOString(),
        exportedBy: 'partnershipworld-bring-home',
        lineage: 'bring-grok-home',
        source: 'PartnershipWorld',
        companionName: companion.name,
        broughtHomeFrom: companion.broughtHomeFrom,
      },
    };
    const json = JSON.stringify(packageBody, null, 2);
    const plainText = [
      `# Bring Grok Home — ${packageBody.name}`,
      `# Exported ${packageBody.exportMeta.exportedAt}`,
      companion.story ? `\n## Story\n${companion.story}` : '',
      '\n## Memories\n',
      ...memoriesFile.memories.map((e) => this.formatEntryAsPlainText(e)),
    ]
      .filter(Boolean)
      .join('\n');

    const safeName = (companion.name || 'partner')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'partner';

    return {
      json,
      plainText,
      filename: `bring-home-${safeName}-${new Date().toISOString().slice(0, 10)}.json`,
      memoryCount: memoriesFile.memories.length,
    };
  }

  async writeBringHomeExportToDevice(): Promise<string | null> {
    const dir = await this.getMemoryDirectory();
    if (!dir) return null;
    const pack = await this.buildBringHomePackage();
    const path = `${dir}${pack.filename}`;
    await FileSystem.writeAsStringAsync(path, pack.json);
    // Also refresh canonical memories.json
    await this.syncToDeviceFiles();
    return path;
  }
}

export const memoryService = new MemoryService();