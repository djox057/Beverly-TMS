import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { buildMilesChangeEmail, MILES_CHANGE_FILTER_CODE } from '../../supabase/functions/send-sms/email.ts';

const component = readFileSync(new URL('../../src/components/MilesChangeReasonDialog.tsx', import.meta.url), 'utf8');
const checkCode = component.slice(component.indexOf('export const MILES_CHANGE_THRESHOLD'), component.indexOf('/** Get SMS recipient'));
const checkContext = {};
vm.runInNewContext(stripTypeScriptTypes(checkCode.replaceAll('export ', '')), checkContext);
test('DH and loaded miles trigger independently at 10 miles in either direction', () => {
  for (const delta of [-10, 10, -35, 35]) {
    assert.equal(checkContext.checkMilesChange(100, 100 + delta, 500, 500).significant, true);
    assert.equal(checkContext.checkMilesChange(100, 100, 500, 500 + delta).significant, true);
  }
  assert.equal(checkContext.checkMilesChange(100, 109, 500, 491).significant, false);
});

test('email preserves SMS contents, escapes user input and carries hidden filter code', () => {
  const message = 'Miles changed for Internal Load #123, Broker load #456\nDH Miles Changed from 10 to 20\nReason:\n<script>test</script>\nĐorđe';
  const email = buildMilesChangeEmail(message);
  assert.equal(email.subject, message.split('\n')[0]);
  assert.ok(email.headers['List-Id'].includes(MILES_CHANGE_FILTER_CODE));
  assert.ok(email.html.includes('display:none!important'));
  assert.ok(email.html.includes('&lt;script&gt;test&lt;/script&gt;'));
  assert.ok(email.html.includes('DH Miles Changed from 10 to 20'));
  assert.ok(email.html.includes('Đorđe'));
});

async function runNotification(office, { milesChange = true, emailFails = false, authenticated = true } = {}) {
  let handler;
  const calls = [];
  const source = readFileSync(new URL('../../supabase/functions/send-sms/index.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace("await import('./email.ts')", '({ buildMilesChangeEmail })');
  const context = {
    serve: value => { handler = value; },
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'user-1' } : null }, error: null }) },
      from: () => ({ select: field => ({ eq: () => ({ single: async () => ({
        data: field === 'office' ? { office } : { phone_number: '+1 (234) 567-8900' }, error: null,
      }) }) }) }),
    }),
    Deno: { env: { get: () => 'test-value' } },
    buildMilesChangeEmail, console: { log() {}, error() {} }, Request, Response, btoa,
    fetch: async (url, options) => {
      calls.push({ url, body: options?.body ? JSON.parse(url.includes('oauth') ? '{}' : options.body) : null });
      if (url.includes('resend')) return new Response('{}', { status: emailFails ? 500 : 200 });
      return new Response(JSON.stringify(url.includes('oauth') ? { access_token: 'token' } : { id: 'sms-id' }));
    },
  };
  vm.runInNewContext(stripTypeScriptTypes(source), context);
  const response = await handler(new Request('https://example.com', {
    method: 'POST', headers: { Authorization: 'Bearer test' },
    body: JSON.stringify({ message: 'Miles changed\nReason:\nTest\nUser', phoneNumbers: ['+19999999999'], milesChange }),
  }));
  return { calls, response, result: await response.json() };
}

test('office routing uses authenticated profile and normalizes Čačak', async () => {
  for (const office of ['Čačak', 'CACAK', 'BG 1st floor', 'BG 4th floor', 'KRAGUJEVAC']) {
    const { calls, response } = await runNotification(office);
    assert.equal(response.status, 200);
    const numbers = calls.filter(c => c.url.endsWith('/sms')).map(c => c.body.to[0].phoneNumber);
    assert.ok(numbers.includes('+16304733879'));
    assert.ok(numbers.includes('+12192938764'));
    assert.ok(!numbers.includes('+19999999999'));
    assert.equal(numbers.includes('+12192938762'), office === 'BG 4th floor');
    assert.equal(numbers.includes('+15743476856'), office === 'KRAGUJEVAC');
    assert.equal(numbers.includes('+12345678900'), ['Čačak', 'CACAK', 'BG 1st floor'].includes(office));
    const emails = calls.filter(c => c.url.includes('resend'));
    assert.equal(emails.length, ['Čačak', 'CACAK'].includes(office) ? 1 : 0, JSON.stringify({office,calls}));
    if (emails.length) assert.deepEqual(emails[0].body.to, ['danny@bfprime.net']);
  }
});
test('email failure does not suppress SMS', async () => {
  const { calls, result } = await runNotification('Čačak', { emailFails: true });
  assert.equal(result.email.success, false);
  assert.equal(result.success, false);
  assert.equal(calls.filter(c => c.url.endsWith('/sms')).length, 3);
});
test('other SMS callers retain their explicit routing and do not send email', async () => {
  const { calls } = await runNotification('Čačak', { milesChange: false });
  assert.equal(calls.filter(c => c.url.includes('resend')).length, 0);
  assert.deepEqual(calls.filter(c => c.url.endsWith('/sms')).map(c => c.body.to[0].phoneNumber), ['+19999999999']);
});
test('unauthenticated requests do not send anything', async () => {
  const { calls, response } = await runNotification('Čačak', { authenticated: false });
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});
