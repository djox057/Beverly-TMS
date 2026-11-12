import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oilChangeReminder } from '../../supabase/functions/send-document-reminders/oil-change.ts';

const truck = { source: 'BF TRUCK', miles: 158634, last_oil_change_miles: 125072 };
test('2067 uses November 6 service snapshot instead of stale truck fields', () => {
  assert.equal(oilChangeReminder({...truck, fleet_service_snapshot: {miles:158634,last_oil_change_miles:158634}}), null);
  assert.equal(oilChangeReminder(truck).statusLabel, 'OVERDUE by 5,562 mi');
});
test('oil reminders require overdue miles, with no date-based or near-due alerts', () => {
  for (const miles of [125072,151373,153072]) assert.equal(oilChangeReminder({...truck,miles}),null);
  assert.equal(oilChangeReminder({...truck,miles:153073}).statusLabel,'OVERDUE by 1 mi');
  assert.equal(oilChangeReminder({...truck,last_oil_change_miles:null}),null);
  assert.equal(oilChangeReminder({...truck,fleet_service_snapshot:{miles:158634,last_oil_change_miles:null}}),null);
  assert.equal(oilChangeReminder({...truck,source:'RYDER'}),null);
  assert.equal(oilChangeReminder({...truck,miles:NaN}),null);
});
