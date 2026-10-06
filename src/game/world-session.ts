// §12 glue: one open world per page — Web Lock held, entries loaded in
// full, the flush policy driving debounced saves, export/import/copy, and
// the storage-status line. Browser-side; the logic underneath
// (db/import-export/flush-policy/classifier) is unit-tested.
import {
  openAmorfusDb,
  startupCleanup,
  saveWorldMeta,
  saveChunkBlob,
  loadWorld,
  listWorlds,
  deleteWorld,
  randomWorldId,
  type AmorfusDb,
  type WorldMeta,
  type LoadedWorld,
} from '../storage/db';
import { FlushPolicy } from '../storage/flush-policy';
import { exportWorld, importAmorfus, type ImportMode, type ImportResult } from '../storage/import-export';
import { encodeChunkEntries } from '../core/codec/chunk-entries';
import { classifyOrigin, bannerFor, type OriginClass } from '../storage/classify-origin';
import type { LwwStore } from '../core/sync/lww';
import type { Hlc } from '../core/sync/hlc';

/** What attach() needs — EditManager matches structurally. */
export interface AttachTarget {
  edits: LwwStore;
  hlc: Hlc;
  onEdit: ((chunkKey: number) => void) | null;
}

export class LockBusyError extends Error {}

export class WorldSession {
  readonly db: AmorfusDb;
  meta: WorldMeta;
  readonly loaded: LoadedWorld;
  readonly originClass: OriginClass;
  private flushPolicy = new FlushPolicy();
  private dirtyChunks = new Set<number>();
  private editManager: AttachTarget | null = null;
  private releaseLock: (() => void) | null = null;
  persistStatus = 'not yet saved';
  playerState: unknown;

  private constructor(db: AmorfusDb, loaded: LoadedWorld, originClass: OriginClass) {
    this.db = db;
    this.meta = loaded.meta;
    this.loaded = loaded;
    this.originClass = originClass;
  }

  static classify(): OriginClass {
    let indexedDbOk: boolean;
    try {
      indexedDbOk = typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch {
      indexedDbOk = false;
    }
    return classifyOrigin({
      origin: location.origin,
      hostname: location.hostname,
      pathname: location.pathname,
      indexedDbOk,
    });
  }

  static banner(): string | null {
    return bannerFor(WorldSession.classify());
  }

  /** Open (or create) a world. `steal` takes the Web Lock over (§12.1). */
  static async open(options: {
    seed: [number, number];
    worldId?: string;
    steal?: boolean;
  }): Promise<WorldSession> {
    const originClass = WorldSession.classify();
    const db = await openAmorfusDb('amorfus', () => {
      // §12.1 versionchange → ask to reload
      const banner = document.getElementById('banner');
      if (banner) {
        banner.textContent = 'Amorfus was updated in another tab — reload this page.';
        banner.hidden = false;
      }
    });
    await startupCleanup(db);

    let meta: WorldMeta | undefined;
    if (options.worldId !== undefined) {
      meta = await db.get('worlds', options.worldId);
    } else {
      const worlds = await listWorlds(db);
      meta = worlds[0];
    }
    if (meta === undefined) {
      meta = {
        worldId: randomWorldId(),
        lineageId: randomWorldId(),
        name: 'My world',
        seed: options.seed,
        generator: { id: 'amorfus', version: 1 },
        chunkSize: 32,
        materials: ['air', 'grass', 'dirt', 'stone', 'sand', 'planks', 'brick', 'reserved7'],
        hlc: { l: 0, c: 0 },
        status: 'ready',
      };
      await saveWorldMeta(db, meta);
    }

    // One writer per world (§12.1 Web Locks); second tab → take-over offer.
    const session = new WorldSession(db, (await loadWorld(db, meta.worldId))!, originClass);
    if (typeof navigator !== 'undefined' && 'locks' in navigator) {
      const acquired = await new Promise<boolean>((resolve) => {
        void navigator.locks.request(
          `amorfus-world-${meta.worldId}`,
          { ifAvailable: !(options.steal ?? false), steal: options.steal ?? false },
          (lock) => {
            if (lock === null) {
              resolve(false);
              return Promise.resolve();
            }
            resolve(true);
            return new Promise<void>((release) => {
              session.releaseLock = release;
            });
          },
        ).catch(() => resolve(false));
      });
      if (!acquired) throw new LockBusyError('world is open in another tab');
    }
    return session;
  }

  attach(editManager: AttachTarget): void {
    this.editManager = editManager;
    editManager.onEdit = (chunkKey) => {
      this.dirtyChunks.add(chunkKey);
      this.flushPolicy.markDirty(performance.now());
    };
    // §12.1: flush on hide and pagehide too.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.flushNow();
    });
    addEventListener('pagehide', () => void this.flushNow());
  }

  /** call once per frame */
  frame(nowMs: number): void {
    if (this.flushPolicy.shouldFlush(nowMs)) void this.flushNow();
  }

  async flushNow(): Promise<void> {
    if (this.editManager === null) return;
    const dirty = [...this.dirtyChunks];
    this.dirtyChunks.clear();
    this.flushPolicy.flushed(performance.now());
    for (const key of dirty) {
      const blob = encodeChunkEntries(this.editManager.edits.snapshot(key));
      await saveChunkBlob(this.db, this.meta.worldId, key, blob);
    }
    this.meta.hlc = this.editManager.hlc.state();
    await saveWorldMeta(this.db, this.meta);
    if (this.playerState !== undefined) {
      await this.db.put('players', this.playerState, [this.meta.worldId, 'local']);
    }
    if (this.persistStatus === 'not yet saved') {
      this.persistStatus = 'saved';
      // §12.2: ask after the first save and show the outcome.
      try {
        const granted = await navigator.storage?.persist?.();
        this.persistStatus = granted
          ? 'protected from automatic cleanup'
          : 'may be cleared if disk space runs low — Export to keep a copy';
      } catch {
        this.persistStatus = 'saved (persistence request unavailable)';
      }
    }
  }

  async exportFile(profile: 0 | 1): Promise<Uint8Array> {
    await this.flushNow();
    return exportWorld(this.db, this.meta.worldId, profile, this.playerState);
  }

  async importFile(bytes: Uint8Array, mode: ImportMode): Promise<ImportResult> {
    return importAmorfus(this.db, bytes, mode, Date.now());
  }

  /** §12.1 "Save as copy": fork the CURRENT world locally. */
  async saveAsCopy(name: string): Promise<string> {
    const bytes = await this.exportFile(0);
    const result = await importAmorfus(this.db, bytes, 'fork', Date.now());
    if (!result.ok || result.worldId === undefined) throw new Error(result.reason ?? 'copy failed');
    const meta = await this.db.get('worlds', result.worldId);
    if (meta !== undefined) {
      meta.name = name;
      await saveWorldMeta(this.db, meta);
    }
    return result.worldId;
  }

  async rename(name: string): Promise<void> {
    this.meta.name = name;
    await saveWorldMeta(this.db, this.meta);
  }

  async listAll(): Promise<WorldMeta[]> {
    return listWorlds(this.db);
  }

  async deleteOther(worldId: string): Promise<void> {
    if (worldId === this.meta.worldId) throw new Error('cannot delete the open world');
    await deleteWorld(this.db, worldId);
  }

  close(): void {
    this.releaseLock?.();
  }
}
