import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const strip = source => stripTypeScriptTypes(source).replace(/^import .*\n/gm, '').replace(/^export /gm, '');

export function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const fixture = () => ({
  orders: [{
    id: 'o1', locked: true, canceled: false, created_at: '2026-11-01',
    driver1_id: 'd1', driver2_id: 'd2', truck_id: 't1', trailer_id: 'tr1',
    company_id: 'c1', booked_by_company_id: 'c2', broker_id: 'b1', booked_by: 'Dispatcher',
    original_driver1_id: 'd2', original_driver2_id: 'd1', original_truck_id: 't1', original_trailer_id: 'tr1',
    pickup_datetime: '2026-11-02', delivery_datetime: '2026-11-03',
    freight_amount: 2000.25, driver_price: 1500.50, detention: 20.10, detention_driver: 10.05,
    layover: 30, layover_driver: 15, tonu: 0, tonu_driver: 0, extra_stop: 25, extra_stop_driver: 10,
    lumper: 125, lumper_driver: 125, paid: false, invoiced: true, pod_force_complete: false,
    loaded_miles: 1000, dh_miles: 50, additional_miles: 10, mileage: null,
  }, {
    id: 'o2', locked: false, canceled: true, created_at: '2026-11-02',
    driver1_id: 'd2', truck_id: null, company_id: 'c1', booked_by: 'Former Dispatcher',
    freight_amount: 0, driver_price: 0, tonu: 150, tonu_driver: 75,
    deleted_truck_number: 'OLD', deleted_driver1_name: 'Archived Driver',
    paid: true, invoiced: true, pod_force_complete: true,
  }],
  pickup_drops: [
    { id: 'p1', order_id: 'o1', type: 'pickup', city: 'Chicago', state: 'IL', datetime: '2026-11-02', sequence_number: 1 },
    { id: 'p2', order_id: 'o1', type: 'delivery', city: 'Dallas', state: 'TX', datetime: '2026-11-03', sequence_number: 2 },
  ],
  order_files: [
    { id: 'f1', order_id: 'o1', file_category: 'POD', file_name: 'pod.pdf', file_path: 'private/pod.pdf' },
    { id: 'f2', order_id: 'o1', file_category: 'BOL', file_name: 'bol.pdf', file_path: 'private/bol.pdf' },
  ],
  order_transfers: [{ id: 'x1', order_id: 'o1', driver1_id: 'd2', miles: 100, sequence_number: 1 }],
  trucks: [{ id: 't1', truck_number: '100', company_id: 'c1' }],
  drivers: [{ id: 'd1', name: 'Driver One', company_id: 'c1' }, { id: 'd2', name: 'Driver Two', company_id: 'c1' }],
  companies: [{ id: 'c1', name: 'Company One' }, { id: 'c2', name: 'Booking Company' }],
  brokers: [{ id: 'b1', name: 'Broker', mc_number: '123', address: 'Address' }],
  trailers: [{ id: 'tr1', trailer_number: '200' }],
});

export function harness(slug, { roles = ['admin'], authenticated = true, childGate, onRead, failCount = false, readSource = read } = {}) {
  const scopedSource = strip(readSource('supabase/functions/_shared/supervisorAccess.ts'));
  let handler;
  const reads = [];
  const tables = fixture();
  const makeClient = identity => ({
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'user' } : null }, error: null }) },
    from(table) {
      const operations = [];
      const query = { table, identity, operations };
      const chain = {};
      for (const method of ['select', 'eq', 'or', 'in', 'order', 'range']) {
        chain[method] = (...args) => { operations.push([method, ...args]); return chain; };
      }
      chain.then = (resolve, reject) => (async () => {
        reads.push(query); onRead?.(query);
        if (childGate && table === 'pickup_drops') await childGate.promise;
        if (table === 'user_roles') return { data: roles.map(role => ({ role })), error: null };
        const countOnly = operations.some(([m, , options]) => m === 'select' && options?.head);
        if (failCount && countOnly) return { data: null, count: null, error: new Error('count failed') };
        let data = structuredClone(tables[table] || []);
        for (const [method, column, value] of operations) {
          if (method === 'eq') data = data.filter(row => row[column] === value);
          if (method === 'in') data = data.filter(row => value.includes(row[column]));
          if (method === 'order') data.sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (value?.ascending === false ? -1 : 1));
        }
        const count = data.length;
        const range = operations.find(([m]) => m === 'range');
        if (range) data = data.slice(range[1], range[2] + 1);
        const columns = operations.find(([m]) => m === 'select')?.[1];
        if (columns && columns !== '*') data = data.map(row => Object.fromEntries(columns.split(',').map(c => c.trim()).filter(c => c in row).map(c => [c, row[c]])));
        return { data: countOnly ? null : data, count, error: null };
      })().then(resolve, reject);
      return chain;
    },
  });
  const service = makeClient('service'); const user = makeClient('user');
  const source = strip(readSource(`supabase/functions/${slug}/index.ts`));
  vm.runInNewContext(`${scopedSource}\n${source}`, {
    createClient: (_url, key) => key === 'service' ? service : user,
    Deno: { env: { get: key => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'service' : 'anon' }, serve: fn => { handler = fn; } },
    Response, console: { log() {}, error() {} },
  });
  return {
    reads,
    async run(body = {}, withAuth = true) {
      const response = await handler(new Request('https://test.invalid', {
        method: 'POST', headers: { ...(withAuth ? { Authorization: 'Bearer fixture' } : {}), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }));
      const result = await response.json(); delete result.fetchTimeMs;
      return { status: response.status, body: result };
    },
  };
}

