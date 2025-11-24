// Importing required modules
const express = require('express');
const twilio = require('twilio');
const bodyParser = require('body-parser');
const voiceService = require('./services/voiceService');

const app = express();
app.use(bodyParser.json());

// Your other configurations and routes

app.post('/make-call', async (req, res) => {
    const { message } = req.body;
    const gather = new twilio.twiml.VoiceResponse().gather();
    const audioUrl = await voiceService.generateSpeech(
      message || "Hey there! I'm your AI assistant. What can I help you with?",
      '4tRn1lSkEn13EVTuqb0g'
    );
    gather.play(audioUrl);
    res.type('text/xml').send(gather.toString());
});

app.post('/handle-response', async (req, res) => {
    const gather = new twilio.twiml.VoiceResponse().gather();
    const audioUrl = await voiceService.generateSpeech(
      "I'm listening. What would you like to talk about?",
      '4tRn1lSkEn13EVTuqb0g'
    );
    gather.play(audioUrl);
    res.type('text/xml').send(gather.toString());
});

app.post('/no-speech', async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const audioUrl = await voiceService.generateSpeech(
      "Sorry, I didn't quite catch that. Could you say it again?",
      '4tRn1lSkEn13EVTuqb0g'
    );
    twiml.play(audioUrl);
    res.type('text/xml').send(twiml.toString());
});

app.post('/goodbye', async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const audioUrl = await voiceService.generateSpeech(
      "It was great talking with you! Take care!",
      '4tRn1lSkEn13EVTuqb0g'
    );
    twiml.play(audioUrl);
    res.type('text/xml').send(twiml.toString());
});

app.post('/ai-response', async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const result = req.body.result;
    const audioUrl = await voiceService.generateSpeech(
      result.response,
      '4tRn1lSkEn13EVTuqb0g'
    );
    twiml.play(audioUrl);
    res.type('text/xml').send(twiml.toString());
});

app.post('/error', async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const audioUrl = await voiceService.generateSpeech(
      "Hmm, I'm having a bit of trouble there. Can you try again?",
      '4tRn1lSkEn13EVTuqb0g'
    );
    twiml.play(audioUrl);
    res.type('text/xml').send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
