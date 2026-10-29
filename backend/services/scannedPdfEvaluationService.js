const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const geminiService = require('./geminiService');

/**
 * Service to handle scanned image-based PDFs and handwritten assignment PDF submissions
 * using PDF page rendering and Vision AI (Gemini Vision) with automatic retry & rate-limit handling.
 */
class ScannedPdfEvaluationService {
  constructor() {
    this.defaultBatchSize = 3;
  }

  /**
   * Renders PDF pages to images and processes handwritten/scanned content via Vision AI.
   *
   * @param {string} pdfFilePath Absolute or relative filepath to PDF
   * @param {Object} [options] Options for batching or scaling
   * @returns {Promise<{
   *   success: boolean,
   *   sourceType?: string,
   *   pages?: Array<{ pageNumber: number, text: string, confidence: number }>,
   *   combinedText?: string,
   *   totalPages?: number,
   *   pagesProcessed?: number,
   *   reason?: string
   * }>}
   */
  async processScannedPdf(pdfFilePath, options = {}) {
    try {
      if (!fs.existsSync(pdfFilePath)) {
        return {
          success: false,
          reason: `Scanned PDF file not found on server at path: ${pdfFilePath}`
        };
      }

      delete globalThis.pdfjsWorker;
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

      const dataBuffer = new Uint8Array(fs.readFileSync(pdfFilePath));
      const loadingTask = pdfjsLib.getDocument({ data: dataBuffer });
      const pdfDocument = await loadingTask.promise;
      const totalPages = pdfDocument.numPages;

      if (!totalPages || totalPages === 0) {
        return {
          success: false,
          reason: 'Uploaded scanned PDF file contains zero readable pages.'
        };
      }

      console.log(`[ScannedPdfEvaluationService] Processing ${totalPages} scanned pages for: ${path.basename(pdfFilePath)}`);

      const pagesResult = [];
      const batchSize = options.batchSize || this.defaultBatchSize;

      const systemPrompt = `You are a high-precision academic OCR and handwritten document transcription AI.
Your task is to transcribe handwritten assignment pages into structured plain text.

TRANSCRIPTION RULES:
1. Read the handwritten content exactly as written.
2. Preserve Question numbers (e.g., Q1, Question 1, Ans 1), headings, section headers, answer text, bullet points, sub-points, and examples.
3. Preserve Question vs Answer boundaries clearly (e.g., "Question 1: ... \n Answer: ...").
4. Preserve mathematical formulas, diagrams notes, and special notation where possible.
5. Do NOT invent missing content or guess unclear words.
6. Do NOT correct or rewrite student answers into a better answer. Transcribe what is actually visible.
7. Indicate [illegible] if text genuinely cannot be read due to smudge or low clarity.
8. Maintain strict page order. Precede each page's transcription with "--- Page X ---".`;

      for (let startPage = 1; startPage <= totalPages; startPage += batchSize) {
        const endPage = Math.min(startPage + batchSize - 1, totalPages);
        const attachments = [];
        const pageNumbers = [];

        for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
          const page = await pdfDocument.getPage(pageNum);
          const originalViewport = page.getViewport({ scale: 1.0 });
          // Scale to target height ~1100px for optimal vision clarity, speed and minimal memory
          const targetScale = Math.min(1.1, 1100 / (originalViewport.height || 1000));
          const viewport = page.getViewport({ scale: targetScale });

          const canvas = createCanvas(viewport.width, viewport.height);
          const context = canvas.getContext('2d');

          await page.render({
            canvasContext: context,
            viewport: viewport
          }).promise;

          const jpegBuffer = canvas.toBuffer('image/jpeg');
          attachments.push({
            mimeType: 'image/jpeg',
            buffer: jpegBuffer
          });
          pageNumbers.push(pageNum);
        }

        const batchPrompt = `Transcribe pages ${startPage} to ${endPage} from the provided page image attachments in order. For each image attachment (Page ${pageNumbers.join(', Page ')}), output:
--- Page X ---
[Transcribed content]`;

        console.log(`[ScannedPdfEvaluationService] Sending vision batch for pages ${startPage}-${endPage}...`);
        
        let response;
        let retries = 0;
        const maxRetries = 5;

        while (retries <= maxRetries) {
          try {
            response = await geminiService.sendMessage({
              systemPrompt,
              userMessage: batchPrompt,
              attachments,
              timeoutMs: 90000
            });
            console.log(`[ScannedPdfEvaluationService] Vision batch ${startPage}-${endPage} succeeded (responseChars=${response?.text?.length || 0})`);
            break;
          } catch (batchErr) {
            retries++;
            if (retries > maxRetries) {
              console.error(`[ScannedPdfEvaluationService] Vision batch ${startPage}-${endPage} exhausted retries: ${batchErr.message}`);
              throw batchErr;
            }
            const isRateLimit = batchErr.code === 'RATE_LIMIT_EXCEEDED' || batchErr.statusCode === 429 || batchErr.statusCode === 403 || /quota|rate limit|429/i.test(batchErr.message);
            let waitMs = 3000;
            if (isRateLimit) {
              waitMs = 45000;
              const match = (batchErr.message || '').match(/retry in ([0-9.]+)s/i);
              if (match && match[1]) {
                waitMs = Math.ceil(parseFloat(match[1]) * 1000) + 3000;
              }
            }
            console.warn(`[ScannedPdfEvaluationService] Vision batch ${startPage}-${endPage} failed (attempt ${retries}/${maxRetries}), waiting ${(waitMs / 1000).toFixed(1)}s before retry... Error: ${batchErr.message}`);
            await new Promise(r => setTimeout(r, waitMs));
          }
        }

        const batchText = response?.text || '';

        for (let pIdx = 0; pIdx < pageNumbers.length; pIdx++) {
          const pNum = pageNumbers[pIdx];
          const pageMarker = `--- Page ${pNum} ---`;
          const nextMarker = `--- Page ${pNum + 1} ---`;

          let pText = '';
          if (batchText.includes(pageMarker)) {
            const startIdx = batchText.indexOf(pageMarker) + pageMarker.length;
            const endIdx = nextMarker && batchText.includes(nextMarker) ? batchText.indexOf(nextMarker) : batchText.length;
            pText = batchText.substring(startIdx, endIdx).trim();
          } else {
            pText = batchText.trim();
          }

          pagesResult.push({
            pageNumber: pNum,
            text: pText,
            confidence: 0.95
          });
        }
      }

      const combinedText = pagesResult
        .map(p => `--- Page ${p.pageNumber} ---\n${p.text}`)
        .join('\n\n');

      console.log(`[ScannedPdfEvaluationService] Vision transcription complete (pages=${pagesResult.length}, chars=${combinedText.length}, lastPagePresent=${combinedText.includes(`--- Page ${totalPages} ---`)})`);

      return {
        success: true,
        sourceType: 'SCANNED_PDF',
        pages: pagesResult,
        combinedText,
        totalPages,
        pagesProcessed: pagesResult.length
      };
    } catch (err) {
      console.error('[ScannedPdfEvaluationService] Vision processing error:', err);
      return {
        success: false,
        reason: `Scanned PDF could not be evaluated because the page images could not be processed: ${err.message || 'Unknown vision error'}`
      };
    }
  }
}

module.exports = new ScannedPdfEvaluationService();
