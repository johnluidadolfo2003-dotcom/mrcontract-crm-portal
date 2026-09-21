import assert from 'node:assert/strict';
import { resolveDashboardAppointmentIdentity } from './src/lib/dashboardSchedule.ts';

assert.deepEqual(
 resolveDashboardAppointmentIdentity('Appt - DG - Jane Smith (Chimney Repair)', {}),
 { representative: 'DG', clientName: 'Jane Smith', serviceNeeded: 'Chimney Repair' },
 'canonical appointment titles must appear on the Overview'
);

assert.deepEqual(
 resolveDashboardAppointmentIdentity('Jane Smith estimate visit', {
  clientName: 'Jane Smith',
  salespersonCode: 'SB',
  serviceNeeded: 'Roof Estimate',
 }),
 { representative: 'SB', clientName: 'Jane Smith', serviceNeeded: 'Roof Estimate' },
 'appointments assigned in Calendar metadata must appear even with a noncanonical title'
);

assert.deepEqual(
 resolveDashboardAppointmentIdentity('Appointment - JS - Robert King', {
  clientName: 'Robert King',
  salespersonCode: 'JS',
  leadType: 'Direct',
 }),
 { representative: 'JS', clientName: 'Robert King', serviceNeeded: 'Direct' },
 'appointments without a parenthesized service must remain visible'
);

assert.equal(
 resolveDashboardAppointmentIdentity('Company holiday', { clientName: 'Company holiday' }),
 null,
 'unassigned non-appointment events must not appear as salesperson appointments'
);

console.log('Dashboard schedule tests passed.');
