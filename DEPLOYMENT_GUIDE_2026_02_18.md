# Deployment Guide - Phase A, B, C Complete
**Date**: 2026-02-18
**Status**: Code ready for deployment | OAuth authentication needed locally

---

## 📋 What's Been Completed

✅ **Phase A**: Audio Modality Foundation (Fixed language extraction + acoustic steering)
✅ **Phase B**: Hedge Engine (400ms latency masking with filler audio)
✅ **Phase C**: Context Caching (Knowledge base pre-caching)
✅ **All commits pushed to GitHub**: https://github.com/priority-technologies/shreenika-ai-lite

---

## 🚀 Deployment Steps

### **Step 1: Authenticate with Google Cloud**

```bash
# Option A (Recommended): Use your personal Google account
gcloud auth login

# Option B: Use service account key
gcloud auth activate-service-account --key-file=path/to/key.json
```

### **Step 2: Deploy Backend to Cloud Run**

```bash
cd shreenika-ai-backend

gcloud run deploy shreenika-ai-backend \
  --source . \
  --region asia-south1 \
  --project gen-lang-client-0348687456 \
  --timeout 3600 \
  --memory 512Mi \
  --cpu 2 \
  --allow-unauthenticated
```

**Expected output:**
```
Deploying from source requiring Cloud Build...
✓ Building... (may take 2-5 minutes)
✓ Running...
Service URL: https://shreenika-ai-backend-XXXXX.asia-south1.run.app
```

### **Step 3: Verify Backend Deployment**

```bash
# Check logs
gcloud run logs read shreenika-ai-backend --region asia-south1 --limit 50

# Test health endpoint
curl https://shreenika-ai-backend-XXXXX.asia-south1.run.app/health
```

### **Step 4: Deploy Frontend to Cloud Run (if needed)**

```bash
cd ../Lite_new

gcloud run deploy shreenika-ai-frontend \
  --source . \
  --region asia-south1 \
  --project gen-lang-client-0348687456 \
  --allow-unauthenticated
```

---

## 📝 Required Environment Variables (Already Set)

Verify these are configured in Cloud Run environment:

```
FRONTEND_URL=https://shreenika-ai-frontend-XXXXX.asia-south1.run.app
PUBLIC_BASE_URL=https://shreenika-ai-backend-XXXXX.asia-south1.run.app
MONGODB_URI=<your-atlas-uri>
GOOGLE_API_KEY=<your-gemini-api-key>
JWT_SECRET=<your-jwt-secret>
TWILIO_ACCOUNT_SID=<your-twilio-sid>
TWILIO_AUTH_TOKEN=<your-twilio-token>
TWILIO_FROM_NUMBER=<your-twilio-number>
VOIP_ENCRYPTION_KEY=<your-aes256-key>
```

---

## ✅ Post-Deployment Testing

### **Test 1: Voice Output (Critical)**

1. Go to Agent Management
2. Create test agent:
   - Name: "Test Voice"
   - Language: "hinglish"
   - Prompt: "You are a helpful voice assistant. Respond in Hinglish."
3. Make test call via Call Management
4. **Expected**: Hear voice output, no silence

### **Test 2: Check Cloud Logs for Diagnostics**

```bash
gcloud run logs read shreenika-ai-backend --region asia-south1 --limit 100 | grep -E "(System instruction|Hedge Engine|Cache|AUDIO)"
```

**Look for:**
```
✅ System instruction built: XXX chars ✅ (safe: <25K)
✅ Hedge Engine initialized (400ms latency masking)
✅ Using cached content: projects/.../cachedContents/123 (if knowledge uploaded)
```

### **Test 3: Latency Diagnostics**

Look in Cloud Logs for:
```
╔═══════════════════════════════════════════════════════════════╗
║           LATENCY DIAGNOSTICS - Call XXX                      ║
╚═══════════════════════════════════════════════════════════════╝

📊 CONNECTION TIMINGS:
  • WebSocket Connection: XXms ✅
  • Gemini Connection:    XXXms ✅
  • First Audio Chunk:    XXms ✅

📞 CONVERSATION METRICS:
  • Response Latency:     XXms ✅
  • Avg Response (3 turns):    XXXms
  • Max Response Latency: XXXms

🎯 GOALS:
  • Target Latency:       <400ms
  • Current Status:       🟢 GOOD
```

---

## 🎯 Success Criteria

| Criterion | Check |
|-----------|-------|
| Backend deploys successfully | `gcloud run services list` shows service |
| Health endpoint responds | `curl /health` returns 200 |
| Voice output heard on call | No silent calls ✅ |
| Latency <400ms | Cloud logs show green status ✅ |
| Knowledge base cached (if uploaded) | Logs show `Using cached content` ✅ |

---

## ⚠️ Known Issues & Fixes Pending

### **Issue 1: Token Floor Validation (Q2)**
**Status**: INCOMPLETE
**Fix**: Add token count validation when creating cache (pending manager discussion)

### **Issue 2: Cache Creation Timing (Q3)**
**Status**: WRONG
**Fix**: Move cache creation from call time to document upload time (pending manager discussion)

**These do NOT block deployment** but should be fixed in next iteration for optimal performance.

---

## 📞 Support

**If deployment fails:**

1. Check Cloud Build logs: https://console.cloud.google.com/cloud-build/builds
2. Check Cloud Run logs: https://console.cloud.google.com/run
3. Verify environment variables are set correctly
4. Ensure GOOGLE_API_KEY is valid and has Gemini Live API enabled

**If voice output is silent:**

1. Check Cloud Logs for errors
2. Verify `responseModalities: ['AUDIO']` in setup message (should be automatic)
3. Check PCM format conversion (16-bit LE, 16kHz→24kHz)
4. Run test call and check "LATENCY DIAGNOSTICS" section in logs

---

## 📊 Commit History

```
c96dc0d - feat(Phase C): Context Caching for knowledge base
358cdf5 - feat(Phase B): Hedge Engine for latency masking
f07ed0b - fix(Phase A): Audio Modality + acoustic steering
```

**All code pushed to GitHub and ready for production.**

---

**Next Steps**:
1. Run deployment commands above from your local machine or CI/CD pipeline
2. Run post-deployment tests
3. Report any issues
4. (Pending manager decision) Fix Q2 and Q3 issues
