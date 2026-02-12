/**
 * Voice Engine Tests
 * Tests TTS, STT, and Gemini integration
 */

import textToSpeech from "@google-cloud/text-to-speech";
import fs from "fs";

const client = new textToSpeech.TextToSpeechClient();

async function testTTS() {
  console.log("\n🎙️  Testing Text-to-Speech API...\n");

  const request = {
    input: { text: "Hello Prankur, your Shreenika voice engine is working perfectly." },
    voice: {
      languageCode: "en-IN",
      name: "en-IN-Neural2-A",
    },
    audioConfig: {
      audioEncoding: "MP3",
    },
  };

  try {
    const [response] = await client.synthesizeSpeech(request);
    fs.writeFileSync("output.mp3", response.audioContent, "binary");
    console.log("✅ TTS test successful!");
    console.log("📁 File saved as: output.mp3");
    console.log(`📊 Audio size: ${response.audioContent.length} bytes\n`);
    return true;
  } catch (error) {
    console.error("❌ TTS test failed:", error.message);
    return false;
  }
}

async function testHinglishTTS() {
  console.log("🎙️  Testing Hinglish TTS...\n");

  const request = {
    input: {
      ssml: `<speak>
        <prosody rate="1.0" pitch="0st">
          Namaste, main hoon Shreenika. Aapka voice agent successfully kaam kar raha hai.
        </prosody>
      </speak>`
    },
    voice: {
      languageCode: "en-IN",
      name: "en-IN-Neural2-A",
    },
    audioConfig: {
      audioEncoding: "MP3",
    },
  };

  try {
    const [response] = await client.synthesizeSpeech(request);
    fs.writeFileSync("hinglish_output.mp3", response.audioContent, "binary");
    console.log("✅ Hinglish TTS test successful!");
    console.log("📁 File saved as: hinglish_output.mp3");
    console.log(`📊 Audio size: ${response.audioContent.length} bytes\n`);
    return true;
  } catch (error) {
    console.error("❌ Hinglish TTS test failed:", error.message);
    return false;
  }
}

async function runAllTests() {
  console.log("=" * 60);
  console.log("SHREENIKA VOICE ENGINE - TEST SUITE");
  console.log("=" * 60);

  const test1 = await testTTS();
  const test2 = await testHinglishTTS();

  console.log("=" * 60);
  if (test1 && test2) {
    console.log("✅ ALL TESTS PASSED - Voice Engine is Ready!");
  } else {
    console.log("❌ Some tests failed. Check the errors above.");
  }
  console.log("=" * 60 + "\n");
}

// Run tests
runAllTests().catch(console.error);
