# Base44 CRM Integration Guide

Complete integration guide for connecting the AI Voice Agent system with Base44 CRM for appointment scheduling and call tracking.

---

## Overview

This integration connects three systems:
- **Twilio**: Call infrastructure (provides callSid, duration, status)
- **ElevenLabs**: Conversational AI (provides outcome, transcript, tool calls)  
- **Base44 CRM**: Customer relationship management (receives combined data)

**Railway acts as the middleware** connecting all three systems.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CALL FLOW OVERVIEW                        │
└─────────────────────────────────────────────────────────────┘

1. Base44 Dashboard → POST /make-call (with contact_id, agent_id)
                    ↓
2. Railway → ElevenLabs API (initiate outbound call)
                    ↓
3. ElevenLabs → Twilio (places actual call)
                    ↓
4. During Call → ElevenLabs Agent Tools:
   - checkAvailability → Railway → Base44
   - bookAppointment → Railway → Base44
                    ↓
5. Call Ends → Twilio → Railway /twilio-status-callback
                    ↓
6. Railway analyzes conversation → POST to Base44 /trackAICallDuration
```

---

## Setup Instructions

### 1. Configure ElevenLabs Agent Tools

In the ElevenLabs Conversational AI dashboard, configure your agent with these tools:

#### Tool 1: checkAvailability

```json
{
  "name": "checkAvailability",
  "description": "Check available appointment time slots for the closer",
  "parameters": {
    "type": "object",
    "properties": {
      "contact_id": { 
        "type": "string", 
        "description": "Contact ID from dynamic variables" 
      },
      "agent_id": { 
        "type": "string", 
        "description": "Closer profile ID from dynamic variables" 
      },
      "preferred_date": { 
        "type": "string", 
        "description": "Date in YYYY-MM-DD format" 
      },
      "address": { 
        "type": "string", 
        "description": "Contact address for timezone" 
      }
    },
    "required": ["contact_id", "agent_id", "preferred_date"]
  },
  "handler": {
    "type": "webhook",
    "url": "https://your-railway-app.up.railway.app/elevenlabs-tools/check-availability",
    "method": "POST"
  }
}
```

**Note**: Replace `your-railway-app.up.railway.app` with your actual Railway domain.

#### Tool 2: bookAppointment

```json
{
  "name": "bookAppointment",
  "description": "Book confirmed appointment after customer agrees to time slot",
  "parameters": {
    "type": "object",
    "properties": {
      "contact_id": { "type": "string" },
      "agent_id": { "type": "string" },
      "appointment_date": { "type": "string", "description": "YYYY-MM-DD" },
      "start_time": { "type": "string", "description": "HH:mm format" },
      "end_time": { "type": "string", "description": "HH:mm format" },
      "customer_name": { "type": "string" },
      "customer_phone": { "type": "string" },
      "customer_address": { "type": "string" },
      "meeting_purpose": { "type": "string" }
    },
    "required": ["contact_id", "agent_id", "appointment_date", "start_time", "end_time"]
  },
  "handler": {
    "type": "webhook",
    "url": "https://your-railway-app.up.railway.app/elevenlabs-tools/book-appointment",
    "method": "POST"
  }
}
```

### 2. Configure Twilio Status Callback in ElevenLabs

In the ElevenLabs dashboard under "Phone Numbers":

1. Select your imported Twilio phone number
2. Configure the **Status Callback URL**:
   ```
   https://your-railway-app.up.railway.app/twilio-status-callback
   ```
3. Enable callback for **Call Completed** event

This ensures that when calls complete, Twilio notifies our Railway backend.

### 3. Making Calls from Base44

When initiating a call from Base44 dashboard, use the `/make-call` endpoint with these parameters:

```javascript
POST https://your-railway-app.up.railway.app/make-call

{
  "to": "+14155551234",
  "agentId": "agent_abc123",
  "dynamicVariables": {
    "contact_id": "base44_contact_123",
    "agent_id": "base44_agent_456",
    "customer_name": "John Smith",
    "customer_address": "123 Main St, San Francisco, CA"
  },
  "metadata": {
    "campaignId": "appointments-dec-2025"
  }
}
```

**Critical Fields**:
- `dynamicVariables.contact_id`: Base44 contact ID (used for tracking)
- `dynamicVariables.agent_id`: Base44 agent/closer ID (used for appointment booking)
- `dynamicVariables.customer_name`: Customer name for personalization
- `dynamicVariables.customer_address`: Customer address for timezone detection

The system automatically passes `contact_id` and `agent_id` to the ElevenLabs agent tools.

---

## API Endpoints

### Railway Proxy Endpoints

#### POST /elevenlabs-tools/check-availability

Proxies ElevenLabs agent tool calls to Base44.

**Receives from ElevenLabs:**
```json
{
  "contact_id": "base44_contact_123",
  "agent_id": "base44_agent_456",
  "preferred_date": "2025-12-30",
  "address": "123 Main St, San Francisco, CA"
}
```

**Forwards to Base44:**
```
POST https://simpleappointmentsinc.com/api/functions/checkCloserAvailability
```

**Returns to ElevenLabs:**
```json
{
  "success": true,
  "available_slots": [
    { "start": "09:00", "end": "10:00" },
    { "start": "14:00", "end": "15:00" }
  ],
  "timezone": "America/Los_Angeles"
}
```

#### POST /elevenlabs-tools/book-appointment

Proxies appointment booking requests to Base44.

**Receives from ElevenLabs:**
```json
{
  "contact_id": "base44_contact_123",
  "agent_id": "base44_agent_456",
  "appointment_date": "2025-12-30",
  "start_time": "14:00",
  "end_time": "15:00",
  "customer_name": "John Smith",
  "customer_phone": "+14155551234",
  "customer_address": "123 Main St, San Francisco, CA",
  "meeting_purpose": "Product demo"
}
```

**Forwards to Base44:**
```
POST https://simpleappointmentsinc.com/api/functions/handleVoiceBooking
```

**Returns to ElevenLabs:**
```json
{
  "success": true,
  "appointment_id": "appt_789",
  "message": "Appointment confirmed"
}
```

#### POST /twilio-status-callback

Receives Twilio call completion events, analyzes conversation, and sends data to Base44.

**Receives from Twilio:**
```
CallSid=CA1234567890abcdef
CallDuration=142
CallStatus=completed
```

**Analyzes Conversation Data:**
- Checks if appointment was booked (via tool calls)
- Analyzes transcript for keywords:
  - "not interested" → `not_interested`
  - "decline" → `declined`
  - "call back" / "follow up" → `follow_up_scheduled`
- Extracts follow-up dates from transcript

**Sends to Base44:**
```javascript
POST https://simpleappointmentsinc.com/api/functions/trackAICallDuration

{
  "callSid": "CA1234567890abcdef",
  "duration": 142,
  "status": "completed",
  "outcome": "appointment_booked",
  "followUpDate": null
}
```

---

## Outcome Detection Logic

The system analyzes ElevenLabs conversation data to determine outcomes:

### 1. Appointment Booked
- **Trigger**: `bookAppointment` tool called successfully
- **Outcome**: `appointment_booked`
- **Base44 Action**: Contact marked as appointment scheduled

### 2. Not Interested
- **Trigger**: Transcript contains "not interested", "no thanks", "don't want"
- **Outcome**: `not_interested`
- **Base44 Action**: Contact marked as not interested

### 3. Declined
- **Trigger**: Transcript contains "decline", "no thank you"
- **Outcome**: `declined`
- **Base44 Action**: Contact marked as declined

### 4. Follow-Up Scheduled
- **Trigger**: Transcript contains "call back", "follow up", "try again later"
- **Outcome**: `follow_up_scheduled`
- **Base44 Action**: Contact scheduled for follow-up call
- **Follow-Up Date Extraction**:
  - "tomorrow" → Next day at 2 PM
  - "next week" → 7 days later at 2 PM
  - "Monday", "Tuesday", etc. → Next occurrence of that day at 2 PM

### 5. No Specific Outcome
- **Trigger**: None of the above patterns match
- **Outcome**: `null`
- **Base44 Action**: Contact goes to Recycle folder

---

## Base44 API Integration

### Endpoint: trackAICallDuration

**URL**: `https://simpleappointmentsinc.com/api/functions/trackAICallDuration`

**Method**: POST

**Payload**:
```json
{
  "callSid": "CA1234567890abcdef",
  "duration": 142,
  "status": "completed" | "no-answer" | "voicemail" | "busy" | "failed",
  "outcome": "appointment_booked" | "declined" | "not_interested" | "follow_up_scheduled" | null,
  "followUpDate": "2025-01-15T14:00:00Z" | null
}
```

**Field Descriptions**:
- `callSid`: Twilio call SID (from Twilio)
- `duration`: Call duration in seconds (from Twilio)
- `status`: Call completion status (from Twilio)
- `outcome`: Conversation outcome (from ElevenLabs analysis)
- `followUpDate`: ISO 8601 date for follow-up (from ElevenLabs transcript analysis)

**Status Values**:
- `completed`: Call connected and completed normally
- `no-answer`: No one answered the call
- `busy`: Recipient's line was busy
- `failed`: Technical failure during call
- `voicemail`: Call went to voicemail (if detectable)

---

## Testing the Integration

### 1. Test Tool Endpoints Directly

```bash
# Test check-availability proxy
curl -X POST https://your-railway-app.up.railway.app/elevenlabs-tools/check-availability \
  -H "Content-Type: application/json" \
  -d '{
    "contact_id": "test_contact_123",
    "agent_id": "test_agent_456",
    "preferred_date": "2025-12-30",
    "address": "123 Main St, San Francisco, CA"
  }'

# Test book-appointment proxy
curl -X POST https://your-railway-app.up.railway.app/elevenlabs-tools/book-appointment \
  -H "Content-Type: application/json" \
  -d '{
    "contact_id": "test_contact_123",
    "agent_id": "test_agent_456",
    "appointment_date": "2025-12-30",
    "start_time": "14:00",
    "end_time": "15:00",
    "customer_name": "Test User",
    "customer_phone": "+14155551234"
  }'
```

### 2. Test Complete Call Flow

1. Make a test call from Base44:
   ```javascript
   POST /make-call
   {
     "to": "+1YOUR_TEST_NUMBER",
     "agentId": "your_agent_id",
     "dynamicVariables": {
       "contact_id": "test_123",
       "agent_id": "agent_456"
     }
   }
   ```

2. During the call:
   - Ask the agent to check availability
   - Verify the agent receives available slots
   - Book an appointment through the agent
   - Verify confirmation

3. After call completion:
   - Check Railway logs for `/twilio-status-callback` entry
   - Verify Base44 received the call data
   - Check that contact was updated with correct outcome

### 3. Monitor Logs

View Railway logs for debugging:

```bash
# Check for tool calls
grep "ElevenLabs.*tool called" logs

# Check for status callbacks
grep "Twilio status callback" logs

# Check Base44 integration
grep "Base44" logs
```

---

## Troubleshooting

### Issue: Tool Calls Not Working

**Symptoms**: ElevenLabs agent doesn't use checkAvailability or bookAppointment

**Solutions**:
1. Verify tool URLs point to your Railway domain
2. Check Railway logs for incoming requests to `/elevenlabs-tools/*`
3. Ensure `contact_id` and `agent_id` are passed in `dynamicVariables`
4. Test tools directly with curl to verify they're working

### Issue: Status Callback Not Received

**Symptoms**: No data sent to Base44 after call completion

**Solutions**:
1. Verify status callback URL in ElevenLabs phone number settings
2. Check Railway logs for `/twilio-status-callback` entries
3. Ensure Railway app is publicly accessible
4. Test with Twilio's webhook test feature

### Issue: Incorrect Outcome Detection

**Symptoms**: Wrong outcome sent to Base44

**Solutions**:
1. Review call transcript in Railway logs
2. Check `extractFollowUpDate()` logic for edge cases
3. Add custom keywords to outcome detection logic
4. Verify tool call success tracking

### Issue: Follow-Up Date Not Extracted

**Symptoms**: `followUpDate` is always null

**Solutions**:
1. Check transcript for date mentions
2. Update `extractFollowUpDate()` with additional patterns
3. Verify timezone handling for customer address
4. Add logging to date extraction function

---

## Environment Variables

Required environment variables for Base44 integration:

```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# ElevenLabs Configuration
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_AGENT_ID=your_agent_id
ELEVENLABS_PHONE_NUMBER_ID=pn_your_phone_number_id

# Railway Configuration (auto-set by Railway)
RAILWAY_PUBLIC_DOMAIN=your-app.up.railway.app
```

---

## Security Considerations

1. **Webhook Signatures**: Consider implementing HMAC-SHA256 signatures for webhook verification
2. **Rate Limiting**: Add rate limiting to proxy endpoints to prevent abuse
3. **Input Validation**: All tool parameters are validated before forwarding to Base44
4. **HTTPS Only**: All endpoints require HTTPS in production
5. **API Key Protection**: Never expose ElevenLabs or Base44 API keys in logs

---

## Cost Optimization

**Per Call Costs**:
- Twilio: ~$0.013/min
- ElevenLabs Conversational AI: ~$0.10/min
- **Total**: ~$0.113/min

**Monthly Estimate** (1,000 calls × 5 min avg):
- Total minutes: 5,000
- Total cost: ~$565/month

**Compared to Legacy** (OpenAI + TTS): ~$0.22/min = $1,100/month
**Savings**: ~49% ($535/month)

---

## Advanced Configuration

### Custom Outcome Detection

Add custom patterns to `/twilio-status-callback` in `server.js`:

```javascript
// Add after existing outcome detection
if (transcriptText.includes('your_custom_keyword')) {
  outcome = 'your_custom_outcome';
}
```

### Extended Follow-Up Date Patterns

Extend `extractFollowUpDate()` function:

```javascript
// Add support for "in 2 days", "in 3 weeks", etc.
const daysMatch = transcript.match(/in (\d+) days?/);
if (daysMatch) {
  const days = parseInt(daysMatch[1]);
  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + days);
  return targetDate.toISOString();
}
```

### Tool Call Metadata

Store additional tool call metadata in callTracker:

```javascript
callTracker.addToolCall(callSid, {
  name: 'bookAppointment',
  parameters: { appointment_date, start_time },
  success: true,
  result: { appointment_id },
  customData: { /* your data */ }
});
```

---

## Support

For integration issues:
1. Check Railway logs first
2. Review this documentation
3. Test each component independently
4. Contact support with specific error messages and callSids

---

**Last Updated**: December 2025
**Version**: 1.0
