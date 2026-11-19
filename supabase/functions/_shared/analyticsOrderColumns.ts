// Both ends opt into this format. Older clients and mixed-shape batches use ordinary rows.
type OrderRow = Record<string, unknown>;
interface OrderColumns {
  keys: string[];
  values: unknown[][];
}

export function packOrderRows(orders: OrderRow[]): { orders: OrderRow[] } | { orderColumns: OrderColumns } {
  if (orders.length < 2) return { orders };
  const keys = Object.keys(orders[0]);
  const values = keys.map(() => new Array<unknown>(orders.length));
  for (let index = 0; index < orders.length; index++) {
    const row = orders[index];
    if (Object.keys(row).length !== keys.length) return { orders };
    for (let col = 0; col < keys.length; col++) {
      const value = row[keys[col]];
      if (value === undefined) return { orders };
      values[col][index] = value;
    }
  }
  return { orderColumns: { keys, values } };
}

function unpackOrderColumns(batch: { orders?: OrderRow[]; orderColumns?: OrderColumns }): OrderRow[] {
  if (Array.isArray(batch?.orders)) return batch.orders;
  const columns = batch?.orderColumns;
  if (!columns || !Array.isArray(columns.keys) || !Array.isArray(columns.values) ||
      columns.keys.length === 0 || columns.keys.length !== columns.values.length) {
    throw new Error("Invalid Analytics order batch");
  }
  const { keys, values } = columns;
  const size = values[0]?.length;
  if (size === undefined || values.some(column => !Array.isArray(column) || column.length !== size)) {
    throw new Error("Incomplete Analytics order batch");
  }
  const rows: OrderRow[] = Array.from({ length: size }, () => Object.create(null));
  for (let col = 0; col < keys.length; col++) {
    const key = keys[col];
    for (let index = 0; index < size; index++) rows[index][key] = values[col][index];
  }
  return rows;
}

const stopFields = ["type", "city", "state", "datetime"] as const;

// Only use this projection for the exact child shape read by the Analytics endpoints.
// If a deployment adds a field, transmit the original rows until both ends support it.
export function packAnalyticsPage(orders: OrderRow[]) {
  const compact: OrderRow[] = [];
  for (const row of orders) {
    const stops = row.pickup_drops;
    const pods = row.order_files;
    if (!Array.isArray(stops) || !Array.isArray(pods) ||
        !stops.every(stop => stop && stop.order_id === row.id && Object.keys(stop).length === 5 &&
          stopFields.every(key => Object.prototype.hasOwnProperty.call(stop, key))) ||
        !pods.every(pod => pod && pod.order_id === row.id && pod.file_category === "POD" && Object.keys(pod).length === 2)) {
      return packOrderRows(orders);
    }
    compact.push({ ...row, pickup_drops: stops.map(stop => stopFields.map(key => stop[key])), order_files: pods.length });
  }
  return { ...packOrderRows(compact), compactChildren: true };
}

export function readOrderRows(batch: Parameters<typeof unpackOrderColumns>[0] & { compactChildren?: boolean }) {
  const rows = unpackOrderColumns(batch);
  if (!batch.compactChildren) return rows;
  return rows.map((row): OrderRow => {
    const stops = row.pickup_drops;
    const count = row.order_files;
    if (!Array.isArray(stops) || typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
      throw new Error("Invalid compact order relations");
    }
    const pickup_drops = stops.map(stop => {
      if (!Array.isArray(stop) || stop.length !== stopFields.length) throw new Error("Incomplete Analytics stop");
      const [type, city, state, datetime] = stop;
      return { order_id: row.id, type, city, state, datetime };
    });
    const order_files = Array.from({ length: count }, () => ({ order_id: row.id, file_category: "POD" }));
    return { ...row, pickup_drops, order_files };
  });
}

// The archive endpoint already authorizes and joins each page. Fingerprint that exact
// result (including stops, PODs and entity names), never timestamps or row counts alone.
const ARCHIVE_BLOCK_SIZE = 100;
export interface CachedArchiveBlock {
  tag: string;
  json: string;
}
type ArchiveBatch = Parameters<typeof readOrderRows>[0] & { count: number; archiveTags?: string[] };

export async function packArchivePage(orders: OrderRow[], userId: string, knownTags: string[]) {
  const known = new Set(knownTags);
  const archiveTags: string[] = [];
  const changed: OrderRow[] = [];
  const encoder = new TextEncoder();
  for (let start = 0; start < orders.length; start += ARCHIVE_BLOCK_SIZE) {
    const block = orders.slice(start, start + ARCHIVE_BLOCK_SIZE);
    const bytes = encoder.encode(JSON.stringify([userId, block]));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const tag = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
    archiveTags.push(tag);
    if (!known.has(tag)) changed.push(...block);
  }
  return { ...packAnalyticsPage(changed), archiveTags };
}

export function readArchivePage(batch: ArchiveBatch, previous: CachedArchiveBlock[]) {
  const changed = readOrderRows(batch);
  const blocks: CachedArchiveBlock[] = [];
  if (batch.archiveTags === undefined) return { orders: changed, blocks };
  if (!Number.isSafeInteger(batch.count) || batch.count < 0 || !Array.isArray(batch.archiveTags) ||
      batch.archiveTags.length !== Math.ceil(batch.count / ARCHIVE_BLOCK_SIZE) ||
      !batch.archiveTags.every(tag => typeof tag === "string" && /^[0-9a-f]{64}$/.test(tag))) {
    throw new Error("Invalid Analytics archive manifest");
  }

  const known = new Map(previous.map(block => [block.tag, block]));
  const orders: OrderRow[] = [];
  let offset = 0;
  for (const tag of batch.archiveTags) {
    const size = Math.min(ARCHIVE_BLOCK_SIZE, batch.count - orders.length);
    const cached = known.get(tag);
    const rows = cached ? readOrderRows(JSON.parse(cached.json)) : changed.slice(offset, offset + size);
    if (rows.length !== size) throw new Error("Incomplete Analytics archive block");
    if (!cached) offset += size;
    orders.push(...rows);
    // Keep a separate immutable copy so edits to a rendered order cannot change the cached block.
    blocks.push(cached ?? { tag, json: JSON.stringify(packAnalyticsPage(rows)) });
  }
  if (offset !== changed.length) throw new Error("Unexpected Analytics archive rows");
  return { orders, blocks };
}
