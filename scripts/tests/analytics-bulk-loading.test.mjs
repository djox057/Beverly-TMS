import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deferred, harness } from './helpers/analyticsBulkHarness.mjs';

for (const slug of ['get-all-locked-orders', 'get-all-unlocked-orders']) {
  const locked = slug === 'get-all-locked-orders';
  test(`${slug}: Analytics preserves financial inputs, PODs, names, and company relations`, async () => {
    const app = harness(slug); const { status, body } = await app.run({ fields: 'analytics' });
    assert.equal(status, 200); assert.equal(body.orders.length, 1);
    const order = body.orders[0];
    assert.equal(order.id, locked ? 'o1' : 'o2');
    assert.equal(order.freight_amount, locked ? 2000.25 : 0);
    assert.equal(order.driver_price, locked ? 1500.50 : 0);
    assert.equal(order.tonu, locked ? 0 : 150);
    assert.equal(order.invoiced, true); assert.equal(order.paid, !locked);
    assert.equal(order.company.name, 'Company One');
    assert.equal(order.driver1.name, locked ? 'Driver One' : 'Driver Two');
    assert.equal(order.order_transfers.length, 0);
    assert.deepEqual(order.order_files, locked ? [{ order_id: 'o1', file_category: 'POD' }] : []);
    assert.equal(order.pickup_drops.length, locked ? 2 : 0);
    if (locked) {
      assert.equal(order.booked_by_company.name, 'Booking Company');
      assert.equal(order.lumper, 125); assert.equal(order.detention, 20.10);
      assert.equal(body.totalCount, 1); assert.equal(body.hasMore, false);
    } else assert.equal(order.deleted_driver1_name, 'Archived Driver');
  });

  test(`${slug}: Analytics starts entity lookups while child reads remain pending`, async () => {
    const gate = deferred(); const entityStarted = deferred();
    const app = harness(slug, { childGate: gate, onRead: q => { if (q.table === 'drivers') entityStarted.resolve(); } });
    const result = app.run({ fields: 'analytics' });
    try {
      await Promise.race([entityStarted.promise, new Promise((_, reject) => setTimeout(() => reject(new Error('entity reads waited for children')), 1000))]);
      assert(app.reads.some(q => q.table === 'pickup_drops'));
    } finally { gate.resolve(); await result; }
  });

  test(`${slug}: full payload keeps child-before-entity scheduling and all relationships`, async () => {
    let childrenStarted = false;
    const app = harness(slug, { onRead: q => {
      if (q.table === 'pickup_drops') childrenStarted = true;
      if (q.table === 'drivers') assert(childrenStarted);
    } });
    const { body } = await app.run({ fields: 'full' }); const order = body.orders[0];
    if (locked) {
      assert.equal(order.order_files.length, 2); assert.equal(order.order_transfers.length, 1);
      assert.equal(order.trailer.trailer_number, '200'); assert.equal(order.broker.name, 'Broker');
      assert.equal(order.original_driver1.name, 'Driver Two'); assert.equal(order.truck.company.name, 'Company One');
    } else assert.equal(order.order_files.length, 0);
  });

  test(`${slug}: supervisor-only requests retain the user/RLS client`, async () => {
    const app = harness(slug, { roles: ['supervisor', 'dispatch'] });
    await app.run({ fields: 'analytics', bookedBy: 'Dispatcher', dispatcherDriverIds: ['d1'], excludeBookedByCompanyId: 'excluded', bookedByCompanyId: 'c1' });
    for (const query of app.reads.filter(q => q.table !== 'user_roles')) assert.equal(query.identity, 'user');
    for (const query of app.reads.filter(q => q.table === 'orders')) {
      assert(query.operations.some(op => op[0] === 'or' && op[1] === 'booked_by.eq.Dispatcher,driver1_id.in.(d1)'));
      assert(query.operations.some(op => op[0] === 'eq' && op[1] === 'booked_by_company_id' && op[2] === 'c1'));
      assert(query.operations.some(op => op[0] === 'or' && op[1].includes('not.in.(excluded)')));
    }
  });

  test(`${slug}: missing or invalid authentication stops all database reads`, async () => {
    const noHeader = harness(slug); assert.equal((await noHeader.run({}, false)).status, 401); assert.equal(noHeader.reads.length, 0);
    const badUser = harness(slug, { authenticated: false }); assert.equal((await badUser.run()).status, 401); assert.equal(badUser.reads.length, 0);
  });

  test(`${slug}: count errors fail before child or entity reads`, async () => {
    const app = harness(slug, { failCount: true }); assert.equal((await app.run({ fields: 'analytics' })).status, 500);
    assert(app.reads.every(q => ['user_roles', 'orders'].includes(q.table)));
  });
}

test('archived count-only requests do not fetch relations or rows', async () => {
  const app = harness('get-all-locked-orders'); const { body } = await app.run({ countOnly: true });
  assert.equal(body.totalCount, 1); assert.equal(body.orders.length, 0);
  assert(app.reads.every(q => ['user_roles', 'orders'].includes(q.table)));
});

for (const locked of [false, true]) {
  const slug = locked ? 'get-all-locked-orders' : 'get-all-unlocked-orders';
  test(`${slug}: compact pages preserve rows and counts using one orders read per page`, async () => {
    const seed = tables => {
      const original = tables.orders.find(row => row.locked === locked);
      tables.orders.push({ ...original, id: 'extra', paid_at: null });
      original.paid_at = '2026-11-02T12:00:00Z';
    };
    const app = harness(slug, { seed, roles: ['supervisor', 'dispatch'] });
    const legacy = await harness(slug, { seed }).run({ fields: 'analytics' });
    const { status, body } = await app.run({ fields: 'analytics', orderFormat: 'columns-v1' });
    assert.equal(status, 200);
    const { keys, values } = body.orderColumns;
    const orders = Array.from({ length: body.count }, (_, i) => Object.fromEntries(keys.map((key, col) => [key, values[col][i]])));
    const { orderColumns, ...metadata } = body;
    assert.deepEqual({ ...metadata, orders }, legacy.body);
    const reads = app.reads.filter(q => q.table === 'orders');
    assert.equal(reads.length, 1);
    assert.equal(reads[0].identity, 'user');
    assert(reads[0].operations.some(([op, , options]) => op === 'select' && options?.count === 'exact' && !options.head));
    const next = await app.run({ fields: 'analytics', orderFormat: 'columns-v1', limit: 1, offset: 1 });
    assert.equal(next.body.count, 1);
    assert.equal(next.body.orders[0].id, 'extra');
    if (locked) assert.equal(next.body.totalCount, null);
    else assert.equal(next.body.expectedCount, 2);
    const failure = await harness(slug, { failCount: true }).run({ fields: 'analytics', orderFormat: 'columns-v1' });
    assert.equal(failure.status, 500);
  });
}

test('compact active orders count once across multiple pages', async () => {
  const app = harness('get-all-unlocked-orders', { seed: tables => {
    const active = tables.orders.find(row => !row.locked);
    tables.orders = Array.from({ length: 1001 }, (_, i) => ({ ...active, id: String(i) }));
  } });
  const { body } = await app.run({ fields: 'analytics', orderFormat: 'columns-v1' });
  assert.equal(body.count, 1001);
  assert.equal(body.expectedCount, 1001);
  const { keys, values } = body.orderColumns;
  assert.equal(new Set(values[keys.indexOf('id')]).size, 1001);
  const pages = app.reads.filter(query => query.table === 'orders');
  assert.equal(pages.length, 2);
  assert.equal(pages.filter(q => q.operations.some(([m, , o]) => m === 'select' && o?.count)).length, 1);
});

test('verified archive blocks reconstruct exact fresh rows across edits, deletion, and scope changes', async () => {
  const { readArchivePage } = await import('../../supabase/functions/_shared/analyticsOrderColumns.ts');
  const slug = 'get-all-locked-orders';
  const seed = tables => {
    const template = tables.orders[0];
    tables.orders = Array.from({ length: 205 }, (_, i) => ({ ...template, id: String(i), freight_amount: i }));
    tables.pickup_drops = [{ ...tables.pickup_drops[0], order_id: '154' }];
    tables.order_files = [{ ...tables.order_files[0], order_id: '154' }];
  };
  const request = async (previous = [], mutate = () => {}, userId = 'user') => {
    const options = { userId, seed: tables => { seed(tables); mutate(tables); } };
    const { body, status } = await harness(slug, options).run({
      fields: 'analytics', orderFormat: 'columns-v1', knownArchiveTags: previous.map(block => block.tag),
    });
    assert.equal(status, 200);
    const fresh = await harness(slug, options).run({ fields: 'analytics' });
    const { orders, blocks } = readArchivePage(body, previous);
    assert.deepEqual(JSON.parse(JSON.stringify(orders)), fresh.body.orders);
    return { body, blocks };
  };
  const cold = await request();
  assert.equal(cold.blocks.length, 3);
  const warm = await request(cold.blocks);
  assert.deepEqual(warm.body.orders, []);
  assert.deepEqual(warm.body.archiveTags, cold.body.archiveTags);
  for (const change of [
    t => { t.orders[154].paid = true; },
    t => { t.pickup_drops[0].city = 'Detroit'; },
    t => { t.order_files = []; },
    t => { t.orders[154].locked = false; },
    t => { t.orders.splice(154, 1); },
    t => { t.orders.push({ ...t.orders[0], id: 'new' }); },
    t => { t.drivers[0].name = 'Updated name'; },
  ]) {
    const result = await request(cold.blocks, change);
    assert.notDeepEqual(result.body.archiveTags, cold.body.archiveTags);
  }
  const edited = await request(cold.blocks, t => { t.orders[154].freight_amount = 123.45; });
  assert.equal(edited.body.orderColumns.values[0].length, 100);
  assert.equal(edited.blocks[0], cold.blocks[0]);
  assert.equal(edited.blocks[2], cold.blocks[2]);
  const switched = await request(cold.blocks, undefined, 'other-user');
  assert(switched.body.archiveTags.every(tag => !cold.body.archiveTags.includes(tag)));
  const empty = await request(cold.blocks, t => { t.orders = []; });
  assert.equal(empty.blocks.length, 0);
  assert.throws(() => readArchivePage(warm.body, []), /Incomplete/);
});

test('compact children preserve multiple stops, multiple PODs, nulls, and future columns', async () => {
  const { packAnalyticsPage, readOrderRows } = await import('../../supabase/functions/_shared/analyticsOrderColumns.ts');
  const row = { id: 'o', pickup_drops: ['pickup', 'delivery'].map(type => ({ order_id: 'o', type, city: null, state: '', datetime: null })),
    order_files: Array.from({length: 2}, () => ({order_id: 'o', file_category: 'POD'})) };
  const other = { id: 'p', pickup_drops: [], order_files: [] };
  const payload = packAnalyticsPage([row, other]);
  assert.equal(payload.compactChildren, true);
  assert.deepEqual(readOrderRows(payload), [row, other]);
  row.pickup_drops[0].extra = 'preserve';
  const future = packAnalyticsPage([row]);
  assert.equal(future.compactChildren, undefined);
  assert.deepEqual(readOrderRows(future), [row]);
});
