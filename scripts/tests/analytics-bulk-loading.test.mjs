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
