import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import {
  openAmorfusDb,
  newWorldMeta,
  saveWorldMeta,
  listWorlds,
  renameWorld,
  setLastWorld,
  getLastWorld,
} from './db';

// §12.4 world list: the metadata helpers behind New world, Open and Rename.

let dbCounter = 0;
const freshDb = () => openAmorfusDb(`amorfus-worlds-${process.pid}-${dbCounter++}`);

describe('world list helpers', () => {
  it('newWorldMeta is a ready world with fresh ids and the given seed', () => {
    const m = newWorldMeta('Second', [7, 7], 'seven');
    expect(m.status).toBe('ready');
    expect(m.name).toBe('Second');
    expect(m.seed).toEqual([7, 7]);
    expect(m.seedText).toBe('seven');
    expect(m.worldId).toMatch(/^[0-9a-f]{32}$/);
    expect(m.lineageId).toMatch(/^[0-9a-f]{32}$/);
    expect(m.lineageId).not.toBe(m.worldId);
    expect(m.generator).toEqual({ id: 'amorfus', version: 1 });
    expect(m.hlc).toEqual({ l: 0, c: 0 });
    expect(newWorldMeta('x', [1, 1]).seedText).toBeUndefined();
    expect(newWorldMeta('a', [1, 1]).worldId).not.toBe(newWorldMeta('b', [1, 1]).worldId);
  });

  it('a saved new world is listed, can be renamed, and can be made the last world', async () => {
    const db = await freshDb();
    expect(await getLastWorld(db)).toBeUndefined();
    const a = newWorldMeta('First', [1, 1]);
    const b = newWorldMeta('Second', [7, 7]);
    await saveWorldMeta(db, a);
    await saveWorldMeta(db, b);
    expect((await listWorlds(db)).map((w) => w.name).sort()).toEqual(['First', 'Second']);
    await renameWorld(db, b.worldId, 'Renamed');
    expect((await db.get('worlds', b.worldId))!.name).toBe('Renamed');
    expect((await db.get('worlds', b.worldId))!.seed).toEqual([7, 7]); // nothing else changes
    await setLastWorld(db, b.worldId);
    expect(await getLastWorld(db)).toBe(b.worldId);
    await setLastWorld(db, a.worldId);
    expect(await getLastWorld(db)).toBe(a.worldId);
  });

  it('renaming a missing world is a no-op', async () => {
    const db = await freshDb();
    await renameWorld(db, 'f'.repeat(32), 'ghost');
    expect(await listWorlds(db)).toEqual([]);
  });
});
