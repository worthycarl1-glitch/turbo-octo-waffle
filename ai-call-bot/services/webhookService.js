/**
 * Webhook Service
 * Handles callback URLs on call completion
 */

const axios = require('axios');

class WebhookService {
  constructor() {
    this.pendingWebhooks = new Map();
    this.retryAttempts = 3;
    this.retryDelay = 5000; // 5 seconds
  }

  /**
   * Send webhook notification
   * @param {string} callbackUrl - URL to send POST request to
   * @param {object} data - Data to send
   * @param {object} options - Additional options
   */
  async sendWebhook(callbackUrl, data, options = {}) {
    if (!callbackUrl) {
      return { success: false, error: 'No callback URL provided' };
    }

    // Validate URL format
    if (!this.isValidUrl(callbackUrl)) {
      return { success: false, error: 'Invalid callback URL format' };
    }

    const payload = {
      callSid: data.callSid,
      conversationId: data.conversationId,
      status: data.status || 'completed',
      duration: data.duration || 0,
      transcript: data.transcript || '',
      sentiment: data.sentiment || { overall: 'neutral', score: 0 },
      emotions: data.emotions || [],
      leadQualification: data.leadQualification || {},
      recording: data.recording || null,
      metadata: data.metadata || {},
      timestamp: new Date().toISOString()
    };

    let lastError = null;
    const maxAttempts = options.retryAttempts || this.retryAttempts;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await axios.post(callbackUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'AI-Call-Bot-Webhook/1.0',
            'X-Webhook-Signature': this.generateSignature(payload),
            'X-Attempt': attempt.toString()
          },
          timeout: options.timeout || 30000, // 30 second timeout
          validateStatus: (status) => status >= 200 && status < 300
        });

        console.log(`Webhook sent successfully to ${callbackUrl}`, {
          callSid: data.callSid,
          statusCode: response.status,
          attempt
        });

        return {
          success: true,
          statusCode: response.status,
          attempt
        };
      } catch (error) {
        lastError = error;
        console.error(`Webhook attempt ${attempt} failed for ${callbackUrl}:`, error.message);

        if (attempt < maxAttempts) {
          // Wait before retrying
          await this.sleep(this.retryDelay * attempt);
        }
      }
    }

    console.error(`All webhook attempts failed for ${callbackUrl}`, {
      callSid: data.callSid,
      error: lastError?.message
    });

    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      attempts: maxAttempts
    };
  }

  /**
   * Queue webhook for sending (non-blocking)
   * @param {string} callbackUrl 
   * @param {object} data 
   */
  queueWebhook(callbackUrl, data) {
    if (!callbackUrl) {
      return;
    }

    // Send webhook asynchronously without blocking
    setImmediate(async () => {
      try {
        await this.sendWebhook(callbackUrl, data);
      } catch (error) {
        console.error('Error in queued webhook:', error.message);
      }
    });
  }

  /**
   * Generate simple signature for webhook verification
   * NOTE: This is a basic signature for development/testing.
   * For production, use HMAC-SHA256 with a secret key.
   * @param {object} payload 
   */
  generateSignature(payload) {
    // Simple signature using timestamp and callSid
    const data = `${payload.callSid}:${payload.timestamp}`;
    // TODO: In production, replace with HMAC-SHA256:
    // const crypto = require('crypto');
    // return crypto.createHmac('sha256', process.env.WEBHOOK_SECRET).update(data).digest('hex');
    return Buffer.from(data).toString('base64');
  }

  /**
   * Validate URL format
   * @param {string} url 
   */
  isValidUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Sleep helper
   * @param {number} ms 
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new WebhookService();
