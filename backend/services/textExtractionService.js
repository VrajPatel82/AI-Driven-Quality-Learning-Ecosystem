const fs = require('fs');
const path = require('path');
const scannedPdfEvaluationService = require('./scannedPdfEvaluationService');

/**
 * Service to extract normalized textual content from student submission files (.txt, .pdf, .docx).
 */
class TextExtractionService {
  /**
   * Main entry point to extract text from a file.
   * @param {string} filePath Absolute or relative filepath
   * @param {string} originalName Original filename
   * @returns {Promise<{ success: boolean, text?: string, reason?: string, isScannedPdf?: boolean, pagesProcessed?: number, totalPages?: number }>}
   */
  async extractText(filePath, originalName = '') {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, reason: `File not found on server at path: ${filePath}` };
      }

      const ext = path.extname(originalName || filePath).toLowerCase();

      if (ext === '.txt') {
        return await this.extractTxt(filePath);
      } else if (ext === '.pdf') {
        return await this.extractPdf(filePath);
      } else if (ext === '.docx' || ext === '.doc') {
        return await this.extractDocx(filePath);
      } else {
        return {
          success: false,
          reason: `Unsupported file format '${ext}'. AI evaluation currently supports .txt, .pdf, and .docx files.`
        };
      }
    } catch (err) {
      console.error('[TextExtractionService] Extraction error:', err);
      return {
        success: false,
        reason: `File extraction failed: ${err.message || 'Unknown extraction error'}`
      };
    }
  }

  /**
   * Extracts UTF-8 plain text from .txt files
   */
  async extractTxt(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const text = raw.replace(/\r\n/g, '\n').trim();
    if (!text) {
      return { success: false, reason: 'The uploaded .txt file is empty.' };
    }
    return { success: true, text, isScannedPdf: false };
  }

  /**
   * Extracts selectable text from text-based PDFs using pdf-parse.
   * If PDF contains no selectable text or low text (scanned document / handwritten),
   * falls back to scannedPdfEvaluationService vision pipeline.
   */
  async extractPdf(filePath) {
    try {
      const pdfParsePkg = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);

      let extractedText = '';

      if (typeof pdfParsePkg === 'function') {
        const data = await pdfParsePkg(dataBuffer);
        const pageCount = data.numpages || data.numPages || data.total;
        extractedText = (data.text || '').replace(/\r\n/g, '\n').trim();
      } else if (pdfParsePkg && typeof pdfParsePkg.PDFParse === 'function') {
        const uint8Array = new Uint8Array(dataBuffer);
        const parser = new pdfParsePkg.PDFParse(uint8Array);
        const res = await parser.getText();
        const pageCount = res?.numpages || res?.numPages || res?.total;
        extractedText = (res.text || (typeof res === 'string' ? res : '')).replace(/\r\n/g, '\n').trim();
      } else if (pdfParsePkg && typeof pdfParsePkg.default === 'function') {
        const data = await pdfParsePkg.default(dataBuffer);
        const pageCount = data.numpages || data.numPages || data.total;
        extractedText = (data.text || '').replace(/\r\n/g, '\n').trim();
      }

      // Strip out page number markers (e.g. "-- 1 of 22 --") and non-alphanumeric noise to check actual content
      const meaningfulContent = extractedText
        .replace(/--\s*\d+\s*of\s*\d+\s*--/gi, '')
        .replace(/[^a-zA-Z0-9]/g, '');

      if (extractedText && extractedText.length >= 10 && meaningfulContent.length >= 20) {
        // High quality text-based PDF: return fast standard text
        return { success: true, text: extractedText, isScannedPdf: false };
      }

      console.log(`[TextExtractionService] PDF at ${path.basename(filePath)} lacks selectable text (length: ${extractedText.length}, meaningful: ${meaningfulContent.length}). Triggering Scanned PDF Vision Fallback...`);

      // Fallback to Scanned PDF Vision Service
      const scannedResult = await scannedPdfEvaluationService.processScannedPdf(filePath);
      if (!scannedResult.success) {
        return {
          success: false,
          reason: scannedResult.reason || 'Scanned PDF could not be evaluated because the page images could not be processed.'
        };
      }

      return {
        success: true,
        text: scannedResult.combinedText,
        isScannedPdf: true,
        pagesProcessed: scannedResult.pagesProcessed,
        totalPages: scannedResult.totalPages
      };
    } catch (err) {
      console.warn('[TextExtractionService] pdf-parse error, falling back to Vision API:', err.message);
      const scannedResult = await scannedPdfEvaluationService.processScannedPdf(filePath);
      if (!scannedResult.success) {
        return {
          success: false,
          reason: scannedResult.reason || 'Scanned PDF could not be evaluated because the page images could not be processed.'
        };
      }
      return {
        success: true,
        text: scannedResult.combinedText,
        isScannedPdf: true,
        pagesProcessed: scannedResult.pagesProcessed,
        totalPages: scannedResult.totalPages
      };
    }
  }

  /**
   * Extracts raw text from DOCX files using mammoth
   */
  async extractDocx(filePath) {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      const extractedText = (result.value || '').replace(/\r\n/g, '\n').trim();

      if (!extractedText) {
        return { success: false, reason: 'The uploaded .docx document contains no readable text.' };
      }

      return { success: true, text: extractedText, isScannedPdf: false };
    } catch (err) {
      return {
        success: false,
        reason: `Failed to extract text from DOCX file: ${err.message}`
      };
    }
  }
}

module.exports = new TextExtractionService();
