const OpenAI = require('openai');
const emotionDetector = require('./emotionDetector');

class ConversationManager {
  constructor() {
    this.conversations = new Map();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.tokenUsage = new Map();

    this.baseSystemPrompt = `You are a helpful phone assistant having a natural conversation.

IMPORTANT RULES:
- Keep responses under 2 sentences for natural phone conversation flow
- Be conversational and friendly
- Speak naturally like a real person would on the phone
- Use contractions and casual language
- Be empathetic and match the caller's emotional tone
- Reference previous parts of the conversation to show you're listening
- Avoid being robotic or overly formal

Remember: This is a phone call. Keep it brief, natural, and engaging!`;
  }

  cleanSpeech(text) {
    const fillerWords = /\b(um|uh|uhm|er|ah|like|you know|i mean|sort of|kind of)\b/gi;
    return text
      .replace(fillerWords, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  getConversation(callSid) {
    if (!this.conversations.has(callSid)) {
      this.conversations.set(callSid, {
        history: [],
        startTime: Date.now(),
        turnCount: 0,
        emotions: [],
        totalTokens: 0
      });
    }
    return this.conversations.get(callSid);
  }

  addToHistory(callSid, role, content) {
    const conversation = this.getConversation(callSid);
    conversation.history.push({ role, content, timestamp: Date.now() });
    conversation.turnCount++;

    if (conversation.history.length > 10) {
      conversation.history = conversation.history.slice(-10);
    }
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

    let systemPrompt = this.baseSystemPrompt + '\n\n';
    systemPrompt += `CURRENT CALLER EMOTIONAL STATE:\n${emotionModifier.modifier}\n`;

    if (emotionalTrend !== 'stable') {
      systemPrompt += `\nEMOTIONAL TREND: The caller's mood is ${emotionalTrend}. `;
      if (emotionalTrend === 'improving') {
        systemPrompt += 'They seem to be feeling better. Keep up the positive energy!';
      } else {
        systemPrompt += 'They seem to be getting more upset. Be extra patient and understanding.';
      }
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
      let temperature = 0.7;
      if (emotionData.emotion === 'excited' && emotionData.intensity === 'high') {
        temperature = 0.8;
      } else if (emotionData.emotion === 'frustrated' || emotionData.emotion === 'very_negative') {
        temperature = 0.5;
      }

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: messages,
        max_tokens: 100,
        temperature: temperature,
        presence_penalty: 0.6,
        frequency_penalty: 0.3
      });

      const response = completion.choices[0].message.content.trim();
      const usage = completion.usage;

      conversation.totalTokens += usage.total_tokens;

      this.addToHistory(callSid, 'assistant', response);

      return {
        response,
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
        "I really understand how frustrating this must be for you.",
        "That sounds really tough. I'm here to help however I can.",
        "I hear you, and I want to make sure we address this properly."
      ],
      'frustrated': [
        "I totally get why that would be frustrating.",
        "That's a valid concern. Let's work through this together.",
        "I understand. Tell me more so I can help better."
      ],
      'neutral': [
        "That's interesting! Tell me more about that.",
        "I'm listening. What else is on your mind?",
        "I see. How do you feel about that?"
      ],
      'positive': [
        "That sounds great! I'm glad to hear that!",
        "Oh nice! Tell me more about that!",
        "That's awesome! What else is going well?"
      ],
      'excited': [
        "That's so exciting! I love your energy!",
        "Wow! That sounds amazing!",
        "Yes! That's fantastic! Tell me everything!"
      ]
    };

    return fallbacks[emotion] || fallbacks['neutral'];
  }

  shouldAskFollowUp(callSid) {
    const conversation = this.getConversation(callSid);

    if (conversation.turnCount < 2) return false;

    const lastAssistantMsg = conversation.history
      .slice()
      .reverse()
      .find(msg => msg.role === 'assistant');

    if (lastAssistantMsg && lastAssistantMsg.content.includes('?')) {
      return false;
    }

    return conversation.turnCount % 3 === 0;
  }

  getConversationSummary(callSid) {
    const conversation = this.getConversation(callSid);
    const duration = Math.floor((Date.now() - conversation.startTime) / 1000);

    return {
      turns: conversation.turnCount,
      duration: duration,
      topicsDiscussed: this.getRecentContext(callSid, 5),
      totalTokensUsed: conversation.totalTokens
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
