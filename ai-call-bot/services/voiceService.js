async generateSpeech(text, voiceId, options = {}) {
    try {
        // Call the existing textToSpeech method to generate audio buffer
        const audioBuffer = await this.textToSpeech(text, voiceId, options);

        // Generate a unique filename
        const filename = `audio-${Date.now()}.mp3`;
        const filePath = `public/audio/${filename}`;

        // Save the audio buffer to the file
        const fs = require('fs').promises;
        await fs.writeFile(filePath, audioBuffer);

        // Return the URL path for the audio file
        return `/audio/${filename}`;
    } catch (error) {
        console.error("Error generating speech:", error);
        throw new Error("Unable to generate speech. Please try again.");
    }
}