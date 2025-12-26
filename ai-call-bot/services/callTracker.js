/**
 * Call Tracker Service
 * Tracks active calls for real-time status endpoint
 */

class CallTracker {
  constructor() {
    this.activeCalls = new Map();
    // Configurable cleanup threshold (default: 30 minutes)
    this.cleanupMaxAgeMs = parseInt(process.env.CALL_TRACKER_MAX_AGE_MS, 10) || 30 * 60 * 1000;
  }

  /**
   * Initialize a new call tracking entry
   * @param {string} callSid - Twilio call SID
   * @param {object} config - Call configuration
   */
  initCall(callSid, config = {}) {
    const now = new Date();
    this.activeCalls.set(callSid, {
      callSid,
      conversationId: config.conversationId || `conv_${callSid}`,
      to: config.to,
      status: 'initiated',
      startTime: now,
      duration: 0,
      currentEmotion: null,
      transcript: [],
      emotions: [],
      sentiment: { overall: 'neutral', score: 0 },
      metadata: config.metadata || {},
      voiceConfig: config.voiceConfig || {},
      // TTS Provider tracking
      ttsProvider: config.ttsProvider || 'elevenlabs',
      openaiVoice: config.openaiVoice || null,
      openaiModel: config.openaiModel || null,
      // Silence tracking for smart timeout
      silenceCount: 0,
      silenceEvents: [],
      lastSpeechTime: now,
      // Existing config
      systemPrompt: config.systemPrompt || null,
      conversationMode: config.conversationMode || 'interactive',
      maxDuration: config.maxDuration || 600,
      callbackUrl: config.callbackUrl || null,
      recordCall: config.recordCall || false,
      enableEmotionDetection: config.enableEmotionDetection !== false,
      sentimentAnalysis: config.sentimentAnalysis !== false,
      qualificationQuestions: config.qualificationQuestions || [],
      leadQualification: {},
      transferNumber: config.transferNumber || null,
      transferConditions: config.transferConditions || [],
      recording: null,
      lastUpdated: now,
      language: config.language || 'en-US',
      // ElevenLabs Agent Mode tracking
      agentId: config.agentId || null,
      agentMode: config.agentMode || false,
      elevenLabsConversationId: config.elevenLabsConversationId || null,
      // Tool calls tracking for appointment booking
      toolCalls: [],
      // Contact and Agent tracking for Base44 integration
      contact_id: config.contact_id || null,
      agent_id: config.agent_id || null
    });
    
    return this.activeCalls.get(callSid);
  }

  /**
   * Get call by SID
   * @param {string} callSid 
   */
  getCall(callSid) {
    return this.activeCalls.get(callSid);
  }

  /**
   * Update call status
   * @param {string} callSid 
   * @param {string} status 
   */
  updateStatus(callSid, status) {
    const call = this.activeCalls.get(callSid);
    if (call) {
      call.status = status;
      call.lastUpdated = new Date();
      if (status === 'in-progress' && !call.connectedTime) {
        call.connectedTime = new Date();
      }
    }
    return call;
  }

  /**
   * Update call duration
   * @param {string} callSid 
   */
  updateDuration(callSid) {
    const call = this.activeCalls.get(callSid);
    if (call && call.connectedTime) {
      call.duration = Math.floor((Date.now() - call.connectedTime.getTime()) / 1000);
      call.lastUpdated = new Date();
    }
    return call;
  }

  /**
   * Update silence event for smart timeout tracking
   * @param {string} callSid 
   * @param {string} eventType - 'gentle_prompt' or 'graceful_end'
   * @param {number} silenceCount 
   */
  updateSilenceEvent(callSid, eventType, silenceCount) {
    const call = this.activeCalls.get(callSid);
    if (call) {
      call.silenceCount = silenceCount;
      call.silenceEvents.push({
        type: eventType,
        silenceCount,
        timestamp: new Date().toISOString()
      });
      call.lastUpdated = new Date();
    }
    return call;
  }

  /**
   * Reset silence count when user speaks
   * @param {string} callSid 
   */
  resetSilenceCount(callSid) {
    const call = this.activeCalls.get(callSid);
    if (call) {
      call.silenceCount = 0;
      call.lastSpeechTime = new Date();
      call.lastUpdated = new Date();
    }
    return call;
  }

  /**
   * Add transcript entry
   * @param {string} callSid 
   * @param {string} role - 'user' or 'assistant'
   * @param {string} content 
   */
  addTranscript(callSid, role, content) {
    const call = this.activeCalls.get(callSid);
    if (call) {
      call.transcript.push({
        role,
        content,
        timestamp: new Date().toISOString()
      });
      call.lastUpdated = new Date();
    }
    return call;
  }

  /**
   * Update emotion data
   * @param {string} callSid 
   * @param {object} emotionData 
   */
  updateEmotion(callSid, emotionData) {
    const call = this.activeCalls.get(callSid);
    if (call) {
      call.currentEmotion = emotionData.emotion;
      call.emotions.push({
        emotion: emotionData.emotion,
        intensity: emotionData.intensity,
        timestamp: new Date().toISOString()
      });
      
      // Update overall sentiment
      if (emotionData.score !== undefined) {
        const recentEmotions = call.emotions.slice(-5);
        const avgScore = recentEmotions.reduce((sum, e) => sum + (e.score || 0), 0) / recentEmotions.length;
        call.sentiment = {
          overall: avgScore > 0.1 ? 'positive' : avgScore < -0.1 ? 'negative' : 'neutral',
          score: Math.round(avgScore * 100) / 100
        };
      }
      
      call.lastUpdated = new Date();
    }
    return call;
  }

  /**
   * Update lead qualification data
   * @param {string} callSid 
   * @param {object} qualificationData 
   */
  updateLeadQualification(callSid, qualificationData) {
    const call = this.activeCalls.get(callSid);
    if (call) {
      call.leadQualification = { ...call.leadQualification, ...qualificationData };
      call.lastUpdated = new Date();
    }
    return call;
  }

  /**
   * Set recording URL
   * @param {string} callSid 
   * @param {string} recordingUrl 
   */
  setRecording(callSid, recordingUrl) {
    const call = this.activeCalls.get(callSid);
    if (call) {
      call.recording = recordingUrl;
      call.lastUpdated = new Date();
    }
    return call;
  }

  /**
   * Add tool call result to tracking
   * @param {string} callSid 
   * @param {object} toolCallData - Tool call information
   */
  addToolCall(callSid, toolCallData) {
    const call = this.activeCalls.get(callSid);
    if (call) {
      call.toolCalls.push({
        name: toolCallData.name,
        parameters: toolCallData.parameters || {},
        success: toolCallData.success || false,
        result: toolCallData.result || null,
        timestamp: new Date().toISOString()
      });
      call.lastUpdated = new Date();
    }
    return call;
  }

  /**
   * Get full call data including tool calls
   * @param {string} callSid 
   */
  getFullCallData(callSid) {
    const call = this.activeCalls.get(callSid);
    if (!call) {
      return null;
    }

    return {
      callSid: call.callSid,
      conversationId: call.conversationId,
      elevenLabsConversationId: call.elevenLabsConversationId,
      status: call.status,
      duration: call.duration,
      transcript: call.transcript,
      toolCalls: call.toolCalls,
      contact_id: call.contact_id,
      agent_id: call.agent_id,
      agentId: call.agentId,
      sentiment: call.sentiment,
      metadata: call.metadata
    };
  }

  /**
   * Get call status for API response
   * @param {string} callSid 
   */
  getCallStatus(callSid) {
    const call = this.activeCalls.get(callSid);
    if (!call) {
      return null;
    }

    // Update duration if call is in progress
    if (call.status === 'in-progress') {
      this.updateDuration(callSid);
    }

    return {
      callSid: call.callSid,
      conversationId: call.conversationId,
      status: call.status,
      duration: call.duration,
      currentEmotion: call.currentEmotion,
      transcript: call.transcript.map(t => `${t.role}: ${t.content}`).join('\n'),
      sentiment: call.sentiment,
      metadata: call.metadata,
      ttsProvider: call.ttsProvider,
      silenceEvents: call.silenceEvents
    };
  }

  /**
   * Get full call data for webhook
   * @param {string} callSid 
   */
  getCallDataForWebhook(callSid) {
    const call = this.activeCalls.get(callSid);
    if (!call) {
      return null;
    }

    return {
      callSid: call.callSid,
      conversationId: call.conversationId,
      status: call.status,
      duration: call.duration,
      transcript: call.transcript.map(t => `${t.role}: ${t.content}`).join('\n'),
      sentiment: call.sentiment,
      emotions: call.emotions,
      leadQualification: call.leadQualification,
      recording: call.recording,
      metadata: call.metadata,
      ttsProvider: call.ttsProvider,
      silenceEvents: call.silenceEvents
    };
  }

  /**
   * End call and return final data
   * @param {string} callSid 
   * @param {string} status 
   */
  endCall(callSid, status = 'completed') {
    const call = this.activeCalls.get(callSid);
    if (call) {
      call.status = status;
      call.endTime = new Date();
      if (call.connectedTime) {
        call.duration = Math.floor((call.endTime.getTime() - call.connectedTime.getTime()) / 1000);
      }
      call.lastUpdated = new Date();
    }
    return call;
  }

  /**
   * Remove call from tracking (after webhook sent)
   * @param {string} callSid 
   */
  removeCall(callSid) {
    const call = this.activeCalls.get(callSid);
    this.activeCalls.delete(callSid);
    return call;
  }

  /**
   * Get callback URL for a call
   * @param {string} callSid 
   */
  getCallbackUrl(callSid) {
    const call = this.activeCalls.get(callSid);
    return call ? call.callbackUrl : null;
  }

  /**
   * Cleanup old calls based on configurable threshold
   */
  cleanupOldCalls() {
    const now = Date.now();

    for (const [callSid, call] of this.activeCalls.entries()) {
      if (now - call.startTime.getTime() > this.cleanupMaxAgeMs) {
        this.activeCalls.delete(callSid);
      }
    }
  }

  /**
   * Get count of active calls
   */
  getActiveCallCount() {
    return this.activeCalls.size;
  }
}

module.exports = new CallTracker();
