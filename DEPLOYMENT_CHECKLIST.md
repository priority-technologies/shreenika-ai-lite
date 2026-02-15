# Deployment Checklist - Webhook Integration System

## Pre-Deployment

### ✅ Code Changes
- [x] Webhook backend infrastructure (5 modules)
- [x] Frontend UI components (3 components)
- [x] Event integration in controllers
- [x] Documentation and guides
- [x] All commits pushed locally (15 new commits)

### ✅ Database Changes
- [x] Webhook schema defined (no migration needed - MongoDB auto-creates)
- [x] WebhookLog schema defined with TTL index
- [x] Ready for first deployment

---

## Deployment Steps

### Step 1: Push to Cloud Run
```bash
cd "c:/Project/shreenika-ai-(lite)---enterprise-voice-agent-platform (1)"
git push origin main
```

Cloud Build will automatically:
- Build Node.js backend with new webhook modules
- Build React frontend with new components
- Deploy both services to asia-south1 region

### Step 2: Verify Environment Variables

**Backend (Cloud Run Service: shreenika-ai-backend)**
```
✓ FRONTEND_URL              (already set)
✓ PUBLIC_BASE_URL           (already set)
✓ JWT_SECRET                (already set)
✓ MONGODB_URI               (already set)
✓ GOOGLE_CLIENT_ID          (already set)
✓ GOOGLE_CLIENT_SECRET      (already set)
✓ GOOGLE_CLOUD_PROJECT      (already set)
✓ GOOGLE_APPLICATION_CREDENTIALS (already set)
✓ TWILIO_ACCOUNT_SID        (already set)
✓ TWILIO_AUTH_TOKEN         (already set)
✓ TWILIO_FROM_NUMBER        (already set)
✓ VOIP_ENCRYPTION_KEY       (already set)
```

**No new env vars needed for webhooks!** 🎉

### Step 3: Verify Deployment
```bash
# Check Cloud Run status
gcloud run services list --region asia-south1

# Expected output:
# shreenika-ai-backend    asia-south1    Ready    100%
# shreenika-ai-frontend   asia-south1    Ready    100%
```

### Step 4: Test Webhooks in UI
1. Go to deployed frontend: https://your-frontend-url/integrations
2. Click "New Webhook"
3. Create test webhook with:
   - **Name**: "Test Webhook"
   - **URL**: `https://webhook.site/unique-id` (use webhook.site for testing)
   - **Events**: `lead.created`
   - **Auth**: None
4. Click "Save"
5. Click "Test" button
6. Check webhook.site - should receive test payload

---

## Post-Deployment Verification

### ✅ Backend Endpoints Working
```bash
# List webhooks
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-backend-url/webhooks

# Response should show: { "total": 0, "webhooks": [] }
```

### ✅ Frontend Components Loading
- [ ] Visit `/integrations` page - should show "No webhooks yet"
- [ ] Create button visible and functional
- [ ] Modal opens when clicking create

### ✅ Events Firing
- [ ] Create new lead → webhook.created event fires
- [ ] Update lead → lead.updated event fires
- [ ] Complete call → call.completed event fires
- [ ] Create contact → contact.created event fires

Check webhook logs to verify payloads being sent.

---

## Deployment Timeline

| Step | Time | Status |
|------|------|--------|
| Push to Git | 1 min | ⏳ |
| Cloud Build | 5-10 min | ⏳ |
| Deploy Backend | 2-3 min | ⏳ |
| Deploy Frontend | 2-3 min | ⏳ |
| **Total** | **~15 min** | ⏳ |

---

## Rollback Plan (if needed)

If deployment fails:

```bash
# Revert to previous commit
git revert HEAD~3  # Revert last 3 commits

git push origin main
# Cloud Build automatically redeploys previous version
```

---

## Monitoring

After deployment, monitor:

1. **Cloud Run Logs** (for errors)
   ```bash
   gcloud run services describe shreenika-ai-backend \
     --region asia-south1
   ```

2. **Webhook Logs** (in UI at `/webhooks/{webhookId}/logs`)
   - Check for failed deliveries
   - Verify retry logic working
   - Monitor success rates

3. **Database** (MongoDB Atlas)
   - Check `webhooks` collection created
   - Check `webhooklogs` collection created
   - Monitor collection sizes

---

## Success Indicators

✅ **Deployment Successful when:**
- [ ] Cloud Run services show "Ready" status
- [ ] Frontend loads `/integrations` page
- [ ] Backend `/webhooks` endpoint accessible
- [ ] Can create webhook in UI without errors
- [ ] Test webhook sends sample payload
- [ ] Webhook logs show delivery attempts
- [ ] Creating leads/calls triggers webhook events

---

## Next Steps (Phase 3+)

After confirming this deployment is stable:

1. **HubSpot Native Connector** (when ready)
   - OAuth flow
   - Auto field mapping
   - Two-way sync

2. **Webhook Templates**
   - Pre-built for HubSpot, Salesforce, Pipedrive
   - One-click setup

3. **Advanced Features**
   - Batch webhook delivery
   - Webhook signing
   - Custom transformations UI
   - Conditional webhooks

---

## Support & Troubleshooting

### Common Issues

**Issue**: Webhooks not firing
- Check: Webhook marked as "Active"?
- Check: Events selected correctly?
- Check: URL is correct and accessible?
- Solution: View webhook logs for errors

**Issue**: 404 on `/webhooks` endpoint
- Check: Backend deployed successfully?
- Solution: Wait 5 mins after deployment, refresh page

**Issue**: Cannot create webhook
- Check: Logged in with valid token?
- Check: Browser console for errors
- Solution: Check Cloud Run logs for backend errors

**Issue**: Webhook delivery failing
- Check: Target URL accessible from Cloud Run?
- Check: Auth credentials correct?
- Check: Firewall allows requests?
- Solution: Test with webhook.site first

---

**Deployment Date**: 2026-02-15
**Status**: Ready for deployment ✅
