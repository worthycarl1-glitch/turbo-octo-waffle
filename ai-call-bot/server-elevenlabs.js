const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');
// Add your Firebase project configuration here
const firebaseConfig = { /* Your config */ };
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const db = getFirestore(initializeApp(firebaseConfig));

// Health check route
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Handle WebSocket connections
wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        const userMessage = message.toString();
        // Process the message and integrate with ElevenLabs TTS
        const responseAudio = await generateVoice(userMessage);
        ws.send(responseAudio);
    });
});

// Function to generate voice using ElevenLabs
async function generateVoice(text) {
    try {
        const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/4tRn1lSkEn13EVTuqb0g', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: text, voice: 'Serafina' }),
        });
        const audioData = await response.json();
        return audioData.audio_url; // Return the audio URL or data
    } catch (error) {
        console.error('Error generating voice:', error);
        throw error;
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    server.close(() => {
        console.log('Closed all connections.');
        process.exit(0);
    });
});

// Start the server
server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});