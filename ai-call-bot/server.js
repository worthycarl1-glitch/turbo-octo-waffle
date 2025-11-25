require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const twilio = require('twilio');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const conversationManager = require('./services/conversationManager');
const voiceService = require('./services/voiceService');
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

const startTime = Date.now();

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (error) {
  console.error('Failed to create logs directory:', error.message);
  process.exit(1);
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
      return `${timestamp} [${level}]: ${message} ${metaString}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files FIRST (before logging)
app.use('/dashboard', express.static(path.join(__dirname, '..', 'public', 'dashboard')));
app.use('/audio', express.static(path.join(__dirname, 'public/audio')));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

const checkEnvVars = () => {
  const requiredVars = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
    'OPENAI_API_KEY'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    logger.warn(`Missing environment variables: ${missing.join(', ')}`);
  }

  return {
    twilioConfigured: process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN,
    openaiConfigured: !!process.env.OPENAI_API_KEY
  };
};

const getBaseUrl = () => {
  // Check for Railway environment variables first
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    // Basic validation for hostname characters
    const domain = process.env.RAILWAY_PUBLIC_DOMAIN;
    if (/^[a-zA-Z0-9.-]+$/.test(domain)) {
      return `https://${domain}`;
    }
    logger.warn('Invalid RAILWAY_PUBLIC_DOMAIN format, falling back to next option');
  }
  if (process.env.RAILWAY_STATIC_URL) {
    return process.env.RAILWAY_STATIC_URL;
  }
  // Fallback to localhost for local development
  return `http://localhost:${PORT}`;
};

// Cache base URL at startup since environment variables won't change during runtime
const BASE_URL = getBaseUrl();

const getUptime = () => {
  return Math.floor((Date.now() - startTime) / 1000);
};

const getMemoryUsage = () => {
  const usage = process.memoryUsage();
  return {
    rss: `${Math.round(usage.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)} MB`,
    external: `${Math.round(usage.external / 1024 / 1024)} MB`
  };
};

// Dashboard routes
app.get('/dashboard', (req, res) => {
  const filePath = path.resolve(__dirname, '..', 'public', 'dashboard', 'index.html');
  console.log('Attempting to serve dashboard from:', filePath);
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error serving dashboard:', err);
      res.status(500).json({ error: 'Dashboard not found', path: filePath });
    }
  });
});

app.get('/dashboard/', (req, res) => {
  const filePath = path.resolve(__dirname, '..', 'public', 'dashboard', 'index.html');
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error serving dashboard:', err);
      res.status(500).json({ error: 'Dashboard not found', path: filePath });
    }
  });
});

app.get('/', (req, res) => {
  const config = checkEnvVars();
  const uptime = getUptime();

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Call Bot Server - Dashboard</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .dashboard {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 800px;
            width: 100%;
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }

        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
        }

        .header p {
            font-size: 1.1em;
            opacity: 0.9;
        }

        .content {
            padding: 40px;
        }

        .status-section {
            margin-bottom: 30px;
        }

        .status-section h2 {
            color: #333;
            margin-bottom: 15px;
            font-size: 1.5em;
        }

        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }

        .status-card {
            background: #f7f9fc;
            padding: 20px;
            border-radius: 10px;
            border-left: 4px solid #667eea;
        }

        .status-card h3 {
            color: #666;
            font-size: 0.9em;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .status-card p {
            color: #333;
            font-size: 1.3em;
            font-weight: bold;
        }

        .status-indicator {
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }

        .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            display: inline-block;
        }

        .status-dot.online {
            background: #10b981;
            box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
        }

        .status-dot.offline {
            background: #ef4444;
        }

        .config-status {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .config-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 15px;
            background: white;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
        }

        .config-label {
            font-weight: 500;
            color: #333;
        }

        .config-value {
            font-size: 1.2em;
        }

        .endpoints {
            background: #f7f9fc;
            padding: 20px;
            border-radius: 10px;
        }

        .endpoints h3 {
            color: #333;
            margin-bottom: 15px;
        }

        .endpoint-list {
            list-style: none;
        }

        .endpoint-list li {
            padding: 12px;
            margin-bottom: 8px;
            background: white;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
            border: 1px solid #e5e7eb;
        }

        .method {
            background: #667eea;
            color: white;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 0.85em;
            font-weight: bold;
            min-width: 60px;
            text-align: center;
        }

        .method.post {
            background: #10b981;
        }

        .path {
            font-family: 'Courier New', monospace;
            color: #666;
        }

        @media (max-width: 600px) {
            .header h1 {
                font-size: 1.8em;
            }

            .content {
                padding: 20px;
            }

            .status-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="dashboard">
        <div class="header">
            <h1>AI Call Bot Server</h1>
            <p>Production-Ready Twilio Integration</p>
        </div>

        <div class="content">
            <div class="status-section">
                <h2>System Status</h2>
                <div class="status-grid">
                    <div class="status-card">
                        <h3>Server Status</h3>
                        <p class="status-indicator">
                            <span class="status-dot online"></span>
                            Online
                        </p>
                    </div>

                    <div class="status-card">
                        <h3>Uptime</h3>
                        <p>${uptime} seconds</p>
                    </div>

                    <div class="status-card">
                        <h3>Current Time</h3>
                        <p>${new Date().toLocaleTimeString()}</p>
                    </div>

                    <div class="status-card">
                        <h3>Environment</h3>
                        <p>${NODE_ENV}</p>
                    </div>
                </div>
            </div>

            <div class="status-section">
                <h2>Configuration Status</h2>
                <div class="config-status">
                    <div class="config-item">
                        <span class="config-label">Twilio Configuration</span>
                        <span class="config-value">${config.twilioConfigured ? '✓' : '✗'}</span>
                    </div>
                    <div class="config-item">
                        <span class="config-label">OpenAI Configuration</span>
                        <span class="config-value">${config.openaiConfigured ? '✓' : '✗'}</span>
                    </div>
                </div>
            </div>

            <div class="status-section">
                <div class="endpoints">
                    <h3>API Endpoints</h3>
                    <ul class="endpoint-list">
                        <li>
                            <span class="method">GET</span>
                            <span class="path">/</span>
                        </li>
                        <li>
                            <span class="method">GET</span>
                            <span class="path">/health</span>
                        </li>
                        <li>
                            <span class="method post">POST</span>
                            <span class="path">/make-call</span>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
  `;

  res.type('text/html').send(html);
});

app.get('/health', (req, res) => {
  const config = checkEnvVars();
  const uptime = getUptime();
  const memory = getMemoryUsage();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: uptime,
    memory: memory,
    configuration: {
      twilio: config.twilioConfigured ? 'configured' : 'not configured',
      openai: config.openaiConfigured ? 'configured' : 'not configured'
    }
  });
});

app.post('/make-call', async (req, res) => {
  try {
    const { to, message } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'Phone number required' });
    }

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return res.status(500).json({ error: 'Twilio not configured' });
    }

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    const twiml = new twilio.twiml.VoiceResponse();

    const gather = twiml.gather({
      input: 'speech',
      action: `${BASE_URL}/process-speech`,
      speechTimeout: 'auto',
      language: 'en-US'
    });

       const audioUrl = await voiceService.generateSpeech(
      message || "Hey there! I'm your AI assistant. What can I help you with?",
      '4tRn1lSkEn13EVTuqb0g'
    );
    gather.play(audioUrl);

    twiml.redirect(`${BASE_URL}/handle-response`);

    const call = await client.calls.create({
      twiml: twiml.toString(),
      to: to,
      from: process.env.TWILIO_PHONE_NUMBER
    });

    logger.info('Outgoing call initiated', { callSid: call.sid, to: to });

    res.json({
      success: true,
      callSid: call.sid,
      to: to
    });
  } catch (error) {
    logger.error('Error making outgoing call', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.post('/handle-response', async (req, res) => {
  try {
    const twiml = new twilio.twiml.VoiceResponse();

    const gather = twiml.gather({
      input: 'speech',
      action: `${BASE_URL}/process-speech`,
      speechTimeout: 'auto',
      language: 'en-US'
    });

        const audioUrl = await voiceService.generateSpeech(
      "I'm listening. What would you like to talk about?",
      '4tRn1lSkEn13EVTuqb0g'
    );
    gather.play(audioUrl);

    twiml.redirect(`${BASE_URL}/handle-response`);

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    logger.error('Error in /handle-response endpoint', { error: error.message });
    res.sendStatus(500);
  }
});

app.post('/process-speech', async (req, res) => {
  try {
    const { SpeechResult, Confidence, CallSid } = req.body;

    logger.info('Speech received', {
      callSid: CallSid,
      speech: SpeechResult,
      confidence: Confidence
    });

    const twiml = new twilio.twiml.VoiceResponse();

    if (!SpeechResult) {
          const audioUrl = await voiceService.generateSpeech(
        "Sorry, I didn't quite catch that. Could you say it again?",
        '4tRn1lSkEn13EVTuqb0g'
      );
      twiml.play(audioUrl);
      twiml.redirect(`${BASE_URL}/handle-response`);
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    const speech = SpeechResult.toLowerCase().trim();

    if (speech.includes('bye') || speech.includes('goodbye') || speech.includes('hang up')) {
      const summary = conversationManager.endConversation(CallSid);

      logger.info('Conversation ended', {
        callSid: CallSid,
        summary: summary
      });

           const audioUrl = await voiceService.generateSpeech(
        "It was great talking with you! Take care!",
        '4tRn1lSkEn13EVTuqb0g'
      );
      twiml.play(audioUrl);
      twiml.hangup();
    } else {
      const result = await conversationManager.generateResponse(CallSid, SpeechResult);

      logger.info('AI response with emotion detection', {
        callSid: CallSid,
        userInput: SpeechResult,
        emotion: result.emotionData.emotion,
        emotionalIntensity: result.emotionData.intensity,
        emotionalTone: result.emotionData.tone,
        emotionalTrend: result.emotionData.trend,
        aiResponse: result.response,
        tokenUsage: {
          promptTokens: result.tokenUsage.prompt_tokens,
          completionTokens: result.tokenUsage.completion_tokens,
          totalTokens: result.tokenUsage.total_tokens,
          conversationTotal: result.tokenUsage.conversation_total,
          error: result.tokenUsage.error || false
        }
      });

           const audioUrl = await voiceService.generateSpeech(
        result.response,
        '4tRn1lSkEn13EVTuqb0g'
      );
      twiml.play(audioUrl);
      twiml.redirect(`${BASE_URL}/handle-response`);
    }

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    logger.error('Error in /process-speech endpoint', { error: error.message });

    const twiml = new twilio.twiml.VoiceResponse();
        const audioUrl = await voiceService.generateSpeech(
      "Hmm, I'm having a bit of trouble there. Can you try again?",
      '4tRn1lSkEn13EVTuqb0g'
    );
    twiml.play(audioUrl);
    twiml.redirect('/voice');

    res.type('text/xml');
    res.send(twiml.toString());
  }
});


app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString()
  });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: NODE_ENV === 'production' ? 'An error occurred' : err.message,
    timestamp: new Date().toISOString()
  });
});

const server = app.listen(PORT, HOST, () => {
  const webhookUrl = process.env.TWILIO_WEBHOOK_URL || 'https://your-url.com';

  console.log('============================================================');
  console.log('🤖 AI CALL BOT SERVER STARTED');
  console.log('');
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Server: http://${HOST}:${PORT}`);
  console.log(`Health Check: http://${HOST}:${PORT}/health`);
  console.log(`Twilio Webhook: ${webhookUrl}`);
  console.log('============================================================');

  logger.info('Server started successfully', {
    port: PORT,
    host: HOST,
    environment: NODE_ENV
  });

  setInterval(() => {
    conversationManager.cleanupOldConversations();
  }, 5 * 60 * 1000);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const connectionId = uuidv4();
  logger.info('WebSocket connection established', { connectionId });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      logger.info('WebSocket message received', { connectionId, event: data.event });

      if (data.event === 'start') {
        logger.info('Media stream started', {
          connectionId,
          streamSid: data.streamSid,
          callSid: data.start?.callSid
        });
      } else if (data.event === 'media') {
        logger.debug('Media payload received', { connectionId });
      } else if (data.event === 'stop') {
        logger.info('Media stream stopped', { connectionId });
      }
    } catch (error) {
      logger.error('Error processing WebSocket message', {
        connectionId,
        error: error.message
      });
    }
  });

  ws.on('close', () => {
    logger.info('WebSocket connection closed', { connectionId });
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error', { connectionId, error: error.message });
  });
});

const gracefulShutdown = (signal) => {
  logger.info(`${signal} received, starting graceful shutdown`);

  server.close(() => {
    logger.info('HTTP server closed');

    wss.close(() => {
      logger.info('WebSocket server closed');
      process.exit(0);
    });
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

module.exports = { app, server, wss };








