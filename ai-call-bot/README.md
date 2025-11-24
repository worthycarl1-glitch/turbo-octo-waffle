# AI Call Bot Server

Production-ready Node.js Express server for real-time AI call bot with Twilio integration. This server handles incoming phone calls, processes speech using Twilio's voice recognition, and provides intelligent conversational responses.

## Features

- **Express.js Server** - Robust HTTP server with RESTful API endpoints
- **Twilio Integration** - Complete voice call handling with TwiML responses
- **Speech Recognition** - Real-time speech-to-text processing
- **WebSocket Support** - Media stream handling for advanced features
- **Winston Logging** - Comprehensive logging to console and files
- **Environment Configuration** - Easy setup with dotenv
- **Beautiful Dashboard** - Real-time system status monitoring
- **Graceful Shutdown** - Proper cleanup on SIGTERM/SIGINT
- **Production Ready** - Error handling, validation, and security best practices

## Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- Twilio account with phone number
- OpenAI API key (optional, for advanced AI features)

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd ai-call-bot-server
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
```env
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WEBHOOK_URL=https://your-domain.com
OPENAI_API_KEY=your_openai_api_key
PORT=3000
NODE_ENV=production
```

4. Start the server:
```bash
npm start
```

5. Visit `http://localhost:3000` to see the dashboard

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID | Yes | - |
| `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token | Yes | - |
| `TWILIO_PHONE_NUMBER` | Your Twilio phone number | Yes | - |
| `TWILIO_WEBHOOK_URL` | Public URL for webhooks | Yes | - |
| `OPENAI_API_KEY` | OpenAI API key | Yes | - |
| `PORT` | Server port | No | 3000 |
| `HOST` | Server host | No | 0.0.0.0 |
| `NODE_ENV` | Environment mode | No | development |
| `LOG_LEVEL` | Logging level | No | info |

## API Endpoints

### GET /
Dashboard with real-time system status and configuration.

**Response**: HTML dashboard

### GET /health
Health check endpoint for monitoring.

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "memory": {
    "rss": "50 MB",
    "heapTotal": "30 MB",
    "heapUsed": "20 MB",
    "external": "1 MB"
  },
  "configuration": {
    "twilio": "configured",
    "openai": "configured"
  }
}
```

### POST /voice
Twilio webhook for incoming calls.

**Request** (from Twilio):
```
From: +1234567890
To: +1987654321
CallSid: CA1234567890abcdef
```

**Response**: TwiML XML

### POST /process-speech
Processes speech input from caller.

**Request** (from Twilio):
```
SpeechResult: "Hello, how are you?"
Confidence: 0.95
CallSid: CA1234567890abcdef
```

**Response**: TwiML XML with intelligent response

**Supported Commands**:
- "hello" / "hi" - Greeting response
- "bye" / "goodbye" - End call
- "time" / "date" - Current date/time
- "help" - Help message
- Other - Echo and offer assistance

### POST /status
Call status updates from Twilio.

**Request** (from Twilio):
```
CallSid: CA1234567890abcdef
CallStatus: completed
CallDuration: 45
```

**Response**: 200 OK

## Deployment

### Railway

1. Create a new project on [Railway](https://railway.app)

2. Connect your GitHub repository

3. Add environment variables in Railway dashboard

4. Deploy automatically on push to main branch

5. Copy your Railway URL and update `TWILIO_WEBHOOK_URL`

### Twilio Configuration

1. Log in to your [Twilio Console](https://console.twilio.com)

2. Navigate to Phone Numbers → Manage → Active Numbers

3. Select your phone number

4. Under "Voice Configuration":
   - **A Call Comes In**: Webhook, `https://your-domain.com/voice`, HTTP POST
   - **Call Status Changes**: Webhook, `https://your-domain.com/status`, HTTP POST

5. Save your configuration

6. Test by calling your Twilio number

## Project Structure

```
ai-call-bot-server/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── .env.example           # Environment variables template
├── .gitignore            # Git ignore rules
├── README.md             # Documentation
├── models/
│   └── emotion/
│       └── emotion-lexicon.json  # Emotion detection data
├── logs/
│   ├── error.log         # Error logs
│   ├── combined.log      # All logs
│   └── transcripts/      # Call transcripts
└── src/
    ├── conversation/     # Conversation logic
    ├── telephony/        # Twilio integration
    └── analysis/         # Speech analysis
```

## Logging

Logs are written to:
- **Console**: Colorized output for development
- **logs/error.log**: Error-level logs only
- **logs/combined.log**: All logs

Log levels: error, warn, info, debug

## Conversation Features

The AI bot can:
- Greet callers naturally
- Understand common requests (time, help, greetings)
- Echo back speech for confirmation
- Provide helpful responses
- End calls gracefully
- Handle errors with user-friendly messages

## Security

- Environment variables for sensitive data
- Input validation on all endpoints
- Error messages sanitized in production
- Twilio webhook validation (can be enabled)
- Graceful error handling

## Development

### Running in Development Mode

```bash
NODE_ENV=development npm start
```

### Viewing Logs

```bash
# Watch all logs
tail -f logs/combined.log

# Watch errors only
tail -f logs/error.log
```

### Testing Endpoints

```bash
# Health check
curl http://localhost:3000/health

# Test voice endpoint (simulating Twilio)
curl -X POST http://localhost:3000/voice \
  -d "From=+1234567890" \
  -d "To=+1987654321" \
  -d "CallSid=TEST123"
```

## Troubleshooting

### Issue: "Missing environment variables" warning

**Solution**: Ensure all required variables are set in `.env` file

### Issue: Twilio not receiving webhooks

**Solution**:
1. Verify your server is publicly accessible
2. Check `TWILIO_WEBHOOK_URL` is correct
3. Ensure firewall allows incoming connections
4. Test with `ngrok` for local development

### Issue: Speech not recognized

**Solution**:
1. Check Twilio console for errors
2. Verify phone connection quality
3. Review logs for processing errors

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a pull request

## License

MIT License - feel free to use this project for commercial or personal use.

## Support

For issues and questions:
- Check the logs in `logs/` directory
- Review Twilio console for call errors
- Open an issue on GitHub

## Acknowledgments

- Twilio for voice infrastructure
- OpenAI for AI capabilities
- Express.js community
- Winston logging library

---

Built with ❤️ for seamless AI-powered voice interactions
