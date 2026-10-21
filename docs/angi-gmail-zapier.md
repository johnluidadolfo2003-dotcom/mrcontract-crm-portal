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

## Current mailbox and safe setup

The provided screenshot shows the recipient **info@mrcontract.us**. Connect that receiving mailbox in Zapier. The Gmail account connected to this chat is a different personal account, so it cannot verify those messages or the live Zap's run history.

In Gmail, use a label for verified Angi notifications, including the known `You have a new lead`, `New Customer Match`, and `You've been matched` formats. The screenshot also shows `New Opportunity` notices: check whether they contain actual customer details. A notice containing only a location or a link needs review; the CRM must not invent a customer name from it.

If the receiving account password changed, reconnect that Gmail connection in Zapier first. Test the connection without running a real customer-creation action.

Set the Zap to **New Labeled Email**, not New Labeled Conversation or New Conversation. Map the triggered **individual message ID** and that message's full body. Do not replace those fields with a Find Thread result, a shared thread ID, a snippet, or static sample customer fields.

For a Gmail thread payload, the webhook now requires `messageId` identifying the current message in `messages`; it never imports every historical message implicitly. Explicit notification batches are processed item by item and return a retryable error if any item fails. Already accepted Houzz deliveries are retained when a webhook is retried.

The parser supports modern Angi customer cards, split HTML labels, HTML-only quoted replies, full HTML fallback when plain text is truncated, and Gmail text MIME parts. Customer details found in the current Angi message take priority over stale mapped details from an older client. Parse and Sheet failures appear in webhook diagnostics with the failing step and HTTP status.

## Already-entered examples: do not import again

The user has manually entered the screenshot examples. **Do not replay those Zap runs, resend those messages to the webhook, bulk-label those conversations, or enable Gmail's “Also apply filter to matching conversations” option for them.** Configure future notifications only. Changing this code does not fetch Gmail, backfill emails, or create the screenshot leads.

Use synthetic fixtures for parser tests. Do not click a Zapier webhook Test action with a real example already entered in the CRM. Trigger tests that only read the email are different from actions that create CRM records.

HTTP 401 means the existing webhook authentication does not match. HTTP 422 means the customer's name could not be extracted or the current Gmail message was not specified; inspect the full-body mapping. HTTP 503 means processing did not complete; inspect the per-message error and Sheets connection before retrying an eligible new notification. A successful Gmail trigger alone does not confirm CRM creation: the webhook action must return success with `sheetSync.success: true`.
