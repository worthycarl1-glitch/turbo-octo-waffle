# AI Voice Agent API - Enterprise Backend

## 🎯 Overview
Enterprise-grade AI voice calling system powered by **ElevenLabs Conversational AI** platform. Achieves sub-100ms latency and 50% cost reduction compared to traditional TTS pipelines. Built for seamless integration with external dashboards.

## 🚀 Live API
**Production URL:** https://turbo-octo-waffle-production.up.railway.app

## ⚡ Architecture

### Recommended: ElevenLabs Conversational AI (Agent Mode)
```
Twilio Call → ElevenLabs Conversational AI Agent → Twilio
Latency: <100ms | Cost: ~$0.10/min
```

### Legacy: Voice-based Mode (OpenAI + TTS)
```
Twilio Call → STT → OpenAI GPT → ElevenLabs TTS → Twilio
Latency: ~2.5s | Cost: ~$0.22/min
```

## 📋 Key Features
- ✅ **Sub-100ms latency** with ElevenLabs Conversational AI agents
- ✅ **50% cost reduction** compared to legacy architecture
- ✅ Real-time call status monitoring
- ✅ Webhook callbacks on call completion
- ✅ Call recording support
- ✅ Custom metadata tracking
- ✅ Backward compatible with legacy voice-based mode

## 🔌 API Endpoints

### 1. GET /agents (NEW - Recommended)
Fetch available ElevenLabs Conversational AI agents.

**Response:**
```json
{
  "success": true,
  "agents": [
    {
      "agentId": "agent_abc123",
      "name": "Sales Assistant",
      "voiceId": "4tRn1lSkEn13EVTuqb0g",
      "voiceName": "Serafina",
      "language": "en",
      "description": "AI assistant for sales calls"
    }
  ],
  "defaultAgentId": "agent_abc123",
  "count": 1,
  "timestamp": "2025-11-25T..."
}
```

**Caching:** Responses cached for 5 minutes.

---

### 2. POST /make-call
Initiate an outbound AI voice call. Uses ElevenLabs Conversational AI when `agentId` is provided (recommended).

**Required Parameters:**
- `to` (string) - Phone number in E.164 format (e.g., +14155551234)

**Agent Configuration (Recommended):**
- `agentId` (string) - ElevenLabs Conversational AI agent ID. When provided, uses agent mode with sub-100ms latency.

**Advanced Features (Optional):**
- `maxDuration` (integer, 1-3600, default: 600) - Max call length in seconds
- `recordCall` (boolean, default: false) - Save call recording
- `callbackUrl` (string) - Webhook URL for call completion
- `metadata` (object, default: {}) - Custom tracking data

**Example Request (Agent Mode - Recommended):**
```bash
curl -X POST https://turbo-octo-waffle-production.up.railway.app/make-call \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+14155551234",
    "agentId": "agent_abc123",
    "metadata": {
      "campaignId": "summer-2025",
      "leadSource": "website"
    }
  }'
```

**Response (Agent Mode):**
```json
{
  "success": true,
  "callSid": "CA1234567890abcdef",
  "to": "+14155551234",
  "conversationId": "conv_uuid-here",
  "agentId": "agent_abc123",
  "mode": "agent",
  "estimatedDuration": 600,
  "timestamp": "2025-11-25T10:00:00.000Z"
}
```

<details>
<summary><strong>Legacy Voice Configuration (Deprecated)</strong></summary>

When no `agentId` is provided, falls back to legacy mode with these parameters:

- `voiceId` (string) - ElevenLabs voice ID
- `voiceStability` (float, 0.0-1.0) - Voice consistency
- `voiceSimilarityBoost` (float, 0.0-1.0) - Voice clarity
- `message` (string) - Initial greeting/script
- `systemPrompt` (string) - AI personality/behavior instructions
- `conversationMode` (string: 'interactive' | 'scripted' | 'faq')

**Note:** Legacy mode has higher latency (~2.5s) and cost (~$0.22/min). Migrate to agent mode for better performance.

</details>

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

### 4. GET /voices (Legacy)
Fetch available voices for legacy mode.

> **Note:** For agent mode, configure voices in the ElevenLabs agent dashboard instead.

---

### 5. GET /api-docs
Full API documentation with all parameters, examples, and error codes.

---

### 6. GET /health
Server health check endpoint.

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
- **Voice AI:** ElevenLabs Conversational AI
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

### Agent Mode (Recommended)
| Service | Cost |
|---------|------|
| ElevenLabs Conversational AI | ~$0.10/min |
| Twilio | ~$0.013/min |
| **Total** | **~$0.11/min** |

### Legacy Mode
| Service | Cost |
|---------|------|
| ElevenLabs TTS | ~$0.30/1K chars (~$0.15/min) |
| OpenAI GPT | ~$0.001/1K tokens |
| Twilio | ~$0.013/min |
| **Total** | **~$0.22/min** |

**Cost Savings with Agent Mode: ~50%**

---

## 📁 Project Structure
```
turbo-octo-waffle/
├── ai-call-bot/
│   ├── server.js                        # Main Express server
│   ├── services/
│   │   ├── elevenLabsAgentService.js    # ElevenLabs Conversational AI (NEW)
│   │   ├── voiceService.js              # Legacy TTS integration (deprecated)
│   │   ├── conversationManager.js       # Legacy OpenAI logic (deprecated)
│   │   ├── callTracker.js               # Active call monitoring
│   │   └── webhookService.js            # Webhook delivery
│   └── logs/                            # Server logs
├── public/
│   └── dashboard/                       # Optional dashboard UI
└── README.md
```

---

## 🚀 Integration Guide

### Quick Start (Agent Mode)

1. **Create an Agent in ElevenLabs:**
   - Go to [ElevenLabs Conversational AI](https://elevenlabs.io/conversational-ai)
   - Create a new agent with your desired voice and system prompt
   - Copy the agent ID

2. **Fetch Available Agents:**
```javascript
const agents = await fetch('https://turbo-octo-waffle-production.up.railway.app/agents')
  .then(res => res.json());

// Use agents.agents array to populate dropdown
```

3. **Make a Call:**
```javascript
const response = await fetch('https://turbo-octo-waffle-production.up.railway.app/make-call', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: '+14155551234',
    agentId: 'agent_abc123',  // Your ElevenLabs agent ID
    metadata: { userId: '12345' }
  })
});

const { callSid, conversationId, mode } = await response.json();
console.log(`Call initiated in ${mode} mode`);  // "agent"
```

4. **Monitor Call Status:**
```javascript
const status = await fetch(`https://turbo-octo-waffle-production.up.railway.app/call-status/${callSid}`)
  .then(res => res.json());

console.log(status.transcript);
```

5. **Receive Webhooks:**
```javascript
app.post('/webhook', (req, res) => {
  const { callSid, transcript, sentiment, metadata } = req.body;
  // Process call completion data
  res.sendStatus(200);
});
```

---

## 🎯 Dynamic Prompt Customization

Customize agent behavior per call without changing agent configuration in ElevenLabs dashboard.

### Basic Usage

```javascript
POST /make-call
{
  "to": "+14155551234",
  "agentId": "agent_abc123",
  "customPrompt": "You are calling {{customer_name}} about {{reason}}. Be friendly.",
  "firstMessage": "Hi {{customer_name}}!",
  "dynamicVariables": {
    "customer_name": "John Smith",
    "reason": "appointment scheduling",
    "available_times": "2pm, 3pm, 4pm"
  }
}
```

### Features

- **Override system prompt per call** - Customize agent behavior dynamically
- **Override first message per call** - Personalize the greeting
- **Pass dynamic variables** - Inject customer data, context, etc.
- **Variable interpolation** - Use `{{variable_name}}` syntax in prompts
- **Override language per call** - `overrideLanguage` parameter
- **Override voice per call** - `overrideVoiceId` parameter

### Use Cases

| Use Case | Example Variables |
|----------|-------------------|
| **Appointment Scheduling** | `customer_name`, `available_times`, `service_type` |
| **Payment Reminders** | `customer_name`, `amount`, `due_date` |
| **Lead Qualification** | `customer_name`, `product`, `company` |
| **Campaign Messaging** | `offer_details`, `expiry_date` |

### Example: Appointment Scheduling

```javascript
{
  "to": "+15551234567",
  "agentId": "agent_scheduler",
  "customPrompt": "Schedule appointment for {{customer_name}}. Available: {{times}}. Confirm and provide calendar invite.",
  "firstMessage": "Hi {{customer_name}}! Let's find a time for your {{service}}.",
  "dynamicVariables": {
    "customer_name": "Jane Doe",
    "service": "product demo",
    "times": "Mon 2pm, Tue 10am, Wed 3pm"
  }
}
```

### Example: Payment Reminder

```javascript
{
  "to": "+15551234567",
  "agentId": "agent_billing",
  "customPrompt": "Remind {{customer_name}} about {{amount}} payment due {{date}}. Offer payment link.",
  "firstMessage": "Hi {{customer_name}}, this is a friendly reminder about your upcoming payment.",
  "dynamicVariables": {
    "customer_name": "Bob Smith",
    "amount": "$99.99",
    "date": "Dec 1st"
  }
}
```

### Benefits

- ✅ **CRM Control** - Configure scripts from your CRM UI
- ✅ **Personalization** - Each call customized per customer
- ✅ **No Agent Duplication** - One agent, many configurations
- ✅ **Dynamic Workflows** - Pass real-time data (calendar, CRM)
- ✅ **A/B Testing** - Test different prompts without agent changes
- ✅ **Multi-tenant** - Same agent, different customer contexts

### Backward Compatibility

- ✅ Existing calls without customization work unchanged
- ✅ All customization parameters are optional
- ✅ Falls back to agent defaults from ElevenLabs dashboard

---

## 📖 Migration Guide

### From Legacy to Agent Mode

1. **Create an agent** in ElevenLabs dashboard:
   - Configure voice settings
   - Set system prompt
   - Define first message

2. **Update environment variables:**
```bash
ELEVENLABS_AGENT_ID=your_agent_id_here
```

3. **Update API calls:**
```diff
// Before (Legacy)
- {
-   "to": "+14155551234",
-   "voiceId": "4tRn1lSkEn13EVTuqb0g",
-   "message": "Hello!",
-   "systemPrompt": "You are a helpful assistant."
- }

// After (Agent Mode)
+ {
+   "to": "+14155551234",
+   "agentId": "agent_abc123"
+ }
```

4. **Benefits after migration:**
   - ⚡ Latency: 2.5s → <100ms (96% faster)
   - 💰 Cost: $0.22/min → $0.10/min (55% savings)
   - 🔧 Simpler code: No OpenAI dependency needed

---

## 📞 Support
For integration questions or issues, contact the repository owner.

---

## 📄 License
Private - For authorized integrators only.

---

**Built with ❤️ for enterprise voice automation | Powered by ElevenLabs Conversational AI**