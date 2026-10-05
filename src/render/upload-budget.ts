// §8.3/§9.4: how many queued uploads ship this frame. Groups (edit
// transactions) are atomic — either every member ships in this batch or
// none of them start; a group at the head ships whole even over budget,
// because edits bypass the cap.

export interface UploadItem {
  bytes: number;
  group?: number | undefined;
}

export function pickUploadBatch(items: readonly UploadItem[], maxBytes: number): number {
  if (items.length === 0) return 0;
  let taken = 0;
  let budget = maxBytes;
  while (taken < items.length) {
    const head = items[taken]!;
    if (head.group === undefined) {
      if (taken > 0 && head.bytes > budget) break;
      budget -= head.bytes;
      taken += 1;
      continue;
    }
    // Collect the whole group.
    let end = taken;
    let groupBytes = 0;
    while (end < items.length && items[end]!.group === head.group) {
      groupBytes += items[end]!.bytes;
      end += 1;
    }
    if (taken > 0 && groupBytes > budget) break;
    budget -= groupBytes;
    taken = end;
  }
  return taken;
}
