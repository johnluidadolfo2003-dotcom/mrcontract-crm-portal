import assert from 'node:assert/strict';
import { createCalendarEvent, updateCalendarEvent } from './server/calendarService.ts';
import { includeSalesTeamGuests, isAlwaysInvitedSalesEmail } from './src/lib/appointmentGuests.ts';

const guests = includeSalesTeamGuests([
  { email: 'client@example.com', responseStatus: 'accepted' },
  { email: ' DAN@MRCONTRACT.US ', responseStatus: 'accepted' },
  { email: 'dan@mrcontract.us' },
]);
assert.deepEqual(guests.map((guest) => guest.email), ['client@example.com', 'dan@mrcontract.us', 'sam@mrcontract.us']);
assert.equal(guests[0].responseStatus, 'accepted', 'existing guests must be preserved');
assert.equal(guests[1].responseStatus, 'accepted', 'existing salesperson responses must be preserved');
assert.equal(isAlwaysInvitedSalesEmail(' SAM@MRCONTRACT.US '), true);
assert.equal(isAlwaysInvitedSalesEmail('client@example.com'), false);

const originalFetch = globalThis.fetch;
const calls: string[] = [];
const appointment = {
  summary: 'Appt - DG - Jane Client (Masonry)',
  start: { dateTime: '2026-10-02T10:00:00-04:00', timeZone: 'America/New_York' },
  end: { dateTime: '2026-10-02T11:00:00-04:00', timeZone: 'America/New_York' },
};
let writeStatus = 200;

globalThis.fetch = async (input, init) => {
  const method = init?.method || 'GET';
  calls.push(method);
  // Supply an existing appointment for the same salesperson and time if the
  // old schedule precheck is accidentally reintroduced.
  if (method === 'GET') {
    return Response.json({ items: [{ id: 'existing', ...appointment }] });
  }
  assert.ok(method === 'POST' || method === 'PUT');
  const body = JSON.parse(String(init?.body));
  assert.equal(new URL(String(input)).searchParams.get('sendUpdates'), 'all', 'Calendar must send guest invitations');
  for (const email of ['dan@mrcontract.us', 'sam@mrcontract.us']) {
    assert.equal(body.attendees.filter((guest: any) => guest.email === email).length, 1);
  }
  if (method === 'PUT') {
    assert.ok(body.attendees.some((guest: any) => guest.email === 'client@example.com'));
  }
  assert.equal(body.start.dateTime, appointment.start.dateTime);
  assert.equal(body.end.dateTime, appointment.end.dateTime);
  if (writeStatus !== 200) {
    return Response.json({ error: { message: 'Invalid event' } }, { status: writeStatus });
  }
  return Response.json({ id: `saved-${calls.length}`, ...body });
};

try {
  const first = await createCalendarEvent(appointment, 'primary', 'local-test-token');
  const second = await createCalendarEvent(appointment, 'primary', 'local-test-token');
  const updated = await updateCalendarEvent('existing', {
    ...appointment,
    attendees: [{ email: 'client@example.com' }, { email: 'DAN@MRCONTRACT.US' }],
  }, 'primary', 'local-test-token');
  assert.equal(first.success, true, 'create must allow a salesperson at an occupied time');
  assert.equal(second.success, true, 'a second appointment at the same time must also save');
  assert.equal(updated.success, true, 'editing an appointment must allow the selected time');
  assert.deepEqual(calls, ['POST', 'POST', 'PUT'], 'saving must not depend on a schedule precheck');

  writeStatus = 400;
  const failed = await createCalendarEvent(appointment, 'primary', 'local-test-token');
  assert.equal(failed.success, false, 'genuine Calendar errors must still be reported');
  assert.equal(failed.status, 400);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Appointment booking tests passed.');
