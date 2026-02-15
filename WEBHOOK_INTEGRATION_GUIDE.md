# No-Code Webhook Integration Guide

## Overview

The Shreenika AI platform now supports webhooks for seamless integration with any custom CRM or external system. Non-technical users can configure webhooks directly in the UI without any coding.

## How It Works

### 1. User Creates Webhook in UI
Users navigate to **Integrations** page → **New Webhook** and configure:
- **Name**: e.g., "HubSpot Lead Sync"
- **URL**: `https://your-crm.com/webhooks/shreenika`
- **Events**: Select which events to send (lead.created, call.completed, etc.)
- **Authentication**: Basic Auth, Bearer Token, or API Key
- **Headers**: Custom headers (optional)

### 2. System Triggers Events Automatically
When users perform actions, webhooks fire automatically:

```
User creates lead → lead.created event → Webhook delivers to configured URL
User updates lead → lead.updated event → Webhook delivers
Call completes     → call.completed event → Webhook delivers
Agent assigned     → agent.assigned event → Webhook delivers
Contact created    → contact.created event → Webhook delivers
```

### 3. Automatic Retry & Logging
If webhook delivery fails:
- Automatic retry with exponential backoff
- Max 3 retries with 5s initial delay (5s, 10s, 20s)
- All attempts logged with request/response for debugging
- Logs auto-delete after 30 days

## Event Payloads

### 1. lead.created
```json
{
  "event": "lead.created",
  "timestamp": "2026-02-15T10:30:00Z",
  "data": {
    "_id": "...",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+91...",
    "company": "ABC Corp",
    "status": "new",
    "createdAt": "2026-02-15T10:30:00Z"
  }
}
```

### 2. lead.updated
```json
{
  "event": "lead.updated",
  "timestamp": "2026-02-15T10:35:00Z",
  "changedFields": ["status", "agentId"],
  "data": {
    "_id": "...",
    "status": "contacted",
    "agentId": "...",
    "updatedAt": "2026-02-15T10:35:00Z"
  }
}
```

### 3. call.completed
```json
{
  "event": "call.completed",
  "timestamp": "2026-02-15T10:40:00Z",
  "data": {
    "_id": "...",
    "leadId": "...",
    "agentId": "...",
    "durationSeconds": 180,
    "status": "COMPLETED",
    "recordingUrl": "https://...",
    "createdAt": "2026-02-15T10:20:00Z",
    "completedAt": "2026-02-15T10:40:00Z"
  }
}
```

### 4. agent.assigned
```json
{
  "event": "agent.assigned",
  "timestamp": "2026-02-15T10:45:00Z",
  "leadId": "...",
  "agentId": "...",
  "agent": {
    "_id": "...",
    "name": "Alice Smith",
    "email": "alice@shreenika.ai"
  }
}
```

### 5. contact.created
```json
{
  "event": "contact.created",
  "timestamp": "2026-02-15T10:50:00Z",
  "data": {
    "_id": "...",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "phone": "+91...",
    "source": "linkedin",
    "createdAt": "2026-02-15T10:50:00Z"
  }
}
```

## Authentication Types

### 1. None
No authentication required.
```
POST https://webhook-url.com/endpoint
```

### 2. Basic Auth
Username + Password encoded in Authorization header.
```
POST https://webhook-url.com/endpoint
Authorization: Basic base64(username:password)
```

### 3. Bearer Token
Token-based authentication.
```
POST https://webhook-url.com/endpoint
Authorization: Bearer your_token_here
```

### 4. API Key
Custom header with API key.
```
POST https://webhook-url.com/endpoint
X-API-Key: your_api_key_here
```
(Header name is configurable)

## Usage Examples

### Example 1: Sync Leads to HubSpot
1. Go to **Integrations** → **New Webhook**
2. **Name**: "HubSpot Lead Sync"
3. **URL**: `https://your-hubspot-app.com/api/sync-lead`
4. **Events**: `lead.created`, `lead.updated`
5. **Auth Type**: API Key
6. **API Key**: (get from HubSpot)
7. **Save** and test

Your webhook endpoint receives:
```json
{
  "event": "lead.created",
  "timestamp": "...",
  "data": { "firstName": "John", "email": "john@example.com", ... }
}
```

Your backend parses and syncs to HubSpot contacts.

### Example 2: Log Calls to Custom CRM
1. Go to **Integrations** → **New Webhook**
2. **Name**: "Custom CRM Call Logger"
3. **URL**: `https://crm.mycompany.com/webhooks/calls`
4. **Events**: `call.completed`
5. **Auth Type**: Bearer Token
6. **Token**: (get from your CRM)
7. **Save** and test

Your webhook endpoint receives call details and logs them to your database.

### Example 3: Slack Notifications (via Zapier)
1. Create Zapier integration for Shreenika AI
2. Get Zapier webhook URL
3. Go to **Integrations** → **New Webhook**
4. **Name**: "Slack Alerts"
5. **URL**: (Zapier webhook URL)
6. **Events**: `call.completed`, `agent.assigned`
7. **Save**

Now you'll get Slack notifications for every important event!

## Testing Webhooks

1. Click **Test** button on any webhook in Integrations page
2. System sends sample payload immediately
3. Check **View Logs** to see:
   - Request payload sent
   - Response status code
   - Response body
   - Any errors with retry attempts

## Debugging

If webhooks aren't working:

1. **Check Status**: Is webhook marked as "Active"?
2. **View Logs**: Click "View Logs" to see actual request/response
3. **Test Manually**: Click "Test" button to send sample payload
4. **Check URL**: Is webhook URL correct and accessible?
5. **Check Auth**: Are credentials correct?
6. **Check Firewall**: Does your server accept requests from Shreenika?

## API Endpoints

For advanced users who want to manage webhooks programmatically:

```bash
# Create webhook
POST /webhooks
Authorization: Bearer {token}
{
  "name": "My Webhook",
  "url": "https://...",
  "events": ["lead.created"],
  "auth": { "type": "none" }
}

# List webhooks
GET /webhooks
Authorization: Bearer {token}

# Get single webhook
GET /webhooks/{webhookId}
Authorization: Bearer {token}

# Update webhook
PUT /webhooks/{webhookId}
Authorization: Bearer {token}

# Delete webhook
DELETE /webhooks/{webhookId}
Authorization: Bearer {token}

# Test webhook
POST /webhooks/{webhookId}/test
Authorization: Bearer {token}

# Get webhook logs
GET /webhooks/{webhookId}/logs?limit=100&skip=0
Authorization: Bearer {token}

# Toggle webhook active/inactive
PATCH /webhooks/{webhookId}/toggle
Authorization: Bearer {token}
```

## Best Practices

1. **Test First**: Always test webhook with sample payload before going live
2. **Monitor Logs**: Check logs regularly for failed deliveries
3. **Handle Retries**: Implement idempotent endpoints (same request twice = same result)
4. **Fast Responses**: Return success quickly, do async processing in background
5. **Secure Credentials**: Never commit API keys to git, use env vars
6. **Whitelist IPs**: Consider whitelisting Shreenika's Cloud Run region (asia-south1)

## Next Steps

- **HubSpot Native Integration**: Coming in Phase 3 for direct field mapping
- **Webhook Templates**: Pre-configured templates for popular CRMs
- **Field Mapping UI**: Visual drag-and-drop field mapping
- **Custom Transformations**: JavaScript expressions for data transformation

## Support

For webhook-related issues, check:
1. Webhook logs in the Integrations page
2. Your CRM/endpoint logs
3. Firewall/network settings
4. Authentication credentials
