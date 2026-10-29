const axios = require('axios');

const DEFAULT_MODEL = process.env.GEMINI_MODEL_NAME || 'gemini-3.6-flash';

/**
 * Service to analyze language usage in transcripts using Gemini API
 */

/**
 * Analyze transcript and return language percentages
 * @param {string} transcript - The full transcript text
 * @returns {Promise<{English: number, Hindi: number, Gujarati: number, Other: number}>}
 */
const analyzeLanguage = async (transcript) => {
  if (!transcript || transcript.trim() === '') {
    return { English: 0, Hindi: 0, Gujarati: 0, Other: 0 };
  }

  // Limit transcript to avoid token limits, but try to keep enough for accurate analysis
  const textToAnalyze = transcript.substring(0, 8000); 

  const prompt = `Analyze the following transcript and detect the percentage of languages used.

Return ONLY valid JSON in this format:
{
  "English": number,
  "Hindi": number,
  "Gujarati": number,
  "Other": number
}

Rules:
- Total must equal 100
- Analyze the FULL text, not sentence by sentence
- Detect mixed-language usage accurately
- Do not include explanations
- Output only JSON

Transcript:
${textToAnalyze}`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`,
      {
        contents: [{
          parts: [{ text: prompt }]
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        params: {
          key: process.env.GEMINI_API_KEY
        }
      }
    );

    let generatedText = response.data.candidates[0].content.parts[0].text;
    
    // Clean up response if it contains markdown code blocks
    generatedText = generatedText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const analysisResult = JSON.parse(generatedText);

    // Validate the result
    const result = {
      English: Number(analysisResult.English) || 0,
      Hindi: Number(analysisResult.Hindi) || 0,
      Gujarati: Number(analysisResult.Gujarati) || 0,
      Other: Number(analysisResult.Other) || 0
    };

    // Normalize to ensure total is exactly 100 if there was a rounding error
    const total = result.English + result.Hindi + result.Gujarati + result.Other;
    if (total > 0 && total !== 100) {
      const factor = 100 / total;
      result.English = Math.round(result.English * factor);
      result.Hindi = Math.round(result.Hindi * factor);
      result.Gujarati = Math.round(result.Gujarati * factor);
      result.Other = 100 - (result.English + result.Hindi + result.Gujarati); // Ensure exactly 100
      
      // Prevent negative values from rounding
      if(result.Other < 0) result.Other = 0;
    }

    return result;
  } catch (error) {
    console.error('Language Analysis API Error');
    console.error('   Message:', error.message);
    console.error('   Status:', error.response?.status);
    
    // Provide more detailed error information
    if (error.response?.status === 400) {
      console.error('   Bad request - check your prompt or API parameters');
    } else if (error.response?.status === 401 || error.response?.status === 403) {
      console.error('   Authentication failed - check your GEMINI_API_KEY');
      console.error('   Tip: Verify GEMINI_API_KEY is set in .env');
    } else if (error.response?.status === 429) {
      console.error('   Rate limit exceeded - Gemini API quota reached');
    } else if (error.message.includes('ECONNREFUSED') || error.message.includes('timeout')) {
      console.error('   Network error - check internet connection');
    }
    
    const apiError = error.response?.data;
    if (apiError) {
      console.error('   API Response:', JSON.stringify(apiError, null, 2));
    }
    
    // If it fails, default back to 0s instead of crashing transcription
    console.warn('   Falling back to default language analysis');
    return null;
  }
};

/**
 * Analyze language for each segment
 * @param {Array} segments - Array of segments { text: string }
 * @returns {Promise<Array>} - Segments with language property added
 */
const analyzeSegmentsLanguage = async (segments) => {
  if (!segments || segments.length === 0) return [];

  const BATCH_SIZE = 25;
  const processedSegments = [];

  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const batch = segments.slice(i, i + BATCH_SIZE);
    const batchText = batch.map((s, idx) => `${idx + 1}. ${s.text}`).join('\n');

    const prompt = `Identify the primary language (English, Hindi, Gujarati, or Other) for each of these segments.
Return ONLY a JSON array of strings (the language names) in the matching order: ["English", "Hindi", ...]. 

Segments:
${batchText}`;

    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`,
        {
          contents: [{ parts: [{ text: prompt }] }]
        },
        {
          headers: { 'Content-Type': 'application/json' },
          params: { key: process.env.GEMINI_API_KEY }
        }
      );

      let generatedText = response.data.candidates[0].content.parts[0].text;
      generatedText = generatedText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      const languages = JSON.parse(generatedText);

      batch.forEach((seg, idx) => {
        processedSegments.push({
          ...seg,
          language: languages[idx] || 'Other'
        });
      });
    } catch (error) {
      console.error(`Batch ${Math.floor(i/BATCH_SIZE)} language analysis failed`);
      console.error(`   Message: ${error.message}`);
      console.error(`   Status: ${error.response?.status}`);
      
      if (error.response?.status === 401) {
        console.error('   Check: GEMINI_API_KEY authentication failed');
      } else if (error.response?.status === 429) {
        console.error('   Rate limited - waiting before retry');
      }
      
      // Fallback: assign 'unknown' or 'Other'
      batch.forEach(seg => {
        processedSegments.push({ ...seg, language: 'Other' });
      });
    }
  }

  return processedSegments;
};

module.exports = {
  analyzeLanguage,
  analyzeSegmentsLanguage
};
