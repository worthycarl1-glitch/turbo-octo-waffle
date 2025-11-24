const { ElevenLabsClient } = require('elevenlabs');
const { Readable } = require('stream');
const fs = require('fs').promises;
const path = require('path');

class VoiceService {
  constructor() {
    this.client = null;
    this.defaultVoiceId = 'EXAVITQu4vr4xnSDxMaL'; // Sarah - natural, professional female voice
    this.audioDir = path.join(__dirname, '../public/audio');
    
    if (process.env.ELEVENLABS_API_KEY) {
      this.client = new ElevenLabsClient({
        apiKey: process.env.ELEVENLABS_API_KEY
      });
    }
    
    // Ensure audio directory exists
    this.ensureAudioDir();
  }

  async ensureAudioDir() {
    try {
      await fs.mkdir(this.audioDir, { recursive: true });
    } catch (error) {
      console.error('Error creating audio directory:', error);
    }
  }

  async generateSpeech(text, voiceId, options = {}) {
    if (!this.client) {
      throw new Error('ElevenLabs not configured. Add ELEVENLABS_API_KEY to environment variables.');
    }

    try {
      // Generate audio buffer
      const audioBuffer = await this.textToSpeech(text, { ...options, voiceId });
      
      // Create unique filename
      const filename = `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.mp3`;
      const filePath = path.join(this.audioDir, filename);
      
      // Save audio file
      await fs.writeFile(filePath, audioBuffer);
      
      // Return URL path (Railway will serve this)
      const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : process.env.RAILWAY_STATIC_URL || 'http://localhost:3000';
      
      return `${baseUrl}/audio/${filename}`;
    } catch (error) {
      console.error('Error in generateSpeech:', error);
      throw error;
    }
  }

  async textToSpeech(text, options = {}) {
    if (!this.client) {
      throw new Error('ElevenLabs not configured. Add ELEVENLABS_API_KEY to environment variables.');
    }

    try {
      const voiceId = options.voiceId || this.defaultVoiceId;
      
      const audio = await this.client.generate({
        voice: voiceId,
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: options.stability || 0.5,
          similarity_boost: options.similarityBoost || 0.75,
          style: options.style || 0.0,
          use_speaker_boost: true
        }
      });

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
      
      const audioStream = await this.client.generate({
        voice: voiceId,
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: options.stability || 0.5,
          similarity_boost: options.similarityBoost || 0.75,
          style: options.style || 0.0,
          use_speaker_boost: true
        },
        stream: true
      });

      return audioStream;
    } catch (error) {
      console.error('ElevenLabs TTS stream error:', error);
      throw error;
    }
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
