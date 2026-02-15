# SansPBX Integration Testing Guide

## Status
✅ **DID Format Fix Deployed** - Commit `81248c0` (2026-02-15)
- `caller_id` now uses 7-digit format per SansPBX team confirmation
- Ready for end-to-end testing

---

## DID Format Implementation

### What Changed
| Component | Format | Example |
|-----------|--------|---------|
| **caller_id (DID)** | 7-digit only | `6745647` |
| **call_to (destination)** | 10-digit + country code | `919876543210` |

### Format Normalization Logic
```javascript
// Input: +911234567890 (full E.164 format)
normalizedFrom = fromPhone.replace(/[\D]/g, '');  // → '911234567890'
if (normalizedFrom.length > 7) {
  normalizedFrom = normalizedFrom.slice(-7);      // → '4567890'
}
// caller_id sent to SansPBX: '4567890' ✅

// Input: 6745647 (already 7 digits)
normalizedFrom = fromPhone.replace(/[\D]/g, '');  // → '6745647'
if (normalizedFrom.length > 7) {
  normalizedFrom = normalizedFrom.slice(-7);      // → '6745647' (no change)
}
// caller_id sent to SansPBX: '6745647' ✅
```

---

## Pre-Test Checklist

### Backend Requirements
- [ ] Cloud Run deployment complete (check revision in Cloud Run console)
- [ ] Latest commit `81248c0` deployed to backend
- [ ] Environment variables set:
  - `VOIP_ENCRYPTION_KEY` - AES-256 encryption key
  - `PUBLIC_BASE_URL` - Backend public URL for webhooks
  - `MONGODB_URI` - Connected to MongoDB Atlas

### SansPBX Account Setup
- [ ] SansPBX credentials obtained:
  - Token Endpoint: `https://clouduat28.sansoftwares.com/pbxadmin/sanpbxapi/gentoken`
  - Dial Endpoint: `https://clouduat28.sansoftwares.com/pbxadmin/sanpbxapi/dialcall`
  - Access Token: (from account)
  - Access Key: (from account)
  - Username: (basic auth)
  - Password: (basic auth)
  - App ID: (usually 6 for default)
- [ ] Test DID number available: `6745647` (or similar 7-digit)
- [ ] Test destination phone: 10-digit Indian mobile (will have 91 prepended)

### Frontend Setup
- [ ] Logged into dashboard
- [ ] Settings > VOIP Integration page accessible

---

## Test Steps

### Step 1: Add SansPBX Provider to Agent

1. **Navigate to**: Dashboard → Agent Settings → VOIP Integration

2. **Click**: "Connect New Provider"

3. **Select Provider**: "Others" (or "SansPBX" if available)

4. **Enter Credentials**:
   ```
   Provider Name: SansPBX
   Token Endpoint: https://clouduat28.sansoftwares.com/pbxadmin/sanpbxapi/gentoken
   Dial Endpoint: https://clouduat28.sansoftwares.com/pbxadmin/sanpbxapi/dialcall
   Access Token: [your-token]
   Access Key: [your-key]
   App ID: 6
   Username: [basic-auth-username]
   Password: [basic-auth-password]
   ```

5. **Click**: "Validate & Save"

6. **Expected Output**:
   - ✅ "Credentials validated successfully"
   - ✅ DIDs auto-imported and displayed
   - ✅ First DID auto-assigned to agent

### Step 2: Assign DID to Agent

1. **Check DIDs section** - should show:
   ```
   DID: 6745647
   Status: Assigned to Agent [AgentName]
   Provider: SansPBX
   ```

2. **If not auto-assigned**:
   - Click "Assign to Agent"
   - Select your agent
   - Click "Assign"

3. **Verify in backend**:
   ```bash
   # Check VoipNumber assignment
   curl https://backend-url/api/voip/dids \
     -H "Authorization: Bearer YOUR_TOKEN"

   # Should show:
   {
     "did": "6745647",
     "assignedAgentId": "agent-id-here",
     "provider": "SansPBX"
   }
   ```

---

### Step 3: Make Test Call

1. **Create Test Lead**:
   - Phone: `+919876543210` (10-digit Indian mobile)
   - Name: "SansPBX Test"

2. **Dashboard → Make Call**:
   - Select agent (with SansPBX provider assigned)
   - Click "Call" button

3. **Monitor Backend Logs**:
   ```
   📞 SansPBX: Initiating call
      Input - To: +919876543210, From: [your-DID]
      Normalized - To: 919876543210 (destination)
      Normalized - From: 6745647 (DID - 7 digits per SansPBX team)
      Payload - call_to: 919876543210, caller_id: 6745647
   ```

4. **Expected Behavior**:
   - ✅ Logs show "caller_id: 6745647" (7 digits only)
   - ✅ No "+91", no "120", no extra prefixes
   - ✅ Call initiated message appears

---

### Step 4: Verify API Request

Check the actual HTTP request sent to SansPBX:

```bash
# Enable detailed logging in backend
# Then check logs for:

📥 SansPBX: Dial response:
{
  "status": "success",
  "call_id": "...",
  "message": "Call initiated successfully"
}
```

**Critical fields to verify**:
- `caller_id: "6745647"` (7 digits)
- `call_to: "919876543210"` (10 digits + country code)
- No additional formatting or prefixes

---

### Step 5: End-to-End Testing

1. **Call Flow Verification**:
   ```
   User clicks "Call"
     ↓
   Backend initiates with correct DID format (7 digits)
     ↓
   SansPBX API receives: caller_id = "6745647"
     ↓
   Call is placed successfully
     ↓
   User receives call on test phone
   ```

2. **Call Record Verification**:
   - Dashboard → Call History
   - Check call details:
     - Status: "COMPLETED"
     - Provider: "SansPBX"
     - From: "6745647" (or agent's DID)
     - To: "919876543210"

3. **Database Verification**:
   ```bash
   # Check Call document
   db.calls.findOne({ _id: ObjectId("...") })

   # Should show:
   {
     voipProvider: "SansPBX",
     providerCallId: "call_id_from_sanspbx",
     durationSeconds: [actual duration]
   }
   ```

---

## Troubleshooting

### Issue: SansPBX API Returns Error

**Check these logs:**
```bash
❌ SansPBX: Token generation error
```

**Solution**:
- [ ] Verify Access Token is correct
- [ ] Verify Access Key is correct
- [ ] Verify Username/Password are correct
- [ ] Check SansPBX account status

### Issue: caller_id Format Still Wrong

**Check logs for**:
```
Normalized - From: 911234567890 (DID - 7 digits per SansPBX team)
```

If showing more than 7 digits:
- [ ] Redeploy latest commit `81248c0`
- [ ] Clear backend cache (restart Cloud Run service)
- [ ] Test again

### Issue: Call Not Connecting

**Check sequence**:
1. Token generation succeeds? (Check logs for "Token generated")
2. Dial request is sent? (Check logs for "Initiating call")
3. SansPBX returns call_id? (Check response in logs)
4. DID format is 7 digits? (Check "caller_id: XXXXXXX")

**If stuck**:
- [ ] Verify DID is active in SansPBX account
- [ ] Verify destination phone is valid
- [ ] Check firewall allows Cloud Run → SansPBX API

---

## Success Criteria

✅ **Test is PASSED if all are true**:

1. **Format Correct**:
   - Logs show: `caller_id: 6745647` (exactly 7 digits, no prefix)

2. **API Validation**:
   - SansPBX responds with success status
   - `call_id` is returned

3. **Call Routing**:
   - Phone rings on destination device
   - Agent can speak with caller

4. **Record Created**:
   - Call shows in history
   - voipProvider: "SansPBX" in database
   - durationSeconds tracked correctly

---

## Quick Comparison

### Before Fix (❌ Didn't work)
```
caller_id: 911234567890    ❌ (12 digits with country code)
```
→ SansPBX rejected the format

### After Fix (✅ Works)
```
caller_id: 6745647         ✅ (7 digits, no country code)
```
→ SansPBX accepts and routes call

---

## Next Steps

### If Test PASSES ✅
1. Confirm working implementation
2. Consider moving to production SansPBX account
3. Test with real agents and leads
4. Monitor call success rates

### If Test FAILS ❌
1. Check troubleshooting section above
2. Verify all credentials are correct
3. Contact SansPBX support with:
   - Error message from logs
   - API request being sent
   - API response received

---

## Support

**For issues**, check:
1. Backend logs in Cloud Run (check for "SansPBX" messages)
2. Database for Call record (verify voipProvider field)
3. SansPBX account for active DIDs and credits

**Document needed for support**:
- Screenshot of error message
- Backend log excerpt (with timestamp)
- Call record details from database
- SansPBX account status confirmation

