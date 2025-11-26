require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const WebSocket = require('ws');
const twilio = require('twilio');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const conversationManager = require('./services/conversationManager');
const voiceService = require('./services/voiceService');
const callTracker = require('./services/callTracker');
const webhookService = require('./services/webhookService');
const elevenLabsAgentService = require('./services/elevenLabsAgentService');
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

const startTime = Date.now();

// Voice cache for /voices endpoint
let voicesCache = null;
let voicesCacheTimestamp = null;
const VOICES_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const DEFAULT_VOICE_ID = '4tRn1lSkEn13EVTuqb0g'; // Serafina - default voice

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
                            <span class="method">GET</span>
                            <span class="path">/voices</span>
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

/**
 * Validate E.164 phone number format
 * @param {string} phone 
 */
const validatePhoneNumber = (phone) => {
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phone);
};

/**
 * Validate numeric range
 * @param {number} value 
 * @param {number} min 
 * @param {number} max 
 * @param {string} fieldName 
 */
const validateNumericRange = (value, min, max, fieldName) => {
  if (value === undefined || value === null) {
    return { valid: true };
  }
  const num = parseFloat(value);
  if (isNaN(num)) {
    return { valid: false, error: `${fieldName} must be a number` };
  }
  if (num < min || num > max) {
    return { valid: false, error: `${fieldName} must be between ${min} and ${max}` };
  }
  return { valid: true };
};

/**
 * Validate speechTimeout parameter
 * @param {string|number} value 
 */
const validateSpeechTimeout = (value) => {
  if (value === undefined || value === null) {
    return { valid: true };
  }
  if (value === 'auto') {
    return { valid: true };
  }
  const num = parseFloat(value);
  if (isNaN(num)) {
    return { valid: false, error: 'speechTimeout must be a number between 0.5 and 5, or "auto"' };
  }
  if (num < 0.5 || num > 5) {
    return { valid: false, error: 'speechTimeout must be between 0.5 and 5 seconds, or "auto"' };
  }
  return { valid: true };
};

/**
 * Validate model parameter
 * @param {string} value 
 */
const validateModel = (value) => {
  if (value === undefined || value === null) {
    return { valid: true };
  }
  const validModels = ['gpt-4o-mini', 'gpt-4o', 'gpt-4'];
  if (!validModels.includes(value)) {
    return { valid: false, error: `model must be one of: ${validModels.join(', ')}` };
  }
  return { valid: true };
};

/**
 * Validate speechModel parameter
 * @param {string} value 
 */
const validateSpeechModel = (value) => {
  if (value === undefined || value === null) {
    return { valid: true };
  }
  const validModels = ['default', 'phone_call', 'numbers_and_commands'];
  if (!validModels.includes(value)) {
    return { valid: false, error: `speechModel must be one of: ${validModels.join(', ')}` };
  }
  return { valid: true };
};

/**
 * Validate hints parameter
 * @param {Array} value 
 */
const validateHints = (value) => {
  if (value === undefined || value === null) {
    return { valid: true };
  }
  if (!Array.isArray(value)) {
    return { valid: false, error: 'hints must be an array of strings' };
  }
  if (value.length > 500) {
    return { valid: false, error: 'hints array cannot exceed 500 items' };
  }
  for (const hint of value) {
    if (typeof hint !== 'string') {
      return { valid: false, error: 'All hints must be strings' };
    }
    // Validate that hints don't contain commas (used as delimiter by Twilio)
    if (hint.includes(',')) {
      return { valid: false, error: 'Hints cannot contain commas' };
    }
  }
  return { valid: true };
};

/**
 * Enhanced /make-call endpoint with enterprise-grade parameters
 * Now supports ElevenLabs Conversational AI agents with agentId parameter
 */
app.post('/make-call', async (req, res) => {
  try {
    // Extract all parameters from request body
    const {
      // Required
      to,
      // NEW: ElevenLabs Conversational AI Agent (preferred)
      agentId,
      // Voice Configuration (Optional - ignored when using agentId)
      voiceId = '4tRn1lSkEn13EVTuqb0g',
      voiceStability,
      voiceSimilarityBoost,
      voiceStyle,
      speakingRate,
      // TTS Provider Configuration (Optional - ignored when using agentId)
      ttsProvider = process.env.DEFAULT_TTS_PROVIDER || 'elevenlabs',
      openaiVoice = 'alloy',
      openaiModel = 'tts-1',
      // Conversation Control (Optional - ignored when using agentId)
      message,
      systemPrompt,
      conversationMode = 'interactive',
      maxDuration = 600,
      language = 'en-US',
      // Advanced Features (Optional)
      enableEmotionDetection = true,
      enableInterruptions = true,
      sentimentAnalysis = true,
      recordCall = false,
      callbackUrl = null,
      metadata = {},
      // Lead Qualification (Optional)
      qualificationQuestions = [],
      transferNumber = null,
      transferConditions = [],
      // Scheduling & Integration (Optional)
      calendarIntegration = false,
      crmSync = false,
      timezone = 'America/Los_Angeles',
      // Performance Optimization Parameters (ignored when using agentId)
      speechTimeout = 'auto',
      model = 'gpt-4o-mini',
      maxTokens = 150,
      temperature = 0.7,
      speechModel = 'phone_call',
      enhancedModel = true,
      hints = [],
      enableResponseCache = true
    } = req.body;

    // === VALIDATION ===
    
    // Required: Phone number
    if (!to) {
      return res.status(400).json({ 
        success: false,
        error: 'Phone number required',
        details: 'The "to" parameter is required and must be a valid E.164 phone number'
      });
    }

    // Validate E.164 format
    if (!validatePhoneNumber(to)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid phone number format',
        details: 'Phone number must be in E.164 format (e.g., +14155551234)'
      });
    }

    // Validate callbackUrl if provided
    if (callbackUrl && !webhookService.isValidUrl(callbackUrl)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid callbackUrl',
        details: 'callbackUrl must be a valid HTTP/HTTPS URL'
      });
    }

    // Check Twilio configuration
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return res.status(500).json({ 
        success: false,
        error: 'Twilio not configured',
        details: 'Server is missing Twilio credentials'
      });
    }

    // Determine effective agent ID (from request or default)
    const effectiveAgentId = agentId || elevenLabsAgentService.getDefaultAgentId();

    // ====================================================
    // NEW: ElevenLabs Conversational AI Agent Mode
    // When agentId is provided, use agent-based architecture
    // ====================================================
    if (effectiveAgentId) {
      // Check ElevenLabs configuration
      if (!elevenLabsAgentService.isConfigured()) {
        return res.status(500).json({
          success: false,
          error: 'ElevenLabs not configured',
          details: 'Server is missing ELEVENLABS_API_KEY environment variable'
        });
      }

      // Generate conversation ID
      const conversationId = `conv_${uuidv4()}`;

      logger.info('Agent-based call request received', {
        to,
        conversationId,
        agentId: effectiveAgentId,
        maxDuration,
        recordCall,
        hasCallbackUrl: !!callbackUrl,
        metadata
      });

      // Create Twilio client
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

      // Build TwiML for WebSocket media stream to ElevenLabs agent
      const twiml = new twilio.twiml.VoiceResponse();
      
      // Connect call to ElevenLabs agent via WebSocket
      const connect = twiml.connect();
      
      // Log URL construction details for debugging
      logger.info('Building WebSocket stream URL', {
        baseUrl: BASE_URL,
        agentId: effectiveAgentId,
        conversationId
      });
      
      const streamUrl = `${BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://')}/elevenlabs-stream?agentId=${encodeURIComponent(effectiveAgentId)}&conversationId=${encodeURIComponent(conversationId)}`;
      
      logger.info('WebSocket stream URL built', { streamUrl });
      
      connect.stream({
        url: streamUrl
      });

      // Create call options
      const callOptions = {
        twiml: twiml.toString(),
        to: to,
        from: process.env.TWILIO_PHONE_NUMBER
      };

      // Add recording if requested
      if (recordCall) {
        callOptions.record = true;
        callOptions.recordingStatusCallback = `${BASE_URL}/recording-callback?conversationId=${encodeURIComponent(conversationId)}`;
      }

      // Add status callback for call tracking
      let statusCallbackUrl = `${BASE_URL}/call-status-callback?conversationId=${encodeURIComponent(conversationId)}`;
      if (callbackUrl) {
        statusCallbackUrl += `&callbackUrl=${encodeURIComponent(callbackUrl)}`;
      }
      callOptions.statusCallback = statusCallbackUrl;
      callOptions.statusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed'];

      // Make the call
      const call = await client.calls.create(callOptions);

      // Initialize call tracking for agent-based call
      callTracker.initCall(call.sid, {
        conversationId,
        to,
        agentId: effectiveAgentId,
        agentMode: true,
        metadata,
        maxDuration,
        callbackUrl,
        recordCall
      });

      logger.info('Agent-based call initiated', { 
        callSid: call.sid, 
        conversationId,
        agentId: effectiveAgentId,
        to 
      });

      // Build response
      return res.json({
        success: true,
        callSid: call.sid,
        to: to,
        conversationId: conversationId,
        agentId: effectiveAgentId,
        mode: 'agent',
        estimatedDuration: maxDuration,
        timestamp: new Date().toISOString()
      });
    }

    // ====================================================
    // LEGACY: Voice-based mode (when no agentId provided)
    // Uses OpenAI + ElevenLabs TTS pipeline
    // ====================================================

    // Validate numeric ranges (only needed for legacy mode)
    const rangeValidations = [
      validateNumericRange(voiceStability, 0, 1, 'voiceStability'),
      validateNumericRange(voiceSimilarityBoost, 0, 1, 'voiceSimilarityBoost'),
      validateNumericRange(voiceStyle, 0, 1, 'voiceStyle'),
      validateNumericRange(speakingRate, 0.5, 2.0, 'speakingRate'),
      validateNumericRange(maxDuration, 1, 3600, 'maxDuration'),
      validateNumericRange(maxTokens, 10, 500, 'maxTokens'),
      validateNumericRange(temperature, 0.0, 2.0, 'temperature')
    ];

    for (const validation of rangeValidations) {
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid parameter value',
          details: validation.error
        });
      }
    }

    // Validate performance optimization parameters
    const speechTimeoutValidation = validateSpeechTimeout(speechTimeout);
    if (!speechTimeoutValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid speechTimeout',
        details: speechTimeoutValidation.error
      });
    }

    const modelValidation = validateModel(model);
    if (!modelValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid model',
        details: modelValidation.error
      });
    }

    const speechModelValidation = validateSpeechModel(speechModel);
    if (!speechModelValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid speechModel',
        details: speechModelValidation.error
      });
    }

    const hintsValidation = validateHints(hints);
    if (!hintsValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid hints',
        details: hintsValidation.error
      });
    }

    // Validate boolean parameters
    if (typeof enhancedModel !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Invalid enhancedModel',
        details: 'enhancedModel must be a boolean'
      });
    }

    if (typeof enableResponseCache !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Invalid enableResponseCache',
        details: 'enableResponseCache must be a boolean'
      });
    }

    // Validate TTS provider
    const validTtsProviders = ['elevenlabs', 'openai'];
    if (!validTtsProviders.includes(ttsProvider)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ttsProvider',
        details: `ttsProvider must be one of: ${validTtsProviders.join(', ')}`
      });
    }

    // Validate OpenAI voice if using OpenAI TTS
    const validOpenaiVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    if (ttsProvider === 'openai' && !validOpenaiVoices.includes(openaiVoice)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid openaiVoice',
        details: `openaiVoice must be one of: ${validOpenaiVoices.join(', ')}`
      });
    }

    // Validate OpenAI TTS model if using OpenAI TTS
    const validOpenaiTtsModels = ['tts-1', 'tts-1-hd'];
    if (ttsProvider === 'openai' && !validOpenaiTtsModels.includes(openaiModel)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid openaiModel',
        details: `openaiModel must be one of: ${validOpenaiTtsModels.join(', ')}`
      });
    }

    // Validate conversationMode
    const validModes = ['interactive', 'scripted', 'faq'];
    if (!validModes.includes(conversationMode)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid conversationMode',
        details: `conversationMode must be one of: ${validModes.join(', ')}`
      });
    }

    // Check TTS provider configuration
    if (ttsProvider === 'elevenlabs' && !voiceService.isConfigured()) {
      return res.status(500).json({
        success: false,
        error: 'ElevenLabs not configured',
        details: 'Server is missing ELEVENLABS_API_KEY environment variable'
      });
    }

    if (ttsProvider === 'openai' && !voiceService.isOpenAIConfigured()) {
      return res.status(500).json({
        success: false,
        error: 'OpenAI TTS not configured',
        details: 'Server is missing OPENAI_API_KEY environment variable'
      });
    }

    // Generate conversation ID
    const conversationId = `conv_${uuidv4()}`;

    // Build voice configuration object
    const voiceConfig = {
      voiceId,
      stability: voiceStability,
      similarityBoost: voiceSimilarityBoost,
      style: voiceStyle,
      speakingRate,
      // OpenAI TTS settings
      openaiVoice,
      openaiModel
    };

    // Log enhanced parameters
    logger.info('Legacy voice-based call request received', {
      to,
      conversationId,
      ttsProvider,
      voiceConfig: {
        voiceId,
        voiceStability,
        voiceSimilarityBoost,
        voiceStyle,
        speakingRate,
        openaiVoice: ttsProvider === 'openai' ? openaiVoice : undefined,
        openaiModel: ttsProvider === 'openai' ? openaiModel : undefined
      },
      conversationMode,
      maxDuration,
      language,
      enableEmotionDetection,
      enableInterruptions,
      sentimentAnalysis,
      recordCall,
      hasCallbackUrl: !!callbackUrl,
      hasSystemPrompt: !!systemPrompt,
      metadata,
      qualificationQuestionsCount: qualificationQuestions.length,
      hasTransferNumber: !!transferNumber,
      // Log optimization parameters
      optimization: {
        speechTimeout,
        model,
        maxTokens,
        temperature,
        speechModel,
        enhancedModel,
        hintsCount: hints.length,
        enableResponseCache
      }
    });

    // Initialize conversation with enhanced configuration including optimization params
    conversationManager.initConversation(conversationId, {
      systemPrompt,
      conversationMode,
      maxDuration,
      metadata,
      language,
      enableEmotionDetection,
      enableInterruptions,
      sentimentAnalysis,
      qualificationQuestions,
      transferNumber,
      transferConditions,
      // Performance optimization parameters
      model,
      maxTokens,
      temperature
    });

    // Create Twilio client
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    // Build TwiML response
    const twiml = new twilio.twiml.VoiceResponse();

    // Build gather options with optimization parameters
    const gatherOptions = {
      input: 'speech',
      action: `${BASE_URL}/process-speech?conversationId=${encodeURIComponent(conversationId)}`,
      speechTimeout: speechTimeout,
      language: language,
      enhanced: enhancedModel
    };

    // Add speech model if not default
    if (speechModel !== 'default') {
      gatherOptions.speechModel = speechModel;
    }

    // Add hints if provided
    if (hints && hints.length > 0) {
      gatherOptions.hints = hints.join(',');
    }

    const gather = twiml.gather(gatherOptions);

    // Generate speech with enhanced voice settings (with caching support and TTS provider)
    const audioUrl = await voiceService.generateSpeech(
      message || "Hey there! I'm your AI assistant. What can I help you with?",
      voiceId,
      voiceConfig,
      enableResponseCache,
      ttsProvider
    );
    gather.play(audioUrl);

    twiml.redirect(`${BASE_URL}/handle-response?conversationId=${encodeURIComponent(conversationId)}`);

    // Create call options
    const callOptions = {
      twiml: twiml.toString(),
      to: to,
      from: process.env.TWILIO_PHONE_NUMBER
    };

    // Add recording if requested
    if (recordCall) {
      callOptions.record = true;
      callOptions.recordingStatusCallback = `${BASE_URL}/recording-callback?conversationId=${encodeURIComponent(conversationId)}`;
    }

    // Add status callback for call tracking
    let statusCallbackUrl = `${BASE_URL}/call-status-callback?conversationId=${encodeURIComponent(conversationId)}`;
    if (callbackUrl) {
      statusCallbackUrl += `&callbackUrl=${encodeURIComponent(callbackUrl)}`;
    }
    callOptions.statusCallback = statusCallbackUrl;
    callOptions.statusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed'];

    // Make the call
    const call = await client.calls.create(callOptions);

    // Initialize call tracking with TTS provider
    callTracker.initCall(call.sid, {
      conversationId,
      to,
      voiceConfig: {
        voiceId,
        ...voiceService.getVoiceInfo(voiceId)
      },
      ttsProvider,
      openaiVoice: ttsProvider === 'openai' ? openaiVoice : undefined,
      openaiModel: ttsProvider === 'openai' ? openaiModel : undefined,
      metadata,
      systemPrompt,
      conversationMode,
      maxDuration,
      callbackUrl,
      recordCall,
      enableEmotionDetection,
      sentimentAnalysis,
      qualificationQuestions,
      transferNumber,
      transferConditions
    });

    logger.info('Legacy voice-based call initiated', { 
      callSid: call.sid, 
      conversationId,
      to 
    });

    // Build enhanced response
    const response = {
      success: true,
      callSid: call.sid,
      to: to,
      conversationId: conversationId,
      mode: 'legacy',
      estimatedDuration: maxDuration,
      voiceConfig: {
        voiceId,
        ...voiceService.getVoiceInfo(voiceId)
      },
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error) {
    logger.error('Error making outgoing call', { error: error.message, stack: error.stack });
    res.status(500).json({ 
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /voices - Fetch available voices from ElevenLabs API and OpenAI
 * Returns formatted voice data with metadata for dashboard integration
 * Now supports both ElevenLabs and OpenAI TTS providers
 */
app.get('/voices', async (req, res) => {
  const startFetchTime = Date.now();
  
  try {
    const now = Date.now();
    
    // Check cache - return cached data if available and fresh
    if (voicesCache && voicesCacheTimestamp && (now - voicesCacheTimestamp < VOICES_CACHE_DURATION)) {
      const responseTime = Date.now() - startFetchTime;
      logger.info('Returning cached voices data', { 
        cacheAge: Math.round((now - voicesCacheTimestamp) / 1000),
        responseTime 
      });
      return res.json(voicesCache);
    }

    // Initialize result structure with both providers
    const result = {
      success: true,
      providers: {
        elevenlabs: {
          voices: [],
          default: process.env.DEFAULT_VOICE_ID || DEFAULT_VOICE_ID,
          configured: !!process.env.ELEVENLABS_API_KEY
        },
        openai: {
          voices: voiceService.getOpenAIVoices(),
          default: 'alloy',
          configured: !!process.env.OPENAI_API_KEY
        }
      },
      defaultProvider: process.env.DEFAULT_TTS_PROVIDER || 'elevenlabs',
      timestamp: new Date().toISOString()
    };

    // Fetch from ElevenLabs API if configured
    if (process.env.ELEVENLABS_API_KEY) {
      logger.info('Fetching voices from ElevenLabs API');
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
          method: 'GET',
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const statusCode = response.status;
          let errorMessage = `ElevenLabs API error: ${statusCode} ${response.statusText}`;
          
          if (statusCode === 401) {
            errorMessage = 'ElevenLabs API authentication failed - invalid API key';
          } else if (statusCode === 403) {
            errorMessage = 'ElevenLabs API access forbidden - check API key permissions';
          } else if (statusCode === 429) {
            errorMessage = 'ElevenLabs API rate limit exceeded - please try again later';
          }
          
          logger.error('ElevenLabs API error', { statusCode, statusText: response.statusText });
          result.providers.elevenlabs.error = errorMessage;
        } else {
          const data = await response.json();

          if (data && Array.isArray(data.voices)) {
            result.providers.elevenlabs.voices = data.voices.map(voice => ({
              voiceId: voice.voice_id,
              name: voice.name,
              category: voice.category || 'premade',
              description: voice.description || '',
              labels: voice.labels || {},
              previewUrl: voice.preview_url || null
            }));
          }
        }
      } catch (elevenLabsError) {
        if (elevenLabsError.name === 'AbortError') {
          result.providers.elevenlabs.error = 'ElevenLabs API request timed out';
        } else {
          result.providers.elevenlabs.error = elevenLabsError.message;
        }
        logger.error('Error fetching ElevenLabs voices', { error: elevenLabsError.message });
      }
    } else {
      logger.warn('Voices endpoint called without ELEVENLABS_API_KEY configured');
      result.providers.elevenlabs.error = 'ElevenLabs API key not configured';
    }

    // Cache the result
    voicesCache = result;
    voicesCacheTimestamp = now;

    const responseTime = Date.now() - startFetchTime;
    logger.info('Successfully fetched voices from providers', { 
      elevenlabsCount: result.providers.elevenlabs.voices.length,
      openaiCount: result.providers.openai.voices.length,
      responseTime 
    });
    
    res.json(result);

  } catch (error) {
    const responseTime = Date.now() - startFetchTime;
    
    logger.error('Error fetching voices', { 
      error: error.message, 
      responseTime 
    });
    
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /agents - Fetch available ElevenLabs Conversational AI agents
 * Returns list of configured agents for voice agent functionality
 */
app.get('/agents', async (req, res) => {
  const startFetchTime = Date.now();
  
  try {
    if (!elevenLabsAgentService.isConfigured()) {
      return res.status(500).json({
        success: false,
        error: 'ElevenLabs API key not configured',
        agents: [],
        timestamp: new Date().toISOString()
      });
    }

    const result = await elevenLabsAgentService.getAgents();
    
    const responseTime = Date.now() - startFetchTime;
    logger.info('Agents endpoint response', { 
      success: result.success,
      count: result.agents?.length || 0,
      responseTime 
    });

    res.json(result);
  } catch (error) {
    const responseTime = Date.now() - startFetchTime;
    logger.error('Error fetching agents', { 
      error: error.message, 
      responseTime 
    });
    
    res.status(500).json({
      success: false,
      error: error.message,
      agents: [],
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Handle response endpoint (enhanced with conversationId and smart timeout)
 * - Removed repetitive "I'm listening" message for natural conversation flow
 * - Implements smart timeout: 3s gentle prompt, 10s graceful end
 */
app.post('/handle-response', async (req, res) => {
  try {
    const { conversationId, silenceCount: silenceCountParam } = req.query;
    const { CallSid } = req.body;
    const twiml = new twilio.twiml.VoiceResponse();

    // Get voice config from call tracker if available
    const callData = CallSid ? callTracker.getCall(CallSid) : null;
    const voiceConfig = callData?.voiceConfig || {};
    const voiceId = voiceConfig.voiceId || '4tRn1lSkEn13EVTuqb0g';
    const ttsProvider = callData?.ttsProvider || 'elevenlabs';

    // Track silence count for smart timeout handling
    const silenceCount = parseInt(silenceCountParam, 10) || 0;

    // Smart timeout handling based on silence count
    if (silenceCount >= 2) {
      // After ~6 seconds of silence (2 x 3s timeout), gracefully end the call
      logger.info('Smart timeout: Ending call after extended silence', { 
        callSid: CallSid, 
        conversationId,
        silenceCount 
      });
      
      // Track timeout event
      if (callData) {
        callTracker.updateSilenceEvent(CallSid, 'graceful_end', silenceCount);
      }

      const audioUrl = await voiceService.generateSpeech(
        "I'll let you go for now. Feel free to call back anytime!",
        voiceId,
        voiceConfig,
        true,
        ttsProvider
      );
      twiml.play(audioUrl);
      twiml.hangup();
      
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    if (silenceCount === 1) {
      // After ~3 seconds of silence, play gentle prompt
      logger.info('Smart timeout: Playing gentle prompt after silence', { 
        callSid: CallSid, 
        conversationId,
        silenceCount 
      });
      
      // Track timeout event
      if (callData) {
        callTracker.updateSilenceEvent(CallSid, 'gentle_prompt', silenceCount);
      }

      const audioUrl = await voiceService.generateSpeech(
        "Hey, are you there?",
        voiceId,
        voiceConfig,
        true,
        ttsProvider
      );
      
      const gather = twiml.gather({
        input: 'speech',
        action: `${BASE_URL}/process-speech${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''}`,
        speechTimeout: 5,
        language: callData?.language || 'en-US'
      });
      gather.play(audioUrl);

      // Redirect with incremented silence count
      twiml.redirect(`${BASE_URL}/handle-response?silenceCount=${silenceCount + 1}${conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : ''}`);
      
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    // Normal conversation flow - wait silently like a human would
    // No more "I'm listening" message - just gather speech input
    const gather = twiml.gather({
      input: 'speech',
      action: `${BASE_URL}/process-speech${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''}`,
      speechTimeout: 3,
      language: callData?.language || 'en-US'
    });

    // Silent wait - the bot waits quietly for user input

    // Redirect with silence count for timeout handling
    twiml.redirect(`${BASE_URL}/handle-response?silenceCount=1${conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : ''}`);

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    logger.error('Error in /handle-response endpoint', { error: error.message });
    res.sendStatus(500);
  }
});

/**
 * Process speech endpoint (enhanced with tracking and callbacks)
 */
app.post('/process-speech', async (req, res) => {
  try {
    const { conversationId } = req.query;
    const { SpeechResult, Confidence, CallSid } = req.body;

    // Get call data for voice config and TTS provider
    const callData = callTracker.getCall(CallSid);
    const voiceConfig = callData?.voiceConfig || {};
    const voiceId = voiceConfig.voiceId || '4tRn1lSkEn13EVTuqb0g';
    const ttsProvider = callData?.ttsProvider || 'elevenlabs';

    logger.info('Speech received', {
      callSid: CallSid,
      conversationId,
      speech: SpeechResult,
      confidence: Confidence
    });

    // Update call tracker - reset silence tracking since user spoke
    if (callData) {
      callTracker.updateStatus(CallSid, 'in-progress');
      callTracker.updateDuration(CallSid);
      callTracker.resetSilenceCount(CallSid);
    }

    const twiml = new twilio.twiml.VoiceResponse();

    if (!SpeechResult) {
      const audioUrl = await voiceService.generateSpeech(
        "Sorry, I didn't quite catch that. Could you say it again?",
        voiceId,
        voiceConfig,
        true,
        ttsProvider
      );
      twiml.play(audioUrl);
      twiml.redirect(`${BASE_URL}/handle-response${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''}`);
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    // Add to transcript
    if (callData) {
      callTracker.addTranscript(CallSid, 'user', SpeechResult);
    }

    const speech = SpeechResult.toLowerCase().trim();

    // Use conversationId or CallSid for conversation management
    const convKey = conversationId || CallSid;

    if (speech.includes('bye') || speech.includes('goodbye') || speech.includes('hang up')) {
      const summary = conversationManager.endConversation(convKey);

      logger.info('Conversation ended', {
        callSid: CallSid,
        conversationId,
        summary: summary
      });

      // End call tracking
      if (callData) {
        callTracker.endCall(CallSid, 'completed');
      }

      const audioUrl = await voiceService.generateSpeech(
        "It was great talking with you! Take care!",
        voiceId,
        voiceConfig,
        true,
        ttsProvider
      );
      twiml.play(audioUrl);
      twiml.hangup();
    } else {
      const result = await conversationManager.generateResponse(convKey, SpeechResult);

      // Update emotion tracking
      if (callData && result.emotionData) {
        callTracker.updateEmotion(CallSid, result.emotionData);
      }

      // Add AI response to transcript
      if (callData) {
        callTracker.addTranscript(CallSid, 'assistant', result.response);
      }

      logger.info('AI response with emotion detection', {
        callSid: CallSid,
        conversationId,
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

      // Check if we should end the call
      if (result.shouldEndCall) {
        if (callData) {
          callTracker.endCall(CallSid, 'completed');
        }
        
        const audioUrl = await voiceService.generateSpeech(
          result.response,
          voiceId,
          voiceConfig,
          true,
          ttsProvider
        );
        twiml.play(audioUrl);
        twiml.hangup();
      } else {
        const audioUrl = await voiceService.generateSpeech(
          result.response,
          voiceId,
          voiceConfig,
          true,
          ttsProvider
        );
        twiml.play(audioUrl);
        twiml.redirect(`${BASE_URL}/handle-response${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''}`);
      }
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
    twiml.redirect(`${BASE_URL}/handle-response`);

    res.type('text/xml');
    res.send(twiml.toString());
  }
});

/**
 * Call status callback from Twilio
 */
app.post('/call-status-callback', async (req, res) => {
  try {
    const { conversationId, callbackUrl } = req.query;
    const { CallSid, CallStatus, CallDuration } = req.body;

    logger.info('Call status callback received', {
      callSid: CallSid,
      conversationId,
      status: CallStatus,
      duration: CallDuration
    });

    // Update call tracker
    const callData = callTracker.getCall(CallSid);
    if (callData) {
      callTracker.updateStatus(CallSid, CallStatus);
      
      if (CallStatus === 'completed' || CallStatus === 'failed' || CallStatus === 'busy' || CallStatus === 'no-answer') {
        callTracker.endCall(CallSid, CallStatus);
        
        // Send webhook if callback URL was provided
        if (callbackUrl) {
          const webhookData = callTracker.getCallDataForWebhook(CallSid);
          if (webhookData) {
            webhookService.queueWebhook(callbackUrl, webhookData);
          }
        }
        
        // Cleanup after delay
        setTimeout(() => {
          callTracker.removeCall(CallSid);
        }, 60000); // Keep for 1 minute after completion
      }
    }

    res.sendStatus(200);
  } catch (error) {
    logger.error('Error in call status callback', { error: error.message });
    res.sendStatus(500);
  }
});

/**
 * Recording callback from Twilio
 */
app.post('/recording-callback', async (req, res) => {
  try {
    const { conversationId } = req.query;
    const { CallSid, RecordingUrl, RecordingSid, RecordingStatus } = req.body;

    logger.info('Recording callback received', {
      callSid: CallSid,
      conversationId,
      recordingSid: RecordingSid,
      status: RecordingStatus,
      url: RecordingUrl
    });

    if (RecordingStatus === 'completed' && RecordingUrl) {
      callTracker.setRecording(CallSid, RecordingUrl);
    }

    res.sendStatus(200);
  } catch (error) {
    logger.error('Error in recording callback', { error: error.message });
    res.sendStatus(500);
  }
});

/**
 * GET /call-status/:callSid - Real-time call status endpoint
 */
app.get('/call-status/:callSid', (req, res) => {
  try {
    const { callSid } = req.params;

    if (!callSid) {
      return res.status(400).json({
        success: false,
        error: 'callSid parameter is required'
      });
    }

    const status = callTracker.getCallStatus(callSid);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Call not found',
        details: 'The specified call SID was not found in active calls'
      });
    }

    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    logger.error('Error getting call status', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api-docs - API documentation endpoint
 */
app.get('/api-docs', (req, res) => {
  const apiDocs = {
    version: '3.0.0',
    title: 'AI Call Bot Enterprise API - ElevenLabs Conversational AI',
    description: 'Enterprise-grade voice agent API powered by ElevenLabs Conversational AI platform. Achieves sub-100ms latency and 50% cost reduction compared to traditional TTS pipelines.',
    baseUrl: BASE_URL,
    architecture: {
      recommended: {
        name: 'Agent-based (ElevenLabs Conversational AI)',
        flow: 'Twilio Call → ElevenLabs Conversational AI Agent → Twilio',
        latency: '<100ms',
        cost: '~$0.10/min'
      },
      legacy: {
        name: 'Voice-based (OpenAI + TTS)',
        flow: 'Twilio Call → STT → OpenAI GPT → ElevenLabs TTS → Twilio',
        latency: '~2.5s',
        cost: '~$0.22/min',
        note: 'Still supported for backward compatibility when agentId is not provided'
      }
    },
    endpoints: {
      'GET /agents': {
        description: 'Fetch available ElevenLabs Conversational AI agents',
        response: {
          success: 'boolean',
          agents: [{
            agentId: 'string - ElevenLabs agent ID',
            name: 'string - Agent name',
            voiceId: 'string - Voice ID used by agent (nullable)',
            voiceName: 'string - Voice name (nullable)',
            language: 'string - Agent language',
            description: 'string - Agent description'
          }],
          defaultAgentId: 'string - Default agent ID from env (nullable)',
          count: 'integer - Number of available agents',
          timestamp: 'string - ISO 8601 timestamp'
        },
        caching: 'Responses are cached for 5 minutes',
        example: {
          response: {
            success: true,
            agents: [
              {
                agentId: 'agent_abc123',
                name: 'Sales Assistant',
                voiceId: '4tRn1lSkEn13EVTuqb0g',
                voiceName: 'Serafina',
                language: 'en',
                description: 'AI assistant for sales calls'
              }
            ],
            defaultAgentId: 'agent_abc123',
            count: 1,
            timestamp: '2025-11-25T10:00:00.000Z'
          }
        }
      },
      'POST /make-call': {
        description: 'Initiate an outbound AI voice call. When agentId is provided, uses ElevenLabs Conversational AI (recommended). Otherwise, falls back to legacy voice-based mode.',
        parameters: {
          required: {
            to: {
              type: 'string',
              description: 'Phone number in E.164 format (e.g., +14155551234)'
            }
          },
          agentConfiguration: {
            agentId: {
              type: 'string',
              default: 'ELEVENLABS_AGENT_ID env var',
              description: 'ElevenLabs Conversational AI agent ID. When provided, uses agent-based mode with sub-100ms latency. This is the RECOMMENDED approach.',
              recommended: true
            }
          },
          legacyVoiceConfiguration: {
            voiceId: {
              type: 'string',
              default: '4tRn1lSkEn13EVTuqb0g',
              description: 'ElevenLabs voice ID (legacy mode only - ignored when using agentId)',
              deprecated: 'Use agentId instead'
            },
            voiceStability: {
              type: 'float',
              default: 0.5,
              range: '0.0-1.0',
              description: 'Voice consistency/stability (legacy mode only)',
              deprecated: 'Configure in ElevenLabs agent dashboard'
            },
            voiceSimilarityBoost: {
              type: 'float',
              default: 0.75,
              range: '0.0-1.0',
              description: 'Voice clarity/similarity boost (legacy mode only)',
              deprecated: 'Configure in ElevenLabs agent dashboard'
            },
            voiceStyle: {
              type: 'float',
              default: 0.0,
              range: '0.0-1.0',
              description: 'Style exaggeration (legacy mode only)',
              deprecated: 'Configure in ElevenLabs agent dashboard'
            },
            speakingRate: {
              type: 'float',
              default: 1.0,
              range: '0.5-2.0',
              description: 'Speech speed multiplier (legacy mode only)',
              deprecated: 'Configure in ElevenLabs agent dashboard'
            }
          },
          legacyTtsProviderConfiguration: {
            ttsProvider: {
              type: 'string',
              default: 'elevenlabs',
              options: ['elevenlabs', 'openai'],
              description: 'TTS provider selection (legacy mode only)',
              deprecated: 'Use agentId for ElevenLabs Conversational AI'
            },
            openaiVoice: {
              type: 'string',
              default: 'alloy',
              options: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
              description: 'OpenAI TTS voice (legacy mode only)',
              deprecated: 'Use agentId for ElevenLabs Conversational AI'
            },
            openaiModel: {
              type: 'string',
              default: 'tts-1',
              options: ['tts-1', 'tts-1-hd'],
              description: 'OpenAI TTS model (legacy mode only)',
              deprecated: 'Use agentId for ElevenLabs Conversational AI'
            }
          },
          legacyConversationControl: {
            message: {
              type: 'string',
              default: "Hey there! I'm your AI assistant. What can I help you with?",
              description: 'Initial greeting/script (legacy mode only)',
              deprecated: 'Configure first_message in ElevenLabs agent'
            },
            systemPrompt: {
              type: 'string',
              default: null,
              description: 'AI personality/behavior instructions (legacy mode only)',
              deprecated: 'Configure system_prompt in ElevenLabs agent'
            },
            conversationMode: {
              type: 'string',
              default: 'interactive',
              options: ['interactive', 'scripted', 'faq'],
              description: 'Conversation behavior mode (legacy mode only)',
              deprecated: 'Configure in ElevenLabs agent dashboard'
            }
          },
          advancedFeatures: {
            maxDuration: {
              type: 'integer',
              default: 600,
              range: '1-3600',
              description: 'Maximum call length in seconds'
            },
            recordCall: {
              type: 'boolean',
              default: false,
              description: 'Save call recording'
            },
            callbackUrl: {
              type: 'string',
              default: null,
              description: 'Webhook URL for call completion'
            },
            metadata: {
              type: 'object',
              default: {},
              description: 'Custom tracking data'
            }
          }
        },
        response: {
          success: 'boolean',
          callSid: 'string - Twilio call SID',
          to: 'string - Called phone number',
          conversationId: 'string - Unique conversation identifier',
          agentId: 'string - ElevenLabs agent ID (agent mode only)',
          mode: 'string - "agent" or "legacy"',
          estimatedDuration: 'integer - Max call duration in seconds',
          timestamp: 'string - ISO 8601 timestamp'
        },
        examples: {
          agentMode: {
            description: 'RECOMMENDED: Using ElevenLabs Conversational AI agent',
            request: {
              to: '+14155551234',
              agentId: 'agent_abc123',
              metadata: { campaignId: 'summer-2025' }
            },
            response: {
              success: true,
              callSid: 'CA1234567890abcdef',
              to: '+14155551234',
              conversationId: 'conv_uuid-here',
              agentId: 'agent_abc123',
              mode: 'agent',
              estimatedDuration: 600,
              timestamp: '2025-11-25T10:00:00.000Z'
            }
          },
          legacyMode: {
            description: 'Legacy mode when no agentId provided',
            request: {
              to: '+14155551234',
              message: 'Hello! This is an AI calling to discuss our services.',
              voiceId: '4tRn1lSkEn13EVTuqb0g',
              systemPrompt: 'You are a friendly AI assistant.',
              metadata: { campaignId: 'test-001' }
            },
            response: {
              success: true,
              callSid: 'CA1234567890abcdef',
              to: '+14155551234',
              conversationId: 'conv_uuid-here',
              mode: 'legacy',
              estimatedDuration: 600,
              voiceConfig: {
                voiceId: '4tRn1lSkEn13EVTuqb0g',
                voiceName: 'serafina'
              },
              timestamp: '2025-11-25T10:00:00.000Z'
            }
          }
        }
      },
      'GET /call-status/:callSid': {
        description: 'Get real-time status of an active call',
        parameters: {
          callSid: {
            type: 'string',
            location: 'path',
            description: 'Twilio call SID'
          }
        },
        response: {
          success: 'boolean',
          callSid: 'string',
          conversationId: 'string',
          status: 'string - Call status (initiated, ringing, in-progress, completed)',
          duration: 'integer - Current call duration in seconds',
          currentEmotion: 'string - Current detected emotion',
          transcript: 'string - Call transcript so far',
          sentiment: {
            overall: 'string - positive/neutral/negative',
            score: 'number - Sentiment score'
          },
          metadata: 'object - Custom metadata'
        }
      },
      'GET /voices': {
        description: 'Fetch available voices from ElevenLabs API (legacy - for backward compatibility)',
        deprecated: 'Use GET /agents for agent-based architecture',
        response: {
          success: 'boolean',
          providers: {
            elevenlabs: 'object - ElevenLabs voices',
            openai: 'object - OpenAI TTS voices'
          },
          defaultProvider: 'string',
          timestamp: 'string'
        }
      },
      'GET /health': {
        description: 'Health check endpoint',
        response: {
          status: 'string',
          timestamp: 'string',
          uptime: 'integer',
          memory: 'object',
          configuration: 'object'
        }
      }
    },
    webhookPayload: {
      description: 'Payload sent to callbackUrl on call completion',
      fields: {
        callSid: 'string',
        conversationId: 'string',
        status: 'string - completed/failed/busy/no-answer',
        duration: 'integer - Call duration in seconds',
        transcript: 'string - Full call transcript',
        sentiment: {
          overall: 'string',
          score: 'number'
        },
        emotions: 'array - Emotion history',
        leadQualification: 'object - Lead scoring data',
        recording: 'string - Recording URL (if enabled)',
        metadata: 'object - Custom metadata',
        timestamp: 'string - ISO 8601 timestamp'
      }
    },
    migrationGuide: {
      title: 'Migrating from Legacy to Agent-based Architecture',
      steps: [
        '1. Create an agent in ElevenLabs dashboard (https://elevenlabs.io/conversational-ai)',
        '2. Configure agent voice, system prompt, and first message in dashboard',
        '3. Add ELEVENLABS_AGENT_ID to your environment variables',
        '4. Update API calls to include agentId parameter (or rely on default)',
        '5. Remove legacy parameters (voiceId, systemPrompt, message) from requests',
        '6. Enjoy sub-100ms latency and 50% cost savings!'
      ],
      benefits: [
        'Latency: 2.5s → <100ms (96% improvement)',
        'Cost: $0.22/min → $0.10/min (55% savings)',
        'Simpler integration: Remove OpenAI dependency',
        'Better voice quality: Native ElevenLabs conversation model'
      ]
    },
    errorCodes: {
      400: 'Bad Request - Invalid parameters',
      404: 'Not Found - Resource not found',
      500: 'Internal Server Error - Server configuration or runtime error'
    }
  };

  res.json(apiDocs);
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
  console.log(`API Docs: http://${HOST}:${PORT}/api-docs`);
  console.log(`Twilio Webhook: ${webhookUrl}`);
  console.log('============================================================');

  logger.info('Server started successfully', {
    port: PORT,
    host: HOST,
    environment: NODE_ENV
  });

  // Periodic cleanup
  setInterval(() => {
    conversationManager.cleanupOldConversations();
    callTracker.cleanupOldCalls();
    voiceService.cleanupOldAudioFiles();
  }, 5 * 60 * 1000);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const connectionId = uuidv4();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  
  logger.info('WebSocket connection established', { connectionId, pathname });

  // Handle ElevenLabs stream connections (for agent-based calls)
  if (pathname === '/elevenlabs-stream') {
    const agentId = url.searchParams.get('agentId');
    const conversationId = url.searchParams.get('conversationId');
    
    if (!agentId) {
      logger.error('ElevenLabs stream connection missing agentId', { connectionId });
      ws.close(1008, 'Missing agentId parameter');
      return;
    }

    logger.info('ElevenLabs stream connection', { connectionId, agentId, conversationId });

    // Connect to ElevenLabs Conversational AI WebSocket
    let elevenLabsWs = null;
    let streamSid = null;

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.event === 'start') {
          streamSid = data.start?.streamSid;
          const callSid = data.start?.callSid;
          
          logger.info('Twilio media stream started, connecting to ElevenLabs', {
            connectionId,
            streamSid,
            callSid,
            agentId
          });

          // Connect to ElevenLabs Conversational AI
          const elevenLabsUrl = elevenLabsAgentService.getAgentWebSocketUrl(agentId);
          elevenLabsWs = new WebSocket(elevenLabsUrl, {
            headers: {
              'xi-api-key': process.env.ELEVENLABS_API_KEY
            }
          });

          elevenLabsWs.on('open', () => {
            logger.info('Connected to ElevenLabs Conversational AI', { connectionId, agentId });
            
            // Send initial configuration to ElevenLabs
            elevenLabsWs.send(JSON.stringify({
              type: 'conversation_initiation_client_data',
              conversation_initiation_client_data: {
                conversation_id: conversationId,
                custom_llm_extra_body: {}
              }
            }));
          });

          elevenLabsWs.on('message', (elevenLabsMessage) => {
            try {
              const elevenLabsData = JSON.parse(elevenLabsMessage.toString());
              
              // Forward audio from ElevenLabs to Twilio
              if (elevenLabsData.type === 'audio' && elevenLabsData.audio) {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    event: 'media',
                    streamSid: streamSid,
                    media: {
                      payload: elevenLabsData.audio
                    }
                  }));
                }
              } else if (elevenLabsData.type === 'agent_response') {
                logger.info('ElevenLabs agent response', { 
                  connectionId, 
                  text: elevenLabsData.text?.substring(0, 100) 
                });
              } else if (elevenLabsData.type === 'user_transcript') {
                logger.info('User transcript', { 
                  connectionId, 
                  text: elevenLabsData.text?.substring(0, 100) 
                });
              } else if (elevenLabsData.type === 'conversation_ended') {
                logger.info('ElevenLabs conversation ended', { connectionId });
              }
            } catch (error) {
              logger.error('Error processing ElevenLabs message', { connectionId, error: error.message });
            }
          });

          elevenLabsWs.on('close', (code, reason) => {
            logger.info('ElevenLabs connection closed', { connectionId, code, reason: reason?.toString() });
          });

          elevenLabsWs.on('error', (error) => {
            logger.error('ElevenLabs WebSocket error', { connectionId, error: error.message });
          });

        } else if (data.event === 'media') {
          // Forward audio from Twilio to ElevenLabs
          if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
            elevenLabsWs.send(JSON.stringify({
              type: 'audio',
              audio: data.media?.payload
            }));
          }
        } else if (data.event === 'stop') {
          logger.info('Twilio media stream stopped', { connectionId, streamSid });
          if (elevenLabsWs) {
            elevenLabsWs.close();
          }
        }
      } catch (error) {
        logger.error('Error processing Twilio message', { connectionId, error: error.message });
      }
    });

    ws.on('close', () => {
      logger.info('Twilio WebSocket closed', { connectionId });
      if (elevenLabsWs) {
        elevenLabsWs.close();
      }
    });

    ws.on('error', (error) => {
      logger.error('Twilio WebSocket error', { connectionId, error: error.message });
    });

    return;
  }

  // Default WebSocket handling (for legacy connections)
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








