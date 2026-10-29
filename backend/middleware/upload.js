const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure scratch directory exists for temporary upload streaming
const scratchDir = path.join(__dirname, '..', 'scratch');
if (!fs.existsSync(scratchDir)) {
  fs.mkdirSync(scratchDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, scratchDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `upload_${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const ext = path.extname(file.originalname || '').toLowerCase();
  file.filename = uniqueSuffix + ext;

  const allowedTypes = [
    'application/pdf',
    'text/plain',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/m4a',
    'audio/x-m4a',
    'audio/mp4',
    'audio/flac',
    'audio/x-flac',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ];

  const allowedExtensions = [
    '.pdf', '.txt', '.mp4', '.webm', '.mov', '.mp3', '.wav', '.ogg',
    '.m4a', '.flac', '.doc', '.docx', '.ppt', '.pptx', '.mpeg', '.mpga'
  ];

  // Strip codecs/parameters from MIME type (e.g., "video/webm;codecs=vp9,opus" -> "video/webm")
  const baseMime = (file.mimetype || '').split(';')[0].trim().toLowerCase();

  if (allowedTypes.includes(baseMime) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Allowed: TXT, PDF, MP4, WEBM, MP3, WAV, OGG, M4A, FLAC, DOC, DOCX, PPT, PPTX'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB max
  }
});

module.exports = upload;

