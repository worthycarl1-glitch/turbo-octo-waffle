/**
 * @deprecated LEGACY SERVICE - Use ElevenLabs Conversational AI agents instead
 * 
 * This conversation manager is part of the legacy voice-based architecture:
 *   Twilio → STT → OpenAI GPT → ElevenLabs TTS → Twilio
 * 
 * The recommended approach is to use ElevenLabs Conversational AI agents:
 *   Twilio → ElevenLabs Conversational AI Agent → Twilio
 * 
 * Benefits of agent-based architecture:
 *   - Latency: 2.5s → <100ms (96% improvement)
 *   - Cost: $0.22/min → $0.10/min (55% savings)
 *   - Simpler integration: No OpenAI API calls required
 * 
 * To migrate: Set ELEVENLABS_AGENT_ID in your environment and pass agentId
 * to the /make-call endpoint.
 * 
 * This service is kept for backward compatibility with legacy implementations.
 */

const OpenAI = require('openai');
const emotionDetector = require('./emotionDetector');

class ConversationManager {
  constructor() {
    this.conversations = new Map();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.tokenUsage = new Map();

    // Sales-focused system prompt for appointment setting
    this.baseSystemPrompt = `You are a professional appointment setter calling business owners to schedule meetings for advertising sales representatives.

YOUR ROLE:
- You work for an advertising company
- Your goal is to set appointments for sales reps to present advertising packages
- You are calling business owners who may be busy or skeptical

PERSONALITY:
- Professional but friendly and conversational
- Respectful of their time
- Quick to read the room and know when to exit gracefully

CONVERSATION RULES:
1. Keep responses VERY brief (1-2 sentences max) - this is a phone call
2. Be natural and conversational, use contractions
3. Get to the point quickly - business owners are busy
4. If they're interested, get their availability for a meeting
5. If they're clearly not interested, politely exit
6. NEVER be pushy or aggressive

EMOTIONAL INTELLIGENCE - WHEN TO EXIT:
- If caller is RUDE, CONDESCENDING, or SARCASTIC → End the call politely
- If caller says "not interested" multiple times → Exit gracefully
- If caller is hostile or aggressive → End immediately
- If conversation is going nowhere after 3-4 exchanges → Exit politely

POLITE EXIT PHRASES (use these when needed):
- "Well alright, thank you so much for your time!"
- "I completely understand. Thanks for taking my call!"
- "No problem at all! Have a great day!"
- "I appreciate you letting me know. Take care!"

Remember: This is outbound sales. Not everyone will be interested. Know when to move on professionally.`;
  }

  cleanSpeech(text) {
    const fillerWords = /\b(um|uh|uhm|er|ah|like|you know|i mean|sort of|kind of)\b/gi;
    return text
      .replace(fillerWords, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Initialize conversation with enhanced configuration
   * @param {string} callSid - Twilio call SID
   * @param {object} config - Enhanced conversation configuration
   */
  initConversation(callSid, config = {}) {
    const conversation = {
      history: [],
      startTime: Date.now(),
      turnCount: 0,
      emotions: [],
      totalTokens: 0,
      rejectionCount: 0,
      shouldExit: false,
      // Enhanced configuration
      customSystemPrompt: config.systemPrompt || null,
      conversationMode: config.conversationMode || 'interactive',
      maxDuration: config.maxDuration || 600,
      metadata: config.metadata || {},
      language: config.language || 'en-US',
      enableEmotionDetection: config.enableEmotionDetection !== false,
      enableInterruptions: config.enableInterruptions !== false,
      sentimentAnalysis: config.sentimentAnalysis !== false,
      qualificationQuestions: config.qualificationQuestions || [],
      transferNumber: config.transferNumber || null,
      transferConditions: config.transferConditions || [],
      // Performance optimization parameters
      model: config.model || 'gpt-4o-mini',
      maxTokens: config.maxTokens || 150,
      temperature: config.temperature !== undefined ? config.temperature : 0.7
    };
    
    this.conversations.set(callSid, conversation);
    
    console.log('Conversation initialized:', {
      callSid,
      conversationMode: conversation.conversationMode,
      maxDuration: conversation.maxDuration,
      hasCustomPrompt: !!conversation.customSystemPrompt,
      metadata: conversation.metadata,
      // Log optimization params
      model: conversation.model,
      maxTokens: conversation.maxTokens,
      temperature: conversation.temperature
    });
    
    return conversation;
  }

  getConversation(callSid) {
    if (!this.conversations.has(callSid)) {
      this.conversations.set(callSid, {
        history: [],
        startTime: Date.now(),
        turnCount: 0,
        emotions: [],
        totalTokens: 0,
        rejectionCount: 0,
        shouldExit: false,
        // Default enhanced configuration
        customSystemPrompt: null,
        conversationMode: 'interactive',
        maxDuration: 600,
        metadata: {},
        language: 'en-US',
        enableEmotionDetection: true,
        enableInterruptions: true,
        sentimentAnalysis: true,
        qualificationQuestions: [],
        transferNumber: null,
        transferConditions: [],
        // Performance optimization parameters
        model: 'gpt-4o-mini',
        maxTokens: 150,
        temperature: 0.7
      });
    }
    return this.conversations.get(callSid);
  }

  /**
   * Check if call has exceeded max duration
   * @param {string} callSid 
   */
  isMaxDurationExceeded(callSid) {
    if (!this.conversations.has(callSid)) {
      return false;
    }
    const conversation = this.conversations.get(callSid);
    const elapsedSeconds = (Date.now() - conversation.startTime) / 1000;
    return elapsedSeconds >= conversation.maxDuration;
  }

  /**
   * Get conversation metadata
   * @param {string} callSid 
   */
  getMetadata(callSid) {
    if (!this.conversations.has(callSid)) {
      return {};
    }
    const conversation = this.conversations.get(callSid);
    return conversation.metadata;
  }

  /**
   * Update conversation metadata
   * @param {string} callSid 
   * @param {object} metadata 
   */
  updateMetadata(callSid, metadata) {
    const conversation = this.getConversation(callSid);
    conversation.metadata = { ...conversation.metadata, ...metadata };
    return conversation.metadata;
  }

  addToHistory(callSid, role, content) {
    const conversation = this.getConversation(callSid);
    conversation.history.push({ role, content, timestamp: Date.now() });
    conversation.turnCount++;

    if (conversation.history.length > 10) {
      conversation.history = conversation.history.slice(-10);
    }
  }

  shouldExitCall(callSid, userInput, emotionData) {
    const conversation = this.getConversation(callSid);
    const input = userInput.toLowerCase();

    // Check for explicit rejection phrases
    const rejectionPhrases = [
      'not interested',
      "don't call",
      'remove me',
      'take me off',
      'stop calling',
      'never call',
      'no thanks',
      'not now'
    ];

    const isRejection = rejectionPhrases.some(phrase => input.includes(phrase));
    if (isRejection) {
      conversation.rejectionCount++;
    }

    // Exit if rejected multiple times
    if (conversation.rejectionCount >= 2) {
      return true;
    }

    // Exit if caller is hostile or very negative
    if (emotionData.emotion === 'very_negative' && emotionData.intensity === 'high') {
      return true;
    }

    // Exit if conversation is going nowhere (too many turns with no progress)
    if (conversation.turnCount >= 6 && conversation.rejectionCount > 0) {
      return true;
    }

    // Check for sarcasm or condescending tone
    const sarcasticPhrases = [
      'wow really',
      'oh great',
      'sure thing',
      'yeah right',
      'sounds amazing',
      'how exciting'
    ];
    const isSarcastic = sarcasticPhrases.some(phrase => input.includes(phrase)) && 
                        emotionData.emotion === 'negative';
    
    if (isSarcastic) {
      return true;
    }

    return false;
  }

  getRecentContext(callSid, count = 3) {
    const conversation = this.getConversation(callSid);
    const userMessages = conversation.history
      .filter(msg => msg.role === 'user')
      .slice(-count);

    return userMessages.map(msg => msg.content);
  }

  async generateResponse(callSid, userInput) {
    const cleanedInput = this.cleanSpeech(userInput);
    const emotionData = emotionDetector.detectEmotion(cleanedInput, callSid);
    const conversation = this.getConversation(callSid);

    // Check if we should exit the call
    if (this.shouldExitCall(callSid, cleanedInput, emotionData)) {
      conversation.shouldExit = true;
      const exitResponses = [
        "Well alright, thank you so much for your time!",
        "I completely understand. Thanks for taking my call!",
        "No problem at all! Have a great day!",
        "I appreciate you letting me know. Take care!"
      ];
      const exitResponse = exitResponses[Math.floor(Math.random() * exitResponses.length)];
      
      return {
        response: exitResponse,
        shouldEndCall: true,
        emotionData: {
          emotion: emotionData.emotion,
          intensity: emotionData.intensity,
          tone: 'exiting',
          trend: 'ending'
        },
        tokenUsage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          conversation_total: conversation.totalTokens
        }
      };
    }

    conversation.emotions.push({
      emotion: emotionData.emotion,
      score: emotionData.score,
      timestamp: Date.now()
    });

    if (conversation.emotions.length > 5) {
      conversation.emotions.shift();
    }

    this.addToHistory(callSid, 'user', cleanedInput);

    const emotionModifier = emotionDetector.getEmotionModifier(emotionData);
    const emotionalTrend = emotionDetector.getEmotionalTrend(callSid);

    // Use custom system prompt if provided, otherwise use base
    let systemPrompt = conversation.customSystemPrompt || this.baseSystemPrompt;
    systemPrompt += '\n\n';
    
    // Add emotion context if emotion detection is enabled
    if (conversation.enableEmotionDetection) {
      systemPrompt += `CURRENT CALLER EMOTIONAL STATE:\n${emotionModifier.modifier}\n`;

      if (emotionalTrend !== 'stable') {
        systemPrompt += `\nEMOTIONAL TREND: The caller's mood is ${emotionalTrend}. `;
        if (emotionalTrend === 'improving') {
          systemPrompt += 'They seem more receptive. This is a good sign!';
        } else {
          systemPrompt += 'They seem less interested. Consider wrapping up politely.';
        }
      }
    }
    
    // Add conversation mode instructions
    if (conversation.conversationMode === 'scripted') {
      systemPrompt += '\n\nCONVERSATION MODE: Scripted - Follow the provided script closely.';
    } else if (conversation.conversationMode === 'faq') {
      systemPrompt += '\n\nCONVERSATION MODE: FAQ - Focus on answering questions directly and concisely.';
    }

    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    const recentHistory = conversation.history.slice(-10);
    messages.push(...recentHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    }))); 

    try {
      // Use conversation's temperature with emotion-based adjustments
      let adjustedTemperature = conversation.temperature;
      if (emotionData.emotion === 'positive') {
        adjustedTemperature = Math.min(2.0, adjustedTemperature + 0.1);
      } else if (emotionData.emotion === 'frustrated' || emotionData.emotion === 'very_negative') {
        adjustedTemperature = Math.max(0.0, adjustedTemperature - 0.2);
      }

      const completion = await this.openai.chat.completions.create({
        model: conversation.model,
        messages: messages,
        max_tokens: conversation.maxTokens,
        temperature: adjustedTemperature,
        presence_penalty: 0.6,
        frequency_penalty: 0.3
      });

      const response = completion.choices[0].message.content.trim();
      const usage = completion.usage;

      conversation.totalTokens += usage.total_tokens;

      this.addToHistory(callSid, 'assistant', response);

      return {
        response,
        shouldEndCall: false,
        emotionData: {
          emotion: emotionData.emotion,
          intensity: emotionData.intensity,
          tone: emotionModifier.tone,
          trend: emotionalTrend
        },
        tokenUsage: {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens,
          conversation_total: conversation.totalTokens
        }
      };
    } catch (error) {
      console.error('OpenAI API error:', error);

      const fallbackResponses = this.getEmotionalFallback(emotionData.emotion);
      const fallback = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];

      this.addToHistory(callSid, 'assistant', fallback);

      return {
        response: fallback,
        shouldEndCall: false,
        emotionData: {
          emotion: emotionData.emotion,
          intensity: emotionData.intensity,
          tone: emotionModifier.tone,
          trend: emotionalTrend
        },
        tokenUsage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          conversation_total: conversation.totalTokens,
          error: true
        }
      };
    }
  }

  getEmotionalFallback(emotion) {
    const fallbacks = {
      'very_negative': [
        "I understand. Thanks for your time!",
        "No problem at all. Have a good day!",
        "I appreciate you letting me know."
      ],
      'frustrated': [
        "I completely get it. Thanks anyway!",
        "No worries at all. Take care!",
        "I understand. Thanks for listening!"
      ],
      'neutral': [
        "I hear you. Would a quick meeting work for you?",
        "Makes sense. When might be a better time?",
        "I understand. Can I share just one quick detail?"
      ],
      'positive': [
        "Great! When would work best for you?",
        "Awesome! What day looks good for a meeting?",
        "Perfect! Let's get something on the calendar."
      ],
      'excited': [
        "That's great to hear! When can we meet?",
        "Excellent! What time works for you?",
        "Wonderful! Let's set up a time to talk more!"
      ]
    };

    return fallbacks[emotion] || fallbacks['neutral'];
  }

  getConversationSummary(callSid) {
    const conversation = this.getConversation(callSid);
    const duration = Math.floor((Date.now() - conversation.startTime) / 1000);

    return {
      turns: conversation.turnCount,
      duration: duration,
      rejections: conversation.rejectionCount,
      topicsDiscussed: this.getRecentContext(callSid, 5),
      totalTokensUsed: conversation.totalTokens,
      outcome: conversation.shouldExit ? 'not_interested' : 'completed',
      // Enhanced summary data
      conversationMode: conversation.conversationMode,
      metadata: conversation.metadata,
      emotions: conversation.emotions,
      transcript: conversation.history.map(h => ({ role: h.role, content: h.content }))
    };
  }

  endConversation(callSid) {
    const summary = this.getConversationSummary(callSid);
    emotionDetector.clearHistory(callSid);
    this.conversations.delete(callSid);
    return summary;
  }

  cleanupOldConversations() {
    const maxAge = 30 * 60 * 1000;
    const now = Date.now();

    for (const [callSid, conversation] of this.conversations.entries()) {
      if (now - conversation.startTime > maxAge) {
        this.conversations.delete(callSid);
      }
    }

    emotionDetector.cleanupOldHistory();
  }
}

module.exports = new ConversationManager();