# AI Voice Agent API - Enterprise Backend

## 🎯 Overview
Enterprise-grade AI voice calling system with ElevenLabs TTS, OpenAI conversation management, and Twilio integration. Built for seamless integration with external dashboards like Base 44.

## 🚀 Live API
**Production URL:** https://turbo-octo-waffle-production.up.railway.app

## 📋 Key Features
- ✅ 30+ enterprise call parameters
- ✅ Dynamic voice fetching from ElevenLabs (22+ voices)
- ✅ Real-time call status monitoring
- ✅ Emotion detection & sentiment analysis
- ✅ Webhook callbacks on call completion
- ✅ Lead qualification system
- ✅ Custom metadata tracking
- ✅ Call recording support

## 🔌 API Endpoints

### 1. GET /voices
Fetch all available ElevenLabs voices dynamically.

**Response:**
```json
{
  "success": true,
  "voices": [
    {
      "voiceId": "4tRn1lSkEn13EVTuqb0g",
      "name": "Serafina",
      "category": "professional",
      "description": "Deep, smooth American woman's voice",
      "labels": {
        "accent": "american",
        "age": "young",
        "gender": "female"
      },
      "previewUrl": "https://..."
    }
  ],
  "default": "4tRn1lSkEn13EVTuqb0g",
  "count": 22,
  "timestamp": "2025-11-25T..."
}
```

**Caching:** Responses cached for 5 minutes to reduce API calls.

---

### 2. POST /make-call
Initiate an outbound AI voice call with enterprise parameters.

**Required Parameters:**
- `to` (string) - Phone number in E.164 format (e.g., +14155551234)

**Voice Configuration (Optional):**
- `voiceId` (string, default: '4tRn1lSkEn13EVTuqb0g') - ElevenLabs voice ID
- `voiceStability` (float, 0.0-1.0, default: 0.5) - Voice consistency
- `voiceSimilarityBoost` (float, 0.0-1.0, default: 0.75) - Voice clarity
- `voiceStyle` (float, 0.0-1.0, default: 0.0) - Style exaggeration
- `speakingRate` (float, 0.5-2.0, default: 1.0) - Speech speed multiplier

**Conversation Control (Optional):**
- `message` (string) - Initial greeting/script
- `systemPrompt` (string) - AI personality/behavior instructions
- `conversationMode` (string: 'interactive' | 'scripted' | 'faq', default: 'interactive')
- `maxDuration` (integer, 1-3600, default: 600) - Max call length in seconds
- `language` (string, default: 'en-US') - Speech recognition language

**Advanced Features (Optional):**
- `enableEmotionDetection` (boolean, default: true) - Detect caller emotions
- `enableInterruptions` (boolean, default: true) - Allow caller to interrupt AI
- `sentimentAnalysis` (boolean, default: true) - Track conversation sentiment
- `recordCall` (boolean, default: false) - Save call recording
- `callbackUrl` (string) - Webhook URL for call completion
- `metadata` (object, default: {}) - Custom tracking data

**Lead Qualification (Optional):**
- `qualificationQuestions` (array) - Questions for lead scoring
- `transferNumber` (string) - Human agent transfer number
- `transferConditions` (array) - Conditions triggering transfer

**Scheduling & Integration (Optional):**
- `calendarIntegration` (boolean, default: false) - Enable appointment booking
- `crmSync` (boolean, default: false) - Sync call data to CRM
- `timezone` (string, default: 'America/Los_Angeles') - Caller timezone

**Example Request:**
```bash
curl -X POST https://turbo-octo-waffle-production.up.railway.app/make-call \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+14155551234",
    "message": "Hey there! This is Sara calling about your recent inquiry.",
    "voiceId": "4tRn1lSkEn13EVTuqb0g",
    "voiceStability": 0.6,
    "speakingRate": 1.1,
    "systemPrompt": "You are a friendly AI assistant for a marketing agency.",
    "enableEmotionDetection": true,
    "sentimentAnalysis": true,
    "metadata": {
      "campaignId": "summer-2025",
      "leadSource": "website"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "callSid": "CA1234567890abcdef",
  "to": "+14155551234",
  "conversationId": "conv_uuid-here",
  "estimatedDuration": 600,
  "voiceConfig": {
    "voiceId": "4tRn1lSkEn13EVTuqb0g",
    "voiceName": "serafina"
  },
  "timestamp": "2025-11-25T10:00:00.000Z"
}
```

---

### 3. GET /call-status/:callSid
Get real-time status of an active call.

**Example Request:**
```bash
curl https://turbo-octo-waffle-production.up.railway.app/call-status/CA1234567890abcdef
```

**Response:**
```json
{
  "success": true,
  "callSid": "CA1234567890abcdef",
  "conversationId": "conv_uuid-here",
  "status": "in-progress",
  "duration": 45,
  "currentEmotion": "interested",
  "transcript": "User: Tell me more about your services...",
  "sentiment": {
    "overall": "positive",
    "score": 0.82
  },
  "metadata": {
    "campaignId": "summer-2025"
  }
}
```

---

### 4. GET /api-docs
Full API documentation with all parameters, examples, and error codes.

**Example Request:**
```bash
curl https://turbo-octo-waffle-production.up.railway.app/api-docs
```

---

### 5. GET /health
Server health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-25T...",
  "uptime": 7528,
  "memory": {
    "rss": "69 MB",
    "heapTotal": "19 MB",
    "heapUsed": "17 MB"
  },
  "configuration": {
    "twilio": "configured",
    "openai": "configured"
  }
}
```

---

## 🔔 Webhook Callbacks

When `callbackUrl` is provided in `/make-call`, a POST request is sent on call completion:

**Webhook Payload:**
```json
{
  "callSid": "CA...",
  "conversationId": "conv_...",
  "status": "completed",
  "duration": 142,
  "transcript": "Full conversation transcript...",
  "sentiment": {
    "overall": "positive",
    "score": 0.82
  },
  "emotions": ["interested", "engaged", "satisfied"],
  "leadQualification": {
    "score": 85,
    "qualified": true
  },
  "recording": "https://api.twilio.com/...",
  "metadata": {
    "campaignId": "summer-2025"
  },
  "timestamp": "2025-11-25T..."
}
```

---

## 🛠️ Tech Stack
- **Runtime:** Node.js + Express
- **Voice AI:** ElevenLabs TTS
- **Conversation AI:** OpenAI GPT-4
- **Telephony:** Twilio
- **Hosting:** Railway
- **Real-time:** WebSockets

---

## 🔒 Security
- All API keys stored in Railway environment variables
- No credentials in repository
- E.164 phone number validation
- Parameter validation & sanitization

---

## 💰 Cost Structure

**Per Call Costs:**
- Twilio: ~$0.013/min (US calls)
- ElevenLabs: ~$0.30/1K characters
- OpenAI: ~$0.001/1K tokens (GPT-4o-mini)

**Idle Costs:** $0 (no charges when server is idle)

**Voice API:** GET /voices cached for 5 mins (negligible cost)

---

## 📁 Project Structure
```
turbo-octo-waffle/
├── ai-call-bot/
│   ├── server.js              # Main Express server
│   ├── services/
│   │   ├── voiceService.js    # ElevenLabs TTS integration
│   │   ├── conversationManager.js  # OpenAI conversation logic
│   │   ├── callTracker.js     # Active call monitoring
│   │   └── webhookService.js  # Webhook delivery
│   └── logs/                  # Server logs
├── public/
│   └── dashboard/             # Optional dashboard UI
└── README.md
```

---

## 🚀 Integration Guide

### For Dashboard Developers (like Base 44):

1. **Fetch Available Voices:**
```javascript
const voices = await fetch('https://turbo-octo-waffle-production.up.railway.app/voices')
  .then(res => res.json());

// Populate dropdown with voices.voices array
```

2. **Make a Call:**
```javascript
const response = await fetch('https://turbo-octo-waffle-production.up.railway.app/make-call', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: '+14155551234',
    message: 'Your custom message',
    voiceId: '4tRn1lSkEn13EVTuqb0g',
    voiceStability: 0.6,
    metadata: { userId: '12345' }
  })
});

const { callSid, conversationId } = await response.json();
```

3. **Monitor Call Status:**
```javascript
const status = await fetch(`https://turbo-octo-waffle-production.up.railway.app/call-status/${callSid}`)
  .then(res => res.json());

console.log(status.currentEmotion, status.transcript);
```

4. **Receive Webhooks:**
Set up an endpoint on your server to receive call completion data:
```javascript
app.post('/webhook', (req, res) => {
  const { callSid, transcript, sentiment, metadata } = req.body;
  // Process call completion data
  res.sendStatus(200);
});
```

---

## 📞 Support
For integration questions or issues, contact the repository owner.

---

## 📄 License
Private - For authorized integrators only.

---

**Built with ❤️ for enterprise voice automation**