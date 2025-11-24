const { ElevenLabsClient } = require('elevenlabs');
const { Readable } = require('stream');

class VoiceService {
  constructor() {
    this.client = null;
    this.defaultVoiceId = 'EXAVITQu4vr4xnSDxMaL'; // Sarah - natural, professional female voice
    
    if (process.env.ELEVENLABS_API_KEY) {
      this.client = new ElevenLabsClient({
        apiKey: process.env.ELEVENLABS_API_KEY
      });
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
}

module.exports = new VoiceService();