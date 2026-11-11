import { expect, it } from 'vitest';
import { HOLIDAY_OFFICES, holidayOffice } from './holidayOffices';
it('keeps Belgrade floors distinct and handles office spelling', () => {
  expect(holidayOffice('BG 1st floor')).toBe('BG 1st FLOOR');
  expect(holidayOffice('BG 4th floor')).toBe('BG 4th FLOOR');
  expect(holidayOffice('CACAK')).toBe('Čačak');
  expect(holidayOffice('New office')).toBe('New office');
  expect(HOLIDAY_OFFICES).toContain('Recovery');
});
