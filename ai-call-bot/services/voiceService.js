const { ElevenLabsClient } = require('elevenlabs');
const { Readable } = require('stream');
const fs = require('fs').promises;
const path = require('path');

// Response cache for common phrases (24 hour TTL)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class VoiceService {
  constructor() {
    this.client = null;
    this.defaultVoiceId = 'EXAVITQu4vr4xnSDxMaL'; // Sarah - natural, professional female voice
    this.audioDir = path.join(__dirname, '../public/audio');
    
    // Response cache for common phrases
    this.responseCache = new Map();
    
    // Common phrases to cache
    this.commonPhrases = [
      'hello',
      'yes',
      'no',
      'goodbye',
      'thank you',
      'thanks',
      'okay',
      'sure',
      'one moment',
      'please hold'
    ];
    
    // Default voice settings
    this.defaultSettings = {
      stability: 0.5,
      similarityBoost: 0.75,
      style: 0.0,
      speakingRate: 1.0
    };
    
    if (process.env.ELEVENLABS_API_KEY) {
      this.client = new ElevenLabsClient({
        apiKey: process.env.ELEVENLABS_API_KEY
      });
    }
    
    // Ensure audio directory exists
    this.ensureAudioDir();
    
    // Set up periodic cache cleanup (every hour)
    this.cacheCleanupInterval = setInterval(() => {
      this.cleanupCache();
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Generate cache key for a phrase
   * @param {string} text - Text to cache
   * @param {string} voiceId - Voice ID
   */
  getCacheKey(text, voiceId) {
    const normalizedText = text.toLowerCase().trim();
    return `${voiceId}:${normalizedText}`;
  }

  /**
   * Check if text is a common phrase that should be cached
   * @param {string} text 
   */
  isCommonPhrase(text) {
    const normalizedText = text.toLowerCase().trim();
    // Use exact match or check if the normalized text is exactly one of the common phrases
    return this.commonPhrases.some(phrase => normalizedText === phrase);
  }

  /**
   * Get cached response if available and not expired
   * @param {string} cacheKey 
   */
  getCachedResponse(cacheKey) {
    const cached = this.responseCache.get(cacheKey);
    if (!cached) {
      return null;
    }
    
    // Check if cache entry has expired
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
      this.responseCache.delete(cacheKey);
      return null;
    }
    
    console.log('Cache hit for phrase:', cacheKey);
    return cached.url;
  }

  /**
   * Store response in cache
   * @param {string} cacheKey 
   * @param {string} url 
   */
  setCachedResponse(cacheKey, url) {
    this.responseCache.set(cacheKey, {
      url,
      timestamp: Date.now()
    });
    console.log('Cached response for:', cacheKey);
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.responseCache.entries()) {
      if (now - value.timestamp > CACHE_TTL_MS) {
        this.responseCache.delete(key);
      }
    }
  }

  async ensureAudioDir() {
    try {
      await fs.mkdir(this.audioDir, { recursive: true });
    } catch (error) {
      console.error('Error creating audio directory:', error);
    }
  }

  /**
   * Generate speech with enhanced voice settings
   * @param {string} text - Text to convert to speech
   * @param {string} voiceId - ElevenLabs voice ID
   * @param {object} options - Enhanced voice options
   * @param {number} options.stability - Voice stability (0.0-1.0)
   * @param {number} options.similarityBoost - Voice similarity boost (0.0-1.0)
   * @param {number} options.style - Voice style (0.0-1.0)
   * @param {number} options.speakingRate - Speaking rate multiplier (0.5-2.0)
   * @param {boolean} enableCache - Whether to use response caching (default: true)
   */
  async generateSpeech(text, voiceId, options = {}, enableCache = true) {
    if (!this.client) {
      throw new Error('ElevenLabs not configured. Add ELEVENLABS_API_KEY to environment variables.');
    }

    try {
      const effectiveVoiceId = voiceId || this.defaultVoiceId;
      
      // Check cache for common phrases if caching is enabled
      if (enableCache && this.isCommonPhrase(text)) {
        const cacheKey = this.getCacheKey(text, effectiveVoiceId);
        const cachedUrl = this.getCachedResponse(cacheKey);
        if (cachedUrl) {
          return cachedUrl;
        }
      }

      // Merge with defaults
      const voiceOptions = {
        voiceId: effectiveVoiceId,
        stability: this.validateRange(options.stability, 0, 1, this.defaultSettings.stability),
        similarityBoost: this.validateRange(options.similarityBoost, 0, 1, this.defaultSettings.similarityBoost),
        style: this.validateRange(options.style, 0, 1, this.defaultSettings.style),
        speakingRate: this.validateRange(options.speakingRate, 0.5, 2.0, this.defaultSettings.speakingRate)
      };

      // Log voice configuration for debugging
      console.log('Voice configuration:', {
        voiceId: voiceOptions.voiceId,
        stability: voiceOptions.stability,
        similarityBoost: voiceOptions.similarityBoost,
        style: voiceOptions.style,
        speakingRate: voiceOptions.speakingRate,
        cacheEnabled: enableCache
      });

      // Generate audio buffer
      const audioBuffer = await this.textToSpeech(text, voiceOptions);
      
      // Create unique filename
      const filename = `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.mp3`;
      const filePath = path.join(this.audioDir, filename);
      
      // Save audio file
      await fs.writeFile(filePath, audioBuffer);
      
      // Return URL path (Railway will serve this)
      const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : process.env.RAILWAY_STATIC_URL || 'http://localhost:3000';
      
      const audioUrl = `${baseUrl}/audio/${filename}`;
      
      // Cache the response if it's a common phrase and caching is enabled
      if (enableCache && this.isCommonPhrase(text)) {
        const cacheKey = this.getCacheKey(text, effectiveVoiceId);
        this.setCachedResponse(cacheKey, audioUrl);
      }
      
      return audioUrl;
    } catch (error) {
      console.error('Error in generateSpeech:', error);
      throw error;
    }
  }

  /**
   * Validate numeric value is within range
   * @param {number} value - Value to validate
   * @param {number} min - Minimum allowed value
   * @param {number} max - Maximum allowed value
   * @param {number} defaultValue - Default if invalid
   */
  validateRange(value, min, max, defaultValue) {
    if (value === undefined || value === null) {
      return defaultValue;
    }
    const num = parseFloat(value);
    if (isNaN(num)) {
      return defaultValue;
    }
    return Math.max(min, Math.min(max, num));
  }

  async textToSpeech(text, options = {}) {
    if (!this.client) {
      throw new Error('ElevenLabs not configured. Add ELEVENLABS_API_KEY to environment variables.');
    }

    try {
      const voiceId = options.voiceId || this.defaultVoiceId;
      
      // Build voice settings with enhanced parameters
      const voiceSettings = {
        stability: options.stability !== undefined ? options.stability : this.defaultSettings.stability,
        similarity_boost: options.similarityBoost !== undefined ? options.similarityBoost : this.defaultSettings.similarityBoost,
        style: options.style !== undefined ? options.style : this.defaultSettings.style,
        use_speaker_boost: true
      };

      // Build generation options
      const generateOptions = {
        voice: voiceId,
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: voiceSettings
      };

      // Note: ElevenLabs API doesn't directly support speaking rate in the generate method
      // Speaking rate would need to be handled through the model or post-processing
      // For now, we log it and apply if the API supports it in the future
      if (options.speakingRate && options.speakingRate !== 1.0) {
        console.log('Speaking rate requested:', options.speakingRate, '(Note: May require audio post-processing)');
      }

      const audio = await this.client.generate(generateOptions);

      // Convert async iterable to buffer
      const chunks = [];
      for await (const chunk of audio) {
        chunks.push(chunk);
      }
      
      return Buffer.concat(chunks);
    } catch (error) {
      console.error('ElevenLabs TTS error:', error);
      throw error;
    }
  }

  async textToSpeechStream(text, options = {}) {
    if (!this.client) {
      throw new Error('ElevenLabs not configured. Add ELEVENLABS_API_KEY to environment variables.');
    }

    try {
      const voiceId = options.voiceId || this.defaultVoiceId;
      
      // Build voice settings with enhanced parameters
      const voiceSettings = {
        stability: options.stability !== undefined ? options.stability : this.defaultSettings.stability,
        similarity_boost: options.similarityBoost !== undefined ? options.similarityBoost : this.defaultSettings.similarityBoost,
        style: options.style !== undefined ? options.style : this.defaultSettings.style,
        use_speaker_boost: true
      };
      
      const audioStream = await this.client.generate({
        voice: voiceId,
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: voiceSettings,
        stream: true
      });

      return audioStream;
    } catch (error) {
      console.error('ElevenLabs TTS stream error:', error);
      throw error;
    }
  }

  /**
   * Get default voice settings
   */
  getDefaultSettings() {
    return { ...this.defaultSettings };
  }

  /**
   * Get voice info by ID
   * @param {string} voiceId 
   */
  getVoiceInfo(voiceId) {
    const voices = this.getVoices();
    for (const [name, id] of Object.entries(voices)) {
      if (id === voiceId) {
        return { voiceId: id, voiceName: name };
      }
    }
    return { voiceId, voiceName: 'Custom' };
  }

  isConfigured() {
    return !!this.client;
  }

  // Available voice IDs (you can customize these)
  getVoices() {
    return {
      serafina: '4tRn1lSkEn13EVTuqb0g', // Your chosen voice!
      sarah: 'EXAVITQu4vr4xnSDxMaL', // Natural, professional female
      rachel: '21m00Tcm4TlvDq8ikWAM', // Clear, warm female
      domi: 'AZnzlk1XvdvUeBnXmlld', // Strong, confident female
      bella: 'EXAVITQu4vr4xnSDxMaL', // Friendly, approachable female
      adam: 'pNInz6obpgDQGcFmaJgB', // Professional male
      antoni: 'ErXwobaYiN019PkySvjV', // Young, casual male
      josh: 'TxGEqnHWrfWFTfGW9XjX', // Deep, authoritative male
      arnold: 'VR6AewLTigWG4xSOukaG', // Friendly, professional male
      sam: 'yoZ06aMxZJJ28mfd3POQ'  // Dynamic, energetic male
    };
  }

  // Cleanup old audio files (optional - call this periodically)
  async cleanupOldAudioFiles(maxAgeMs = 3600000) { // 1 hour default
    try {
      const files = await fs.readdir(this.audioDir);
      const now = Date.now();
      
      for (const file of files) {
        if (file.startsWith('audio-')) {
          const filePath = path.join(this.audioDir, file);
          const stats = await fs.stat(filePath);
          
          if (now - stats.mtimeMs > maxAgeMs) {
            await fs.unlink(filePath);
            console.log(`Cleaned up old audio file: ${file}`);
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning up audio files:', error);
    }
  }
}

module.exports = new VoiceService();
