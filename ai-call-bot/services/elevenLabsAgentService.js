/**
 * ElevenLabs Conversational AI Agent Service
 * Manages ElevenLabs Conversational AI agents for end-to-end voice agent functionality
 */

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1/convai/agents';
const AGENTS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

class ElevenLabsAgentService {
  constructor() {
    // Agent list cache
    this.agentsCache = null;
    this.agentsCacheTimestamp = null;
    
    // Individual agent cache
    this.agentDetailsCache = new Map();
  }

  /**
   * Check if ElevenLabs API key is configured
   * @returns {boolean}
   */
  isConfigured() {
    return !!process.env.ELEVENLABS_API_KEY;
  }

  /**
   * Get default agent ID from environment
   * @returns {string|null}
   */
  getDefaultAgentId() {
    return process.env.ELEVENLABS_AGENT_ID || null;
  }

  /**
   * Fetch all agents from ElevenLabs API with caching
   * @returns {Promise<object>} Response with agents list
   */
  async getAgents() {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'ElevenLabs API key not configured',
        agents: []
      };
    }

    const now = Date.now();

    // Return cached data if available and fresh
    if (this.agentsCache && this.agentsCacheTimestamp && 
        (now - this.agentsCacheTimestamp < AGENTS_CACHE_DURATION)) {
      console.log('Returning cached agents data', { 
        cacheAge: Math.round((now - this.agentsCacheTimestamp) / 1000) 
      });
      return this.agentsCache;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(ELEVENLABS_API_BASE, {
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

        console.error('ElevenLabs Agents API error', { statusCode, statusText: response.statusText });
        return {
          success: false,
          error: errorMessage,
          agents: []
        };
      }

      const data = await response.json();
      
      // Format agent data
      const agents = (data.agents || []).map(agent => ({
        agentId: agent.agent_id,
        name: agent.name || 'Unnamed Agent',
        voiceId: agent.voice?.voice_id || null,
        voiceName: agent.voice?.name || null,
        language: agent.language || 'en',
        description: agent.description || '',
        createdAt: agent.created_at
      }));

      // Include default agent from env if set
      const defaultAgentId = this.getDefaultAgentId();

      const result = {
        success: true,
        agents,
        defaultAgentId,
        count: agents.length,
        timestamp: new Date().toISOString()
      };

      // Cache the result
      this.agentsCache = result;
      this.agentsCacheTimestamp = now;

      console.log('Successfully fetched agents from ElevenLabs', { count: agents.length });
      return result;

    } catch (error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'ElevenLabs API request timed out',
          agents: []
        };
      }
      
      console.error('Error fetching ElevenLabs agents', { error: error.message });
      return {
        success: false,
        error: error.message,
        agents: []
      };
    }
  }

  /**
   * Get single agent details by ID
   * @param {string} agentId - The agent ID to fetch
   * @returns {Promise<object>} Agent details
   */
  async getAgent(agentId) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'ElevenLabs API key not configured'
      };
    }

    if (!agentId) {
      return {
        success: false,
        error: 'Agent ID is required'
      };
    }

    // Check cache first
    const now = Date.now();
    const cached = this.agentDetailsCache.get(agentId);
    if (cached && (now - cached.timestamp < AGENTS_CACHE_DURATION)) {
      console.log('Returning cached agent details', { agentId });
      return cached.data;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(`${ELEVENLABS_API_BASE}/${agentId}`, {
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
        
        if (statusCode === 404) {
          errorMessage = 'Agent not found';
        }

        return {
          success: false,
          error: errorMessage
        };
      }

      const agent = await response.json();
      
      const result = {
        success: true,
        agent: {
          agentId: agent.agent_id,
          name: agent.name || 'Unnamed Agent',
          voiceId: agent.voice?.voice_id || null,
          voiceName: agent.voice?.name || null,
          language: agent.language || 'en',
          description: agent.description || '',
          systemPrompt: agent.conversation_config?.system_prompt || null,
          firstMessage: agent.conversation_config?.first_message || null,
          createdAt: agent.created_at
        }
      };

      // Cache the result
      this.agentDetailsCache.set(agentId, {
        data: result,
        timestamp: now
      });

      return result;

    } catch (error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'ElevenLabs API request timed out'
        };
      }
      
      console.error('Error fetching ElevenLabs agent', { agentId, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a new agent via ElevenLabs API
   * @param {object} config - Agent configuration
   * @param {string} config.name - Agent name
   * @param {string} config.voiceId - Voice ID to use
   * @param {string} config.systemPrompt - System prompt for the agent
   * @param {string} config.firstMessage - First message the agent says
   * @param {string} config.language - Language code (default: 'en')
   * @returns {Promise<object>} Created agent details
   */
  async createAgent(config) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'ElevenLabs API key not configured'
      };
    }

    if (!config.name) {
      return {
        success: false,
        error: 'Agent name is required'
      };
    }

    try {
      const requestBody = {
        name: config.name,
        conversation_config: {}
      };

      if (config.voiceId) {
        requestBody.voice = { voice_id: config.voiceId };
      }

      if (config.systemPrompt) {
        requestBody.conversation_config.system_prompt = config.systemPrompt;
      }

      if (config.firstMessage) {
        requestBody.conversation_config.first_message = config.firstMessage;
      }

      if (config.language) {
        requestBody.language = config.language;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(ELEVENLABS_API_BASE, {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const statusCode = response.status;
        let errorMessage = `ElevenLabs API error: ${statusCode} ${response.statusText}`;
        
        try {
          const errorData = await response.json();
          if (errorData.detail) {
            errorMessage = errorData.detail;
          }
        } catch {
          // Use default error message
        }

        return {
          success: false,
          error: errorMessage
        };
      }

      const agent = await response.json();

      // Clear agents cache since we added a new one
      this.agentsCache = null;
      this.agentsCacheTimestamp = null;

      return {
        success: true,
        agent: {
          agentId: agent.agent_id,
          name: agent.name,
          voiceId: agent.voice?.voice_id || null,
          voiceName: agent.voice?.name || null,
          language: agent.language || 'en',
          createdAt: agent.created_at
        }
      };

    } catch (error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'ElevenLabs API request timed out'
        };
      }
      
      console.error('Error creating ElevenLabs agent', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Initiate outbound call via ElevenLabs native Twilio API
   * @param {string} agentId - Agent ID
   * @param {string} phoneNumberId - ElevenLabs phone number ID
   * @param {string} toNumber - Phone number to call (E.164 format)
   * @returns {Promise<object>} Call initiation response
   */
  async initiateOutboundCall(agentId, phoneNumberId, toNumber) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'ElevenLabs API key not configured'
      };
    }

    if (!agentId || !phoneNumberId || !toNumber) {
      return {
        success: false,
        error: 'Missing required parameters: agentId, phoneNumberId, or toNumber'
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agent_id: agentId,
          agent_phone_number_id: phoneNumberId,
          to_number: toNumber
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: `ElevenLabs API error: ${response.status} ${response.statusText}`,
          details: errorData
        };
      }

      const data = await response.json();
      
      return {
        success: true,
        conversationId: data.conversation_id,
        callSid: data.call_sid,
        message: data.message
      };

    } catch (error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'ElevenLabs API request timed out'
        };
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.agentsCache = null;
    this.agentsCacheTimestamp = null;
    this.agentDetailsCache.clear();
  }
}

module.exports = new ElevenLabsAgentService();
