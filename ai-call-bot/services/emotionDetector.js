const Sentiment = require('sentiment');

class EmotionDetector {
  constructor() {
    this.sentiment = new Sentiment();
    this.emotionHistory = new Map();
  }

  detectEmotion(text, callSid) {
    const result = this.sentiment.analyze(text);

    const emotion = this.classifyEmotion(result);

    if (!this.emotionHistory.has(callSid)) {
      this.emotionHistory.set(callSid, []);
    }

    const history = this.emotionHistory.get(callSid);
    history.push({
      emotion,
      score: result.score,
      comparative: result.comparative,
      timestamp: Date.now()
    });

    if (history.length > 5) {
      history.shift();
    }

    return {
      emotion,
      score: result.score,
      comparative: result.comparative,
      intensity: this.getIntensity(result.comparative),
      positive: result.positive,
      negative: result.negative
    };
  }

  classifyEmotion(sentimentResult) {
    const score = sentimentResult.comparative;

    if (score <= -0.5) {
      return 'very_negative';
    } else if (score < -0.2) {
      return 'frustrated';
    } else if (score < -0.05) {
      return 'slightly_negative';
    } else if (score < 0.05) {
      return 'neutral';
    } else if (score < 0.2) {
      return 'slightly_positive';
    } else if (score < 0.5) {
      return 'positive';
    } else {
      return 'excited';
    }
  }

  getIntensity(comparative) {
    const absScore = Math.abs(comparative);

    if (absScore >= 0.5) return 'high';
    if (absScore >= 0.2) return 'medium';
    return 'low';
  }

  getEmotionalTrend(callSid) {
    const history = this.emotionHistory.get(callSid);

    if (!history || history.length < 2) {
      return 'stable';
    }

    const recent = history.slice(-3);
    const scores = recent.map(h => h.comparative);

    const trend = scores[scores.length - 1] - scores[0];

    if (trend > 0.1) return 'improving';
    if (trend < -0.1) return 'declining';
    return 'stable';
  }

  getEmotionModifier(emotionData) {
    const { emotion, intensity } = emotionData;

    switch (emotion) {
      case 'very_negative':
      case 'frustrated':
        return {
          tone: 'empathetic',
          modifier: intensity === 'high'
            ? 'The caller seems very upset or frustrated. Be extremely empathetic, validate their feelings, speak calmly and reassuringly. Use phrases like "I totally understand", "That sounds really frustrating", "I hear you". Avoid being too cheerful.'
            : 'The caller seems a bit frustrated. Be understanding and helpful. Acknowledge their concern and show you care.'
        };

      case 'slightly_negative':
        return {
          tone: 'supportive',
          modifier: 'The caller seems uncertain or mildly concerned. Be supportive and encouraging. Help them feel comfortable.'
        };

      case 'neutral':
        return {
          tone: 'balanced',
          modifier: 'The caller seems calm and neutral. Maintain a friendly, balanced tone. Be helpful without being overly enthusiastic.'
        };

      case 'slightly_positive':
        return {
          tone: 'warm',
          modifier: 'The caller seems pleasant. Match their warmth with a friendly, approachable tone.'
        };

      case 'positive':
        return {
          tone: 'upbeat',
          modifier: 'The caller seems happy and engaged. Match their positive energy with enthusiasm and warmth.'
        };

      case 'excited':
        return {
          tone: 'enthusiastic',
          modifier: intensity === 'high'
            ? 'The caller is very excited! Match their high energy! Be enthusiastic and share in their excitement. Use exclamation points and upbeat language!'
            : 'The caller seems excited. Be enthusiastic and positive to match their energy.'
        };

      default:
        return {
          tone: 'neutral',
          modifier: 'Maintain a balanced, friendly tone.'
        };
    }
  }

  clearHistory(callSid) {
    this.emotionHistory.delete(callSid);
  }

  cleanupOldHistory() {
    const maxAge = 30 * 60 * 1000;
    const now = Date.now();

    for (const [callSid, history] of this.emotionHistory.entries()) {
      if (history.length > 0) {
        const lastTimestamp = history[history.length - 1].timestamp;
        if (now - lastTimestamp > maxAge) {
          this.emotionHistory.delete(callSid);
        }
      }
    }
  }
}

module.exports = new EmotionDetector();
