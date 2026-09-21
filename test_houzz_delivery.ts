import {
  dispatchLeadToHouzz,
  evaluateHouzzResponse,
  sanitizeErrorMessage,
  getHouzzDestinationInfo,
  constructHouzzPayload,
} from './server/houzzDelivery.ts';

async function runTests() {
  console.log('====================================================');
  console.log('Running Houzz Lead-Delivery & Error Handling Tests');
  console.log('====================================================');

  const testPayload = {
    clientName: 'Jane Smith',
    clientPhone: '555-0199',
    clientEmail: 'jane@example.com',
    address: '123 Oak St, Pittsburgh, PA 15212',
    leadSource: 'Angi',
    serviceNeeded: 'Brick Chimney Repair',
    notes: 'Urgent repair needed',
  };

  const webhookUrlHouzz = 'https://houzz.com/api/v1/leads';
  const webhookUrlAutomation = 'https://hooks.zapier.com/hooks/catch/12345/abcde';

  // 1. Test Destination Label Identification (Requirement 9)
  console.log('\n[Test 1] Destination Label Resolution');
  const destHouzz = getHouzzDestinationInfo(webhookUrlHouzz);
  if (destHouzz.displayName !== 'Houzz Pro') throw new Error('Expected Houzz Pro destination');

  const destAutomation = getHouzzDestinationInfo(webhookUrlAutomation);
  if (destAutomation.displayName !== 'Zapier') throw new Error('Expected Zapier destination');
  console.log('✓ Destination label resolution passed.');

  // 2. Test Payload Construction (Requirement 5)
  console.log('\n[Test 2] Outgoing Payload Construction');
  const builtPayload = constructHouzzPayload('lead_test_123', testPayload);
  if (builtPayload.firstName !== 'Jane' || builtPayload.lastName !== 'Smith') {
    throw new Error(`First/Last name splitting failed: ${builtPayload.firstName} ${builtPayload.lastName}`);
  }
  if (builtPayload.phone !== '555-0199' || builtPayload.email !== 'jane@example.com') {
    throw new Error('Phone/Email mapping failed');
  }
  if (builtPayload.serviceNeeded !== 'Brick Chimney Repair' || builtPayload.leadId !== 'lead_test_123') {
    throw new Error('serviceNeeded or leadId mapping failed');
  }
  const canonicalContainers = ['lead', 'data', 'payload', 'client', 'contact', 'crmLead'];
  for (const container of canonicalContainers) {
    const nested = builtPayload[container];
    if (!nested || nested.clientName !== testPayload.clientName) {
      throw new Error(`${container}.clientName did not preserve the CRM name`);
    }
    if (
      nested.clientPhone !== testPayload.clientPhone ||
      nested.clientEmail !== testPayload.clientEmail ||
      nested.address !== testPayload.address ||
      nested.serviceNeeded !== testPayload.serviceNeeded ||
      nested.notes !== testPayload.notes
    ) {
      throw new Error(`${container} did not preserve the complete CRM lead information`);
    }
  }
  if (
    builtPayload.houzzClientName !== testPayload.clientName ||
    builtPayload.authoritativeClientName !== testPayload.clientName ||
    builtPayload.payloadVersion !== 'crm-houzz-v3'
  ) {
    throw new Error('Authoritative Houzz name or payload version is incorrect');
  }
  console.log('✓ Payload construction and canonical field parity verified.');

  // 3. Test Sanitization (Requirement 3 & 6)
  console.log('\n[Test 3] Secret Sanitization');
  const secretLeak = 'Error on https://hooks.zapier.com/hooks/catch/123/456?token=secret123 Authorization: Bearer abcdef';
  const sanitized = sanitizeErrorMessage(secretLeak);
  if (sanitized.includes('secret123') || sanitized.includes('abcdef')) {
    throw new Error(`Secrets leaked in sanitized error: ${sanitized}`);
  }
  console.log('✓ Secret sanitization verified:', sanitized);

  // 4. Test 201 Accepted Response -> Success Activity (Requirement 10)
  console.log('\n[Test 4] 201 Accepted Response -> Success Activity');
  const mockFetch201 = async () => new Response(JSON.stringify({ result: 'accepted' }), { status: 201 });
  const res201 = await dispatchLeadToHouzz({
    leadId: 'test_lead_201',
    payload: testPayload,
    webhookUrl: webhookUrlHouzz,
    customFetch: mockFetch201 as any,
  });

  if (!res201.success || res201.activityStatus !== 'Created in Houzz Pro' || res201.statusCode !== 201) {
    throw new Error(`201 test failed: ${JSON.stringify(res201)}`);
  }
  console.log('✓ 201 Accepted response passed with activity status:', res201.activityStatus);

  // 5. Test 200 with Rejected JSON Body -> Failed Activity (Requirement 2 & 10)
  console.log('\n[Test 5] 200 Response with Rejected JSON -> Failed Activity');
  const mockFetch200Error = async () => new Response(JSON.stringify({ success: false, error: 'Duplicate lead' }), { status: 200 });
  const res200Err = await dispatchLeadToHouzz({
    leadId: 'test_lead_200_err',
    payload: testPayload,
    webhookUrl: webhookUrlAutomation,
    customFetch: mockFetch200Error as any,
  });

  if (res200Err.success || res200Err.activityStatus !== 'Failed to send to Zapier' || !res200Err.error?.includes('Duplicate lead')) {
    throw new Error(`200 rejected body test failed: ${JSON.stringify(res200Err)}`);
  }
  console.log('✓ 200 Rejected body test passed with activity status:', res200Err.activityStatus);

  // 6. Test 400 Response -> Failed Activity with Safe Message (Requirement 10)
  console.log('\n[Test 6] 400 Response -> Failed Activity with Safe Message');
  const mockFetch400 = async () => new Response(JSON.stringify({ error: 'Invalid client phone number' }), { status: 400 });
  const res400 = await dispatchLeadToHouzz({
    leadId: 'test_lead_400',
    payload: testPayload,
    webhookUrl: webhookUrlHouzz,
    customFetch: mockFetch400 as any,
  });

  if (res400.success || res400.activityStatus !== 'Failed to send to Houzz Pro' || res400.statusCode !== 400 || !res400.error?.includes('Invalid client phone number')) {
    throw new Error(`400 test failed: ${JSON.stringify(res400)}`);
  }
  console.log('✓ 400 response test passed with activity status:', res400.activityStatus);

  // 7. Test 500 Response -> Failed Activity (Requirement 10)
  console.log('\n[Test 7] 500 Response -> Failed Activity');
  const mockFetch500 = async () => new Response('Internal Server Error', { status: 500 });
  const res500 = await dispatchLeadToHouzz({
    leadId: 'test_lead_500',
    payload: testPayload,
    webhookUrl: webhookUrlHouzz,
    customFetch: mockFetch500 as any,
  });

  if (res500.success || res500.activityStatus !== 'Failed to send to Houzz Pro' || res500.statusCode !== 500) {
    throw new Error(`500 test failed: ${JSON.stringify(res500)}`);
  }
  console.log('✓ 500 response test passed with activity status:', res500.activityStatus);

  // 8. Test Timeout -> Failed Activity (Requirement 7 & 10)
  console.log('\n[Test 8] Timeout -> Failed Activity');
  const mockFetchTimeout = async (_url: string, opts: any) => {
    return new Promise<Response>((_, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  };

  const resTimeout = await dispatchLeadToHouzz({
    leadId: 'test_lead_timeout',
    payload: testPayload,
    webhookUrl: webhookUrlHouzz,
    customFetch: mockFetchTimeout as any,
    timeoutMs: 100, // Short timeout for unit test speed
  });

  if (resTimeout.success || resTimeout.activityStatus !== 'Failed to send to Houzz Pro' || !resTimeout.error?.includes('timed out')) {
    throw new Error(`Timeout test failed: ${JSON.stringify(resTimeout)}`);
  }
  console.log('✓ Timeout test passed with error message:', resTimeout.error);

  // 9. Test Network Error -> Failed Activity (Requirement 10)
  console.log('\n[Test 9] Network Error -> Failed Activity');
  const mockFetchNetworkError = async () => {
    throw new TypeError('Failed to fetch (DNS resolution error)');
  };

  const resNetErr = await dispatchLeadToHouzz({
    leadId: 'test_lead_net_err',
    payload: testPayload,
    webhookUrl: webhookUrlHouzz,
    customFetch: mockFetchNetworkError as any,
  });

  if (resNetErr.success || resNetErr.activityStatus !== 'Failed to send to Houzz Pro' || !resNetErr.error?.includes('Failed to fetch')) {
    throw new Error(`Network error test failed: ${JSON.stringify(resNetErr)}`);
  }
  console.log('✓ Network error test passed with error message:', resNetErr.error);

  // 10. Test Missing Webhook URL Configuration Error (Requirement 9)
  console.log('\n[Test 10] Missing Webhook URL Config Error');
  const resNoUrl = await dispatchLeadToHouzz({
    leadId: 'test_lead_no_url',
    payload: testPayload,
    webhookUrl: '',
  });

  if (resNoUrl.success || !resNoUrl.error?.includes('not configured')) {
    throw new Error(`Missing webhook URL test failed: ${JSON.stringify(resNoUrl)}`);
  }
  console.log('✓ Missing Webhook URL test passed with clear error:', resNoUrl.error);

  console.log('\n====================================================');
  console.log('ALL HOUZZ LEAD DELIVERY TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('TEST ERROR:', err);
  process.exit(1);
});
