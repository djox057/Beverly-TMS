import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { test } from 'node:test';

const source = stripTypeScriptTypes(fs.readFileSync(new URL('../../supabase/functions/update-user-role/index.ts', import.meta.url), 'utf8'))
  .replace(/^import .*\n/, '');

async function requestRole(permissions, roles, requestedRole = 'dispatch', permissionError = null) {
  let handler;
  const writes = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) },
    from(table) {
      let operation = 'select';
      const chain = {};
      for (const method of ['select', 'eq', 'neq']) chain[method] = () => chain;
      for (const method of ['insert', 'upsert', 'delete', 'update']) chain[method] = value => {
        operation = method; writes.push({ table, operation, value }); return chain;
      };
      chain.single = async () => ({ data: { role: 'admin' }, error: null });
      chain.maybeSingle = async () => ({ data: permissions, error: permissionError });
      chain.then = (resolve, reject) => Promise.resolve({
        data: table === 'user_roles' && operation === 'select' ? roles.map(role => ({ role })) : null,
        error: null,
      }).then(resolve, reject);
      return chain;
    },
  };
  vm.runInNewContext(source, {
    createClient: () => client,
    Deno: { env: { get: () => 'test' }, serve: fn => { handler = fn; } },
    Response, console: { log() {}, error() {} },
  });
  const response = await handler(new Request('https://test.invalid', {
    method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'target', role: requestedRole }),
  }));
  return { response, body: await response.json(), writes };
}

for (const [name, permissions] of [
  ['view only', { can_view: true, can_edit: false }],
  ['edit only', { can_view: false, can_edit: true }],
  ['both', { can_view: true, can_edit: true }],
]) test(`Daily Report ${name} prevents a dispatch role change`, async () => {
  const { response, body, writes } = await requestRole(permissions, ['afterhours']);
  assert.equal(response.status, 200);
  assert.equal(body.role, 'afterhours');
  assert.equal(writes.find(w => w.operation === 'upsert').value.role, 'afterhours');
});

for (const role of ['admin','manager','supervisor','safety','accounting','maintenance','chicago_management','yard','recruiting','claims','driver']) {
  test(`${role} keeps its role with Daily Report enabled`, async () => {
    const { body } = await requestRole({ can_view: true, can_edit: true }, [role], role);
    assert.equal(body.role, role);
  });
}
for (const permissions of [null, { can_view: false, can_edit: false }]) {
  test(`Disabled or absent permissions permit normal role changes (${permissions === null ? 'absent' : 'disabled'})`, async () => {
    const { body } = await requestRole(permissions, ['afterhours']);
    assert.equal(body.role, 'dispatch');
  });
}
test('permission lookup failure stops before role writes', async () => {
  const { response, writes } = await requestRole(null, ['afterhours'], 'dispatch', new Error('Lookup failed'));
  assert.equal(response.status, 400);
  assert.equal(writes.length, 0);
});

test('an exempt account switching to dispatch with permission becomes afterhours', async () => {
  const { body } = await requestRole({ can_view: true, can_edit: false }, ['manager'], 'dispatch');
  assert.equal(body.role, 'afterhours');
});

for (const role of ['admin','manager','supervisor','safety','accounting','maintenance','chicago_management','yard','recruiting','claims','driver']) {
  for (const permissions of [{can_view:true,can_edit:false}, {can_view:false,can_edit:true}, {can_view:true,can_edit:true}]) {
    test(`afterhours can change to ${role} with permissions ${JSON.stringify(permissions)}`, async () => {
      const { response, body, writes } = await requestRole(permissions, ['afterhours'], role);
      assert.equal(response.status, 200);
      assert.equal(body.role, role);
      const roleWrites = writes.filter(w => w.table === 'user_roles');
      assert.equal(roleWrites[0].operation, 'upsert');
      assert.equal(roleWrites[0].value.role, role);
      assert.equal(roleWrites[1].operation, 'delete');
    });
  }
}
