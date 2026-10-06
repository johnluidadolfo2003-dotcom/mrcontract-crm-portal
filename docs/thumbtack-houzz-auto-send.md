# Thumbtack automatic Houzz creation

Incoming Thumbtack webhooks still wait for staff to review the lead. Save the client details after completing the name, phone or email, address, and service. The server then submits the saved record automatically. A separate Create button is no longer needed.

The lead drawer refreshes delivery status every three seconds while open. New Leads retains its existing five-second refresh. Statuses distinguish sending, Zapier acceptance (awaiting Houzz confirmation), confirmed creation, and failure. Failed submissions can be retried by saving complete details again or using the Retry action. Saving an accepted or created lead does not submit it again.

## Confirm creation from Zapier

A successful Catch Hook response only proves receipt by Zapier. To display **Created in Houzz Pro**, the existing result callback must run after the Houzz Pro creation step succeeds:

- Set `HOUZZ_CALLBACK_SECRET` in the CRM server environment.
- Add a POST action to `https://mrcontractportal.site/api/integrations/houzz-result` after the Houzz creation action.
- Use `Content-Type: application/json` and `x-houzz-callback-secret` matching that environment value.
- Send the dynamic `leadId` from the incoming webhook, not a sample lead ID:

```json
{"leadId":"<dynamic incoming leadId>","success":true}
```

For a handled downstream failure, send `success: false` with a concise `error` field instead. Without the callback, a Zapier-accepted lead remains Awaiting Houzz rather than being incorrectly marked as created.

This change uses the repository's existing JSON metadata storage; it does not implement the separately discussed permanent-storage migration. Those files still require persistent storage to survive a server redeployment.
