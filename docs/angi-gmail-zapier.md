# Angi Gmail intake and recovery

The CRM cannot import an email that Gmail/Zapier never delivers to its webhook.

## Recommended trigger

Use the Gmail account that actually receives Angi notifications. Create a Gmail label such as `CRM Angi Leads` and apply it with a Gmail filter to verified Angi lead notifications. Match both known subjects/body formats: `You have a new lead` and `You've been matched` / `New Customer Match`. Check real emails before broadening the filter to avoid importing ordinary Angi marketing mail.

Use Gmail's current **New Labeled Email** Zapier trigger for that label. Do not use **New Conversation**, **New Thread**, or **New Labeled Conversation**: later customers can arrive as replies in the same conversation. Zapier documents that New Labeled Email detects replies and newly labeled older messages. New Email Matching Search only detects messages within its one-hour lookback, so it cannot reliably backfill messages missed during an extended outage.

Source: https://help.zapier.com/hc/en-us/articles/8495933589645-How-to-get-started-with-Gmail-on-Zapier
Source: https://help.zapier.com/hc/en-us/articles/8495919107853-Common-Problems-with-Gmail-on-Zapier

## Webhook mapping

POST JSON to `https://mrcontractportal.site/api/webhooks/angi` using the CRM's existing webhook authentication. Map dynamic Gmail fields, not sample values:

- `messageId`: the individual Gmail message ID, not the conversation/thread ID.
- `rawEmail`: the complete Body Plain; also pass `body_html` when available as a fallback.
- `subject`: the current email subject.
- `leadSource`: `Angi`.

Do not map Snippet as the full body. Different clients in a shared thread are assigned distinct CRM IDs. Identical retries retain their ID. The CRM scopes HTML and plain reply bodies to the current customer and waits for Google Sheets before returning success.

## Recover missed leads

Inspect Zap History first. Replay failed webhook actions after deploying the fix. For messages that never triggered, apply the label only to the verified missed notifications after enabling/testing the New Labeled Email trigger. Compare those customer records with the CRM before and after processing; do not relabel the entire mailbox blindly.

HTTP 401 means the existing webhook authentication does not match. HTTP 422 means the customer's name could not be extracted; provide the full email body and inspect the mapping. HTTP 503 means Sheets did not confirm saving; retry the failed run. A successful Gmail trigger alone does not confirm CRM creation: the webhook action must return success with `sheetSync.success: true`.
