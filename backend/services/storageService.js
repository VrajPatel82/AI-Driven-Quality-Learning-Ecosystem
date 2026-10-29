const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, HeadObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl: awsGetSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');
const fs = require('fs');

/**
 * Backblaze B2 / S3-Compatible Object Storage Service Abstraction
 */

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const scratchDir = path.join(__dirname, '..', 'scratch');
if (!fs.existsSync(scratchDir)) {
  fs.mkdirSync(scratchDir, { recursive: true });
}

let s3Client = null;

function getR2Config() {
  const provider = (process.env.STORAGE_PROVIDER || 'b2').toLowerCase();
  const keyId = process.env.B2_KEY_ID || process.env.R2_ACCESS_KEY_ID || '';
  const applicationKey = process.env.B2_APPLICATION_KEY || process.env.R2_SECRET_ACCESS_KEY || '';
  const bucketName = process.env.B2_BUCKET_NAME || process.env.R2_BUCKET_NAME || '';
  
  let endpoint = process.env.B2_ENDPOINT || process.env.R2_ENDPOINT || '';
  if (endpoint && !endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
    endpoint = `https://${endpoint}`;
  }
  
  const publicUrl = process.env.B2_PUBLIC_URL || process.env.R2_PUBLIC_URL || '';

  const isConfigured = Boolean(
    (provider === 'b2' || provider === 'r2') &&
    keyId &&
    applicationKey &&
    bucketName &&
    endpoint
  );

  let region = 'us-east-1';
  if (endpoint) {
    const match = endpoint.match(/s3\.([a-z0-9-]+)\.backblazeb2\.com/i);
    if (match && match[1]) {
      region = match[1];
    }
  }

  return {
    provider,
    keyId,
    accessKeyId: keyId,
    applicationKey,
    secretAccessKey: applicationKey,
    bucketName,
    endpoint,
    publicUrl,
    region,
    isConfigured
  };
}

function getS3Client() {
  const config = getR2Config();
  if (!config.isConfigured) {
    return null;
  }
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.keyId,
        secretAccessKey: config.applicationKey
      }
    });
  }
  return s3Client;
}

/**
 * Check if Backblaze B2 / Cloud Storage is configured and active
 */
function isB2Configured() {
  return getR2Config().isConfigured;
}

function isR2Configured() {
  return isB2Configured();
}

/**
 * Upload an object to R2 (or local fallback if R2 not configured)
 * @param {Object} params
 * @param {Buffer} [params.fileBuffer] - Buffer containing file data
 * @param {string} [params.filePath] - Local file path if buffer not supplied
 * @param {string} params.fileName - Original file name
 * @param {string} [params.mimeType] - Content MIME type
 * @param {string} [params.folder] - R2 key prefix folder (e.g. 'lectures', 'audio', 'transcripts')
 * @param {string} [params.customKey] - Explicit storage key
 * @returns {Promise<{storageKey: string, fileUrl: string, fileSizeBytes: number, provider: string}>}
 */
async function uploadObject({ fileBuffer, filePath, fileName, mimeType = 'application/octet-stream', folder = 'uploads', customKey = null }) {
  const config = getR2Config();
  const hasBuffer = Boolean(fileBuffer);
  const hasFilePath = Boolean(filePath && fs.existsSync(filePath));

  if (!hasBuffer && !hasFilePath) {
    throw new Error('uploadObject requires either fileBuffer or valid filePath');
  }

  const fileSizeBytes = hasBuffer ? fileBuffer.length : fs.statSync(filePath).size;
  const ext = path.extname(fileName || 'file').toLowerCase();
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const storageKey = customKey || `${folder}/${uniqueSuffix}${ext}`;

  const client = getS3Client();

  if (client && config.isConfigured) {
    try {
      const bodyStream = hasBuffer ? fileBuffer : fs.createReadStream(filePath);
      const command = new PutObjectCommand({
        Bucket: config.bucketName,
        Key: storageKey,
        Body: bodyStream,
        ContentLength: fileSizeBytes,
        ContentType: mimeType
      });
      await client.send(command);

      let fileUrl = '';
      if (config.publicUrl) {
        fileUrl = `${config.publicUrl.replace(/\/$/, '')}/${storageKey}`;
      } else {
        fileUrl = `/api/resources/storage/object/${encodeURIComponent(storageKey)}`;
      }

      console.log(`[StorageService] Uploaded ${fileSizeBytes} bytes to R2/B2 (Bucket: ${config.bucketName}, Key: ${storageKey})`);

      return {
        storageKey,
        fileUrl,
        fileSizeBytes,
        provider: 'r2'
      };
    } catch (r2Err) {
      console.error('[StorageService] R2/B2 Upload Error:', r2Err.message);
      throw new Error(`Cloud storage upload failed: ${r2Err.message}`);
    }
  }

  // Local Fallback (if R2 credentials not set)
  const localFileName = customKey ? path.basename(customKey) : `${uniqueSuffix}${ext}`;
  const targetPath = path.join(uploadDir, localFileName);
  if (hasBuffer) {
    fs.writeFileSync(targetPath, fileBuffer);
  } else {
    fs.copyFileSync(filePath, targetPath);
  }

  console.log(`[StorageService] Local Fallback: Saved ${fileSizeBytes} bytes to ${targetPath}`);

  return {
    storageKey: localFileName,
    fileUrl: `/uploads/${localFileName}`,
    fileSizeBytes,
    provider: 'local'
  };
}

/**
 * Delete an object from R2 (or local fallback)
 * @param {string} storageKeyOrUrl
 */
async function deleteObject(storageKeyOrUrl) {
  if (!storageKeyOrUrl) return { success: false, message: 'No storage key provided' };

  let storageKey = storageKeyOrUrl;
  if (storageKey.startsWith('/uploads/')) {
    storageKey = storageKey.replace('/uploads/', '');
  } else if (storageKey.includes('/api/resources/storage/object/')) {
    const parts = storageKey.split('/api/resources/storage/object/');
    storageKey = decodeURIComponent(parts[1]);
  }

  const config = getR2Config();
  const client = getS3Client();

  // If key belongs to R2 (has folder prefix like lectures/ audio/ transcripts/ or R2 is active)
  if (client && config.isConfigured && (storageKey.includes('/') || !fs.existsSync(path.join(uploadDir, storageKey)))) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: config.bucketName,
        Key: storageKey
      });
      await client.send(command);
      console.log(`[StorageService] Deleted R2 object (Key: ${storageKey})`);
      return { success: true, provider: 'r2' };
    } catch (err) {
      console.error(`[StorageService] R2 Delete Error for key ${storageKey}:`, err.message);
      return { success: false, provider: 'r2', error: err.message, message: `R2 deletion failed: ${err.message}` };
    }
  }

  // Fallback / Legacy Local File Deletion
  const localPath = path.join(uploadDir, path.basename(storageKey));
  if (fs.existsSync(localPath)) {
    try {
      fs.unlinkSync(localPath);
      console.log(`[StorageService] Deleted local file ${localPath}`);
      return { success: true, provider: 'local' };
    } catch (e) {
      console.error(`[StorageService] Local file delete error: ${e.message}`);
      return { success: false, provider: 'local', error: e.message, message: `Local deletion failed: ${e.message}` };
    }
  }

  return { success: true, message: 'File deleted or non-existent' };
}

/**
 * Get readable object stream from R2 or local disk
 * @param {string} storageKeyOrUrl
 */
/**
 * Helper to parse HTTP Range header
 * @param {string} rangeHeader 
 * @param {number} totalSize 
 * @returns {{start: number, end: number}|{invalid: boolean}|null}
 */
function parseByteRange(rangeHeader, totalSize) {
  if (!rangeHeader || typeof rangeHeader !== 'string' || !rangeHeader.startsWith('bytes=')) {
    return null;
  }

  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    return { invalid: true };
  }

  const startStr = match[1];
  const endStr = match[2];

  if (!startStr && !endStr) {
    return { invalid: true };
  }

  let start = 0;
  let end = totalSize > 0 ? totalSize - 1 : 0;

  if (startStr && endStr) {
    start = parseInt(startStr, 10);
    end = parseInt(endStr, 10);
  } else if (startStr) {
    start = parseInt(startStr, 10);
    if (totalSize > 0) end = totalSize - 1;
  } else if (endStr) {
    const suffixLength = parseInt(endStr, 10);
    if (totalSize > 0) {
      start = Math.max(0, totalSize - suffixLength);
      end = totalSize - 1;
    }
  }

  if (isNaN(start) || isNaN(end) || start < 0 || end < start) {
    return { invalid: true };
  }

  if (totalSize > 0) {
    if (start >= totalSize) {
      return { invalid: true };
    }
    if (end >= totalSize) {
      end = totalSize - 1;
    }
  }

  return { start, end };
}

/**
 * Get readable object stream from R2 or local disk (with byte-range streaming support)
 * @param {string} storageKeyOrUrl
 * @param {string} [rangeHeader=null]
 */
async function getObjectStream(storageKeyOrUrl, rangeHeader = null) {
  let storageKey = storageKeyOrUrl;
  if (storageKey.includes('?')) {
    storageKey = storageKey.split('?')[0];
  }
  if (storageKey.startsWith('/uploads/')) {
    storageKey = storageKey.replace('/uploads/', '');
  } else if (storageKey.includes('/api/resources/storage/object/')) {
    storageKey = decodeURIComponent(storageKey.split('/api/resources/storage/object/')[1]);
    if (storageKey.includes('?')) {
      storageKey = storageKey.split('?')[0];
    }
  }

  const config = getR2Config();
  const client = getS3Client();

  const getMimeType = (filename) => {
    const ext = path.extname(filename).toLowerCase();
    const mimeMap = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.pdf': 'application/pdf'
    };
    return mimeMap[ext] || 'application/octet-stream';
  };

  if (client && config.isConfigured && (storageKey.includes('/') || !fs.existsSync(path.join(uploadDir, storageKey)))) {
    const commandInput = {
      Bucket: config.bucketName,
      Key: storageKey
    };

    if (rangeHeader && typeof rangeHeader === 'string' && rangeHeader.startsWith('bytes=')) {
      commandInput.Range = rangeHeader;
    }

    try {
      const command = new GetObjectCommand(commandInput);
      const response = await client.send(command);

      const isPartial = Boolean(response.ContentRange);
      return {
        stream: response.Body,
        contentType: response.ContentType || getMimeType(storageKey),
        contentLength: response.ContentLength,
        contentRange: response.ContentRange,
        isPartial,
        statusCode: isPartial ? 206 : 200,
        provider: 'r2'
      };
    } catch (err) {
      if (err.name === 'InvalidRange' || err.$metadata?.httpStatusCode === 416) {
        return {
          isInvalidRange: true,
          statusCode: 416,
          provider: 'r2'
        };
      }
      throw err;
    }
  }

  const localPath = path.join(uploadDir, path.basename(storageKey));
  if (fs.existsSync(localPath)) {
    const stat = fs.statSync(localPath);
    const totalSize = stat.size;
    const contentType = getMimeType(localPath);

    if (rangeHeader) {
      const parsedRange = parseByteRange(rangeHeader, totalSize);
      if (parsedRange && parsedRange.invalid) {
        return {
          isInvalidRange: true,
          totalSize,
          statusCode: 416,
          provider: 'local'
        };
      }

      if (parsedRange) {
        const { start, end } = parsedRange;
        const stream = fs.createReadStream(localPath, { start, end });
        const contentLength = end - start + 1;
        const contentRange = `bytes ${start}-${end}/${totalSize}`;

        return {
          stream,
          contentType,
          contentLength,
          contentRange,
          isPartial: true,
          statusCode: 206,
          totalSize,
          provider: 'local'
        };
      }
    }

    return {
      stream: fs.createReadStream(localPath),
      contentType,
      contentLength: totalSize,
      isPartial: false,
      statusCode: 200,
      totalSize,
      provider: 'local'
    };
  }

  throw new Error(`Storage object not found: ${storageKeyOrUrl}`);
}

/**
 * Get a signed URL or public URL for an R2 object / backend proxy streaming (or local route fallback)
 * @param {string} storageKeyOrUrl
 * @param {number} [expiresInSeconds=3600]
 * @param {Object|string} [user] - User object or user ID to generate short-lived media streaming token
 */
async function getSignedUrl(storageKeyOrUrl, expiresInSeconds = 3600, user = null) {
  if (!storageKeyOrUrl) return '';
  if (storageKeyOrUrl.startsWith('http://') || storageKeyOrUrl.startsWith('https://')) {
    return storageKeyOrUrl;
  }

  let storageKey = storageKeyOrUrl;
  if (storageKey.startsWith('/uploads/')) {
    return storageKey; // Legacy local path
  } else if (storageKey.includes('/api/resources/storage/object/')) {
    storageKey = decodeURIComponent(storageKey.split('/api/resources/storage/object/')[1]);
    if (storageKey.includes('?')) {
      storageKey = storageKey.split('?')[0];
    }
  }

  const config = getR2Config();

  if (config.isConfigured && config.publicUrl) {
    return `${config.publicUrl.replace(/\/$/, '')}/${storageKey}`;
  }

  if (user) {
    const jwt = require('jsonwebtoken');
    const userId = user._id || user;
    if (process.env.JWT_SECRET) {
      const mediaToken = jwt.sign(
        { id: userId, purpose: 'media_stream' },
        process.env.JWT_SECRET,
        { expiresIn: expiresInSeconds }
      );
      return `/api/resources/storage/object/${encodeURIComponent(storageKey)}?token=${mediaToken}`;
    }
  }

  return `/api/resources/storage/object/${encodeURIComponent(storageKey)}`;
}

/**
 * Downloads R2 object or resolves local path to a temporary local file.
 * Returns temp path and cleanup function.
 * Used for AI tools (e.g. Whisper transcription) requiring local file paths.
 */
async function downloadObjectToTempFile(storageKeyOrUrl) {
  let storageKey = storageKeyOrUrl;
  if (storageKey.startsWith('/uploads/')) {
    const localName = storageKey.replace('/uploads/', '');
    const localPath = path.join(uploadDir, localName);
    if (fs.existsSync(localPath)) {
      return { tempPath: localPath, cleanup: () => {} };
    }
  } else if (storageKey.includes('/api/resources/storage/object/')) {
    storageKey = decodeURIComponent(storageKey.split('/api/resources/storage/object/')[1]);
  }

  // Check if local file exists
  const localDirectPath = path.join(uploadDir, path.basename(storageKey));
  if (fs.existsSync(localDirectPath)) {
    return { tempPath: localDirectPath, cleanup: () => {} };
  }

  // Otherwise download from R2 to scratch folder
  const config = getR2Config();
  const client = getS3Client();
  if (!client || !config.isConfigured) {
    throw new Error(`File ${storageKeyOrUrl} not found on local disk and R2 is not configured.`);
  }

  const ext = path.extname(storageKey) || '.tmp';
  const tempFileName = `temp_${Date.now()}_${Math.round(Math.random() * 1E6)}${ext}`;
  const tempFilePath = path.join(scratchDir, tempFileName);

  const { stream } = await getObjectStream(storageKey);
  const writeStream = fs.createWriteStream(tempFilePath);

  await new Promise((resolve, reject) => {
    stream.pipe(writeStream);
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  return {
    tempPath: tempFilePath,
    cleanup: () => {
      if (fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (e) {}
      }
    }
  };
}

/**
 * Initiate an S3 multipart upload against Backblaze B2 bucket
 * @param {Object} params
 * @param {string} params.fileName - Original file name
 * @param {string} [params.mimeType] - Content MIME type
 * @param {string} [params.folder='lectures'] - Folder key prefix
 * @param {string} [params.customKey=null] - Optional explicit storage key
 * @returns {Promise<{uploadId: string, storageKey: string}>}
 */
async function initiateMultipartUpload({ fileName, mimeType = 'application/octet-stream', folder = 'lectures', customKey = null }) {
  const config = getR2Config();
  const client = getS3Client();

  if (!client || !config.isConfigured) {
    throw new Error('Cloud storage (B2) is not configured for direct multipart upload.');
  }

  const ext = path.extname(fileName || 'file').toLowerCase();
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const storageKey = customKey || `${folder}/${uniqueSuffix}${ext}`;

  const command = new CreateMultipartUploadCommand({
    Bucket: config.bucketName,
    Key: storageKey,
    ContentType: mimeType
  });

  const response = await client.send(command);

  console.log(`[StorageService] Initiated direct B2 multipart upload (UploadId: ${response.UploadId}, Key: ${storageKey})`);

  return {
    uploadId: response.UploadId,
    storageKey
  };
}

/**
 * Generate short-lived presigned UploadPart URLs for direct browser upload
 * @param {Object} params
 * @param {string} params.storageKey - Storage object key
 * @param {string} params.uploadId - B2 UploadId
 * @param {number} params.totalParts - Number of parts
 * @param {number} [params.expiresIn=900] - Expiration time in seconds (default 15 mins)
 * @returns {Promise<Array<{partNumber: number, uploadUrl: string}>>}
 */
async function getPresignedPartUrls({ storageKey, uploadId, totalParts, expiresIn = 900 }) {
  const config = getR2Config();
  const client = getS3Client();

  if (!client || !config.isConfigured) {
    throw new Error('Cloud storage (B2) is not configured.');
  }

  const parts = [];
  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    const command = new UploadPartCommand({
      Bucket: config.bucketName,
      Key: storageKey,
      UploadId: uploadId,
      PartNumber: partNumber
    });

    const uploadUrl = await awsGetSignedUrl(client, command, { expiresIn });
    parts.push({
      partNumber,
      uploadUrl
    });
  }

  return parts;
}

/**
 * Complete an S3 multipart upload after all parts are uploaded directly by the browser
 * @param {Object} params
 * @param {string} params.storageKey - Storage object key
 * @param {string} params.uploadId - B2 UploadId
 * @param {Array<{PartNumber: number, ETag: string}>} params.parts - Uploaded parts array
 * @returns {Promise<{storageKey: string, fileUrl: string, fileSizeBytes: number, provider: string}>}
 */
async function completeMultipartUpload({ storageKey, uploadId, parts }) {
  const config = getR2Config();
  const client = getS3Client();

  if (!client || !config.isConfigured) {
    throw new Error('Cloud storage (B2) is not configured.');
  }

  // Ensure parts are sorted by PartNumber
  const sortedParts = [...parts].sort((a, b) => Number(a.PartNumber) - Number(b.PartNumber)).map(p => ({
    PartNumber: Number(p.PartNumber),
    ETag: p.ETag.startsWith('"') && p.ETag.endsWith('"') ? p.ETag : `"${p.ETag}"`
  }));

  const command = new CompleteMultipartUploadCommand({
    Bucket: config.bucketName,
    Key: storageKey,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: sortedParts
    }
  });

  await client.send(command);

  // Verify object existence and get actual completed size
  let fileSizeBytes = 0;
  try {
    const headCmd = new HeadObjectCommand({
      Bucket: config.bucketName,
      Key: storageKey
    });
    const headRes = await client.send(headCmd);
    fileSizeBytes = headRes.ContentLength || 0;
  } catch (headErr) {
    console.warn(`[StorageService] Could not fetch HeadObject size for ${storageKey}:`, headErr.message);
  }

  let fileUrl = '';
  if (config.publicUrl) {
    fileUrl = `${config.publicUrl.replace(/\/$/, '')}/${storageKey}`;
  } else {
    fileUrl = `/api/resources/storage/object/${encodeURIComponent(storageKey)}`;
  }

  console.log(`[StorageService] Completed B2 direct multipart upload for Key: ${storageKey} (${fileSizeBytes} bytes)`);

  // Complete any pending upload reservation
  try {
    const StorageUploadReservation = require('../models/StorageUploadReservation');
    await StorageUploadReservation.completeReservation(storageKey);
  } catch (resErr) {
    // Non-blocking
  }

  return {
    storageKey,
    fileUrl,
    fileSizeBytes,
    provider: 'r2'
  };
}

/**
 * Abort an S3 multipart upload to clean up uploaded parts
 * @param {Object} params
 * @param {string} params.storageKey - Storage object key
 * @param {string} params.uploadId - B2 UploadId
 */
async function abortMultipartUpload({ storageKey, uploadId }) {
  const config = getR2Config();
  const client = getS3Client();

  if (!client || !config.isConfigured || !uploadId) {
    return { success: false };
  }

  try {
    const command = new AbortMultipartUploadCommand({
      Bucket: config.bucketName,
      Key: storageKey,
      UploadId: uploadId
    });

    await client.send(command);
    console.log(`[StorageService] Aborted B2 multipart upload (UploadId: ${uploadId}, Key: ${storageKey})`);

    // Cancel any pending upload reservation
    try {
      const StorageUploadReservation = require('../models/StorageUploadReservation');
      await StorageUploadReservation.cancelReservation(storageKey);
    } catch (resErr) {
      // Non-blocking
    }

    return { success: true };
  } catch (err) {
    console.error(`[StorageService] Error aborting multipart upload for Key ${storageKey}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Safe, read-only Backblaze B2 storage usage inspection mechanism.
 * Enumerates all active live objects in the configured bucket using ListObjectsV2Command with pagination.
 * Computes exact cumulative byte sizes, counts objects, caches metrics in StorageSystemConfig.
 * Never leaks B2 keys or credentials.
 * Handles stale/failure states safely without falsely reporting zero.
 */
// In-flight scan promise lock to de-duplicate concurrent B2 requests
let inFlightB2Scan = null;

async function getB2ActualStorageUsage({ forceRefresh = false } = {}) {
  const StorageSystemConfig = require('../models/StorageSystemConfig');
  const configDoc = await StorageSystemConfig.getConfig();

  const config = getR2Config();
  const client = getS3Client();

  if (!client || !config.isConfigured) {
    return {
      provider: configDoc.provider || 'BACKBLAZE_B2',
      bucketName: configDoc.bucketName || 'ai-lecture-db',
      actualUsedBytes: configDoc.lastB2UsageBytes || 0,
      objectCount: configDoc.lastB2ObjectCount || 0,
      masterPoolBytes: configDoc.masterPoolBytes,
      remainingPoolBytes: Math.max(0, configDoc.masterPoolBytes - (configDoc.lastB2UsageBytes || 0)),
      lastSyncedAt: configDoc.lastB2SyncAt,
      syncStatus: configDoc.lastB2SyncStatus === 'SUCCESS' ? 'SUCCESS' : 'UNAVAILABLE',
      isStale: true,
      error: 'B2 storage client is not configured or offline'
    };
  }

  const CACHE_TTL_MS = 5 * 60 * 1000;
  const hasEverSynced = Boolean(configDoc.lastB2SyncAt);
  const isFresh = hasEverSynced && (Date.now() - new Date(configDoc.lastB2SyncAt).getTime() < CACHE_TTL_MS) && configDoc.lastB2SyncStatus === 'SUCCESS';

  // If not forcing refresh and we have existing cached data, return cached immediately to never block the UI
  if (!forceRefresh && hasEverSynced) {
    // If stale, trigger a non-blocking background refresh if one is not already running
    if (!isFresh && !inFlightB2Scan) {
      inFlightB2Scan = executeB2Scan(client, config, configDoc)
        .catch(err => console.error('[StorageService] Background B2 refresh failed:', err.message))
        .finally(() => { inFlightB2Scan = null; });
    }

    return {
      provider: configDoc.provider,
      bucketName: configDoc.bucketName,
      actualUsedBytes: configDoc.lastB2UsageBytes || 0,
      objectCount: configDoc.lastB2ObjectCount || 0,
      masterPoolBytes: configDoc.masterPoolBytes,
      remainingPoolBytes: Math.max(0, configDoc.masterPoolBytes - (configDoc.lastB2UsageBytes || 0)),
      lastSyncedAt: configDoc.lastB2SyncAt,
      syncStatus: configDoc.lastB2SyncStatus || 'SUCCESS',
      isStale: !isFresh
    };
  }

  // If forceRefresh or no sync data ever existed, perform or join the in-flight scan
  if (inFlightB2Scan) {
    return await inFlightB2Scan;
  }

  inFlightB2Scan = executeB2Scan(client, config, configDoc);
  try {
    return await inFlightB2Scan;
  } finally {
    inFlightB2Scan = null;
  }
}

/**
 * Internal helper to scan B2 with timeout protection and update StorageSystemConfig
 */
async function executeB2Scan(client, config, configDoc) {
  try {
    let totalBytes = 0;
    let totalObjects = 0;
    let continuationToken = null;

    // Use AbortController with 6s timeout so B2 latency never hangs indefinitely
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 6000);

    try {
      do {
        const listCommand = new ListObjectsV2Command({
          Bucket: config.bucketName,
          ContinuationToken: continuationToken
        });
        const response = await client.send(listCommand, { abortSignal: abortController.signal });

        if (response.Contents && Array.isArray(response.Contents)) {
          for (const item of response.Contents) {
            totalObjects += 1;
            totalBytes += (item.Size || 0);
          }
        }

        continuationToken = response.IsTruncated ? response.NextContinuationToken : null;
      } while (continuationToken);
    } finally {
      clearTimeout(timeoutId);
    }

    configDoc.lastB2UsageBytes = totalBytes;
    configDoc.lastB2ObjectCount = totalObjects;
    configDoc.lastB2SyncAt = new Date();
    configDoc.lastB2SyncStatus = 'SUCCESS';
    configDoc.lastB2SyncError = null;
    await configDoc.save();

    return {
      provider: configDoc.provider,
      bucketName: configDoc.bucketName,
      actualUsedBytes: totalBytes,
      objectCount: totalObjects,
      masterPoolBytes: configDoc.masterPoolBytes,
      remainingPoolBytes: Math.max(0, configDoc.masterPoolBytes - totalBytes),
      lastSyncedAt: configDoc.lastB2SyncAt,
      syncStatus: 'SUCCESS',
      isStale: false
    };
  } catch (err) {
    console.error('[StorageService] Error inspecting B2 storage usage:', err.message);
    configDoc.lastB2SyncStatus = 'FAILED';
    configDoc.lastB2SyncError = err.message;
    try { await configDoc.save(); } catch (e) {}

    return {
      provider: configDoc.provider,
      bucketName: configDoc.bucketName,
      actualUsedBytes: configDoc.lastB2UsageBytes || 0,
      objectCount: configDoc.lastB2ObjectCount || 0,
      masterPoolBytes: configDoc.masterPoolBytes,
      remainingPoolBytes: Math.max(0, configDoc.masterPoolBytes - (configDoc.lastB2UsageBytes || 0)),
      lastSyncedAt: configDoc.lastB2SyncAt,
      syncStatus: 'UNAVAILABLE',
      isStale: true,
      error: `B2 usage inspection failed: ${err.message}`
    };
  }
}

/**
 * Storage Reconciliation Diagnostic
 * Compares active MongoDB FileMetadata against live/cached Backblaze B2 physical objects.
 */
async function getStorageReconciliation() {
  const FileMetadata = require('../models/FileMetadata');
  const StorageSystemConfig = require('../models/StorageSystemConfig');
  const configDoc = await StorageSystemConfig.getConfig();

  // 1. Authoritative active FileMetadata total
  const filesAgg = await FileMetadata.aggregate([
    { $match: { isDeleted: false } },
    { $group: { _id: null, totalBytes: { $sum: '$fileSizeBytes' }, count: { $sum: 1 } } }
  ]);
  const applicationRecordedBytes = filesAgg[0]?.totalBytes || 0;
  const applicationFileCount = filesAgg[0]?.count || 0;

  // 2. B2 actual storage usage
  const b2Usage = await getB2ActualStorageUsage({ forceRefresh: false });
  const b2ActualBytes = b2Usage.actualUsedBytes || 0;
  const b2ObjectCount = b2Usage.objectCount || 0;

  // 3. Difference analysis
  const differenceBytes = Math.abs(applicationRecordedBytes - b2ActualBytes);
  const differencePercentage = b2ActualBytes > 0
    ? Number(((differenceBytes / b2ActualBytes) * 100).toFixed(2))
    : (applicationRecordedBytes > 0 ? 100 : 0);

  let status = 'MATCH';
  if (b2Usage.syncStatus === 'UNAVAILABLE' || b2Usage.syncStatus === 'FAILED') {
    status = 'B2_UNAVAILABLE';
  } else if (differenceBytes === 0) {
    status = 'MATCH';
  } else if (differencePercentage <= 5) {
    status = 'MINOR_MISMATCH';
  } else {
    status = 'MISMATCH';
  }

  return {
    provider: configDoc.provider,
    bucketName: configDoc.bucketName,
    masterPoolBytes: configDoc.masterPoolBytes,
    applicationRecordedBytes,
    applicationFileCount,
    b2ActualBytes,
    b2ObjectCount,
    differenceBytes,
    differencePercentage,
    status,
    lastB2SyncAt: b2Usage.lastSyncedAt,
    b2SyncStatus: b2Usage.syncStatus,
    isStale: b2Usage.isStale
  };
}

module.exports = {
  isB2Configured,
  isR2Configured,
  getB2Config: getR2Config,
  getR2Config,
  uploadObject,
  deleteObject,
  getObjectStream,
  getSignedUrl,
  downloadObjectToTempFile,
  initiateMultipartUpload,
  getPresignedPartUrls,
  completeMultipartUpload,
  abortMultipartUpload,
  getB2ActualStorageUsage,
  getStorageReconciliation
};

