# Shreenika AI - Voice Engine Deployment Guide

## 🎙️ Overview

This guide covers deploying the complete Voice Agent Engine to Google Cloud Run with Twilio integration.

---

## 📋 Pre-Deployment Checklist

- [ ] Google Cloud Project created
- [ ] All APIs enabled (Speech-to-Text, Text-to-Speech, Vertex AI)
- [ ] Service account created with proper roles
- [ ] Service account key downloaded
- [ ] MongoDB Atlas cluster ready
- [ ] Twilio account with phone number
- [ ] Frontend deployed to Firebase

---

## 🔧 Environment Variables (Critical)

Add to Cloud Run environment:

```bash
# Google Cloud
GOOGLE_CLOUD_PROJECT="gen-lang-client-0348687456"
GOOGLE_APPLICATION_CREDENTIALS="/var/run/secrets/voice-key.json"
GEMINI_MODEL="gemini-1.5-flash"

# Database
MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/shreenika"

# VOIP & Twilio
TWILIO_ACCOUNT_SID="your-account-sid"
TWILIO_AUTH_TOKEN="your-auth-token"
TWILIO_FROM_NUMBER="+1234567890"
PUBLIC_BASE_URL="https://your-cloud-run-url.run.app"
VOIP_ENCRYPTION_KEY="your-32-byte-encryption-key"

# Frontend
FRONTEND_URL="https://shreenika-ai-lite-new.web.app"

# JWT
JWT_SECRET="your-jwt-secret"

# Voice Settings
VOICE_CACHE_DIR="/tmp/voice-cache"
VOICE_DEFAULT_LANGUAGE="hinglish"

# Monitoring
LOG_LEVEL="info"
ENABLE_METRICS_EXPORT="true"
```

---

## 🚀 Cloud Run Deployment

### Option 1: Automated (via Cloud Build)

```bash
# Push to main branch - builds automatically
git push origin main
```

### Option 2: Manual Deployment

```bash
# Build Docker image
gcloud builds submit --tag gcr.io/PROJECT_ID/shreenika-voice:latest

# Deploy to Cloud Run
gcloud run deploy shreenika-voice \
  --image gcr.io/PROJECT_ID/shreenika-voice:latest \
  --memory 1Gi \
  --cpu 2 \
  --concurrency 2 \
  --timeout 300 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=gen-lang-client-0348687456,..." \
  --allow-unauthenticated \
  --region asia-south1
```

---

## 🔌 Critical Cloud Run Settings

```yaml
Memory: 1GB (minimum for voice processing)
CPU: 2 vCPU (concurrent STT/TTS/LLM)
Concurrency: 2 (voice is CPU-intensive)
Timeout: 300 seconds (5 min for long calls)
Min Instances: 1
Max Instances: 10+
```

---

## 🗝️ Secret Management

Store sensitive data in Secret Manager:

```bash
# Store TTS key
gcloud secrets create google-voice-key --data-file=voice-key.json

# Reference in Cloud Run
--set-env-vars "GOOGLE_APPLICATION_CREDENTIALS=/var/run/secrets/voice-key.json"
```

---

## 📊 Monitoring & Logging

### Cloud Logging
- All logs automatically go to Cloud Logging
- View via: `Cloud Console → Logging`
- Filter: `resource.type="cloud_run_revision" AND labels.service_name="shreenika-voice"`

### Key Metrics to Monitor

```
- Voice session duration
- Average STT latency (should be < 500ms)
- Average LLM latency (should be < 1000ms)
- Average TTS latency (should be < 500ms)
- Error rate (should be < 1%)
- Session success rate (should be > 95%)
```

---

## 🧪 Post-Deployment Testing

### 1. Health Check
```bash
curl https://your-cloud-run-url.run.app/health
```

Expected:
```json
{
  "status": "OK",
  "service": "Shreenika AI Backend",
  "uptime": 120.5
}
```

### 2. Voice API Test
```bash
# Get available voices
curl https://your-cloud-run-url.run.app/voice/voices/available

# Get available languages
curl https://your-cloud-run-url.run.app/voice/languages/available
```

### 3. Make a Test Call
1. Dial your Twilio number
2. Should hear: "Hello, this is Shreenika calling you"
3. Speak naturally
4. Should get AI response within 2-3 seconds

### 4. Check Logs
```bash
gcloud logs read "resource.type=cloud_run_revision" \
  --limit=50 \
  --format=json
```

---

## 🐛 Troubleshooting

### Issue: "Call not found"
- **Cause**: Twilio webhook URL not configured
- **Fix**: Update `PUBLIC_BASE_URL` in Cloud Run env vars

### Issue: "STT service unavailable"
- **Cause**: Speech API not enabled or quota exceeded
- **Fix**: Check APIs enabled, check quotas in Cloud Console

### Issue: "Slow response times"
- **Cause**: Insufficient memory or CPU
- **Fix**: Increase Cloud Run memory to 2GB, CPU to 4

### Issue: "Connection timeout"
- **Cause**: MongoDB not reachable from Cloud Run
- **Fix**: Allow Cloud Run IPs in MongoDB Network Access

---

## 📈 Performance Optimization

### Response Time Targets

| Component | Target | How to Improve |
|-----------|--------|-----------------|
| STT | < 500ms | Use interim results, reduce audio chunk size |
| LLM | < 1000ms | Use gemini-1.5-flash, reduce prompt size |
| TTS | < 500ms | Cache common responses, use neural voices |
| Total Cycle | < 2000ms | Parallelize where possible |

### Cost Optimization

```
Google Cloud:
- STT: $0.016 per 15 min (free tier: 60 min/month)
- TTS: $4 per 1M characters
- Vertex AI: $0.00075 per 1K input tokens (flash)

Twilio:
- Inbound: $0.0075/min
- Outbound: $0.013/min

Estimate: $100-500/month for low volume, scales with usage
```

---

## 🔒 Security Checklist

- [ ] All secrets in Secret Manager (not in code)
- [ ] CORS configured correctly
- [ ] JWT validation on all protected routes
- [ ] Rate limiting enabled
- [ ] HTTPS only (Cloud Run enforces this)
- [ ] Input validation on all endpoints
- [ ] Audio data not stored long-term
- [ ] Encrypted credentials in database

---

## 📞 Twilio Webhook Configuration

In Twilio Console:

1. **Phone Number Settings**
   - Voice → Primary Handler: `https://your-url.run.app/twilio/voice`
   - Voice → Status Callback: `https://your-url.run.app/twilio/status`
   - HTTP Method: POST

2. **Primary Handler Script**
   ```xml
   <Response>
     <Connect>
       <Stream url="wss://your-url.run.app/media-stream/{CallSid}">
         <Parameter name="callSid" value="{CallSid}" />
       </Stream>
     </Connect>
   </Response>
   ```

---

## 🚀 Scaling Guide

### Stage 1: Launch (1-100 calls/day)
- Min instances: 1
- Max instances: 3
- Memory: 1GB

### Stage 2: Growth (100-1000 calls/day)
- Min instances: 2
- Max instances: 10
- Memory: 1.5GB

### Stage 3: Scale (1000+ calls/day)
- Min instances: 5
- Max instances: 50+
- Memory: 2GB
- Consider load balancer

---

## 📱 Client Integration

Frontend should:
1. Get agent's voice settings via `/voice/agent/:agentId/settings`
2. Display voice preview with `/voice/agent/:agentId/preview`
3. Update voice settings with `PUT /voice/agent/:agentId/settings`

---

## 🎓 Additional Resources

- [Google Cloud Speech API Docs](https://cloud.google.com/speech-to-text/docs)
- [Google Cloud TTS Docs](https://cloud.google.com/text-to-speech/docs)
- [Vertex AI Docs](https://cloud.google.com/vertex-ai/docs)
- [Twilio Voice Streams](https://www.twilio.com/docs/voice/media-streams)

---

## ✅ Final Verification

After deployment:

```bash
# 1. Test health
curl https://your-url.run.app/health

# 2. Check logs
gcloud logs read "resource.type=cloud_run_revision"

# 3. Make test call
# (Dial Twilio number)

# 4. Check voice session
# curl https://your-url.run.app/voice/voices/available

# 5. Monitor metrics
# Cloud Console → Monitoring → Metrics Explorer
```

**Once all checks pass, system is LIVE! 🎉**

---

## 🆘 Support

For issues:
1. Check Cloud Logging for error messages
2. Verify environment variables are set
3. Check Cloud Run resource utilization
4. Test individual components (STT, LLM, TTS separately)
5. Review error reports in voice sessions database

---

**Status: Production Ready ✅**
