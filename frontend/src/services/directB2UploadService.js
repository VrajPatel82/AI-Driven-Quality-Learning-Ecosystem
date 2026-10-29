import { lecturesAPI } from './api';

const DEFAULT_CONCURRENCY = 3;
const MAX_PART_RETRIES = 3;

/**
 * Upload a single part chunk via XHR to support real-time byte progress events
 */
function uploadPartXHR(uploadUrl, chunk, mimeType, onChunkProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);

    if (mimeType) {
      xhr.setRequestHeader('Content-Type', mimeType);
    } else {
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    }

    let lastLoaded = 0;
    if (xhr.upload && onChunkProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const delta = e.loaded - lastLoaded;
          if (delta > 0) {
            lastLoaded = e.loaded;
            onChunkProgress(delta);
          }
        }
      };
    }

    if (signal) {
      const abortHandler = () => {
        xhr.abort();
        reject(new Error('Upload cancelled'));
      };
      if (signal.aborted) {
        return reject(new Error('Upload cancelled'));
      }
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag');
        if (!etag) {
          return reject(new Error('Response missing ETag header'));
        }
        resolve({ ETag: etag });
      } else {
        reject(new Error(`Upload failed with status ${xhr.status} ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new TypeError('Failed to fetch'));
    xhr.ontimeout = () => reject(new Error('Upload timeout'));

    xhr.send(chunk);
  });
}

/**
 * Upload a single part to B2 presigned URL with retry logic
 */
async function uploadPartWithRetry(partNumber, uploadUrl, chunk, mimeType, onChunkProgress, signal) {
  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_PART_RETRIES) {
    attempt++;
    if (signal?.aborted) {
      throw new Error('Upload cancelled');
    }

    try {
      const res = await uploadPartXHR(uploadUrl, chunk, mimeType, onChunkProgress, signal);
      return {
        PartNumber: partNumber,
        ETag: res.ETag
      };
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError' || signal?.aborted) {
        throw new Error('Upload cancelled');
      }
      console.warn(`[DirectB2Upload] Part ${partNumber} attempt ${attempt} failed: ${err.message}`);
      if (attempt < MAX_PART_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  throw new Error(`Part ${partNumber} failed after ${MAX_PART_RETRIES} attempts: ${lastError?.message}`);
}

/**
 * Perform direct B2 upload for a single File object
 */
export async function uploadFileDirectToB2({
  file,
  folder = 'lectures',
  isAttachment = false,
  onProgress,
  signal
}) {
  if (!file) return null;

  // 1. Initiate upload on backend to get presigned part URLs & key
  const initRes = await lecturesAPI.initiateDirectUpload({
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || 'application/octet-stream',
    folder,
    isAttachment
  });

  const { uploadId, key, partSize, parts } = initRes.data;

  if (!uploadId || !key || !Array.isArray(parts) || parts.length === 0) {
    throw new Error('Invalid upload authorization response from server');
  }

  const uploadedParts = new Array(parts.length);
  let totalUploadedBytes = 0;

  // 2. Concurrency pool to upload parts concurrently (limit = 3)
  const queue = parts.map(p => ({ ...p }));
  const activeWorkers = [];

  const processQueue = async () => {
    while (queue.length > 0) {
      if (signal?.aborted) {
        throw new Error('Upload cancelled');
      }

      const partItem = queue.shift();
      const start = (partItem.partNumber - 1) * partSize;
      const end = Math.min(file.size, start + partSize);
      const chunk = file.slice(start, end);

      const partResult = await uploadPartWithRetry(
        partItem.partNumber,
        partItem.uploadUrl,
        chunk,
        file.type,
        (bytesJustUploaded) => {
          totalUploadedBytes += bytesJustUploaded;
          if (onProgress) {
            const pct = Math.min(100, Math.round((totalUploadedBytes / file.size) * 100));
            onProgress(pct, totalUploadedBytes, file.size);
          }
        },
        signal
      );

      uploadedParts[partItem.partNumber - 1] = partResult;
    }
  };

  try {
    for (let i = 0; i < Math.min(DEFAULT_CONCURRENCY, parts.length); i++) {
      activeWorkers.push(processQueue());
    }

    await Promise.all(activeWorkers);
  } catch (uploadErr) {
    // Abort multipart upload on backend if cancelled or failed
    try {
      await lecturesAPI.abortDirectUpload({ uploadId, key });
    } catch (abortErr) {
      console.warn('[DirectB2Upload] Error aborting failed upload:', abortErr.message);
    }
    throw uploadErr;
  }

  return {
    uploadId,
    key,
    parts: uploadedParts,
    fileName: file.name,
    fileSize: file.size
  };
}

/**
 * Upload main file and optional attachment directly to B2, then finalize lecture record
 */
export async function createOrUpdateLectureDirectB2({
  file,
  attachmentFile,
  lectureData,
  lectureId = null,
  onProgress
}) {
  let mainUploadResult = null;
  let attachmentUploadResult = null;

  try {
    let mainProgressPct = 0;
    let attachProgressPct = 0;

    const calculateOverallProgress = () => {
      const totalWeight = (file ? file.size : 0) + (attachmentFile ? attachmentFile.size : 0);
      if (totalWeight === 0) return 100;
      const currentDone = ((mainProgressPct / 100) * (file ? file.size : 0)) +
                          ((attachProgressPct / 100) * (attachmentFile ? attachmentFile.size : 0));
      return Math.min(99, Math.round((currentDone / totalWeight) * 100));
    };

    // 1. Upload main file directly to B2 if present
    if (file) {
      mainUploadResult = await uploadFileDirectToB2({
        file,
        folder: 'lectures',
        isAttachment: false,
        onProgress: (pct) => {
          mainProgressPct = pct;
          if (onProgress) onProgress(calculateOverallProgress());
        }
      });
    }

    // 2. Upload attachment directly to B2 if present
    if (attachmentFile) {
      attachmentUploadResult = await uploadFileDirectToB2({
        file: attachmentFile,
        folder: 'lectures/attachments',
        isAttachment: true,
        onProgress: (pct) => {
          attachProgressPct = pct;
          if (onProgress) onProgress(calculateOverallProgress());
        }
      });
    }

    // 3. Send completion request to backend
    const res = await lecturesAPI.completeDirectUpload({
      mainUpload: mainUploadResult,
      attachmentUpload: attachmentUploadResult,
      lectureData,
      lectureId
    });

    if (onProgress) onProgress(100);

    return res.data;
  } catch (err) {
    // Clean up any uploaded parts if process failed
    if (mainUploadResult?.uploadId) {
      lecturesAPI.abortDirectUpload({ uploadId: mainUploadResult.uploadId, key: mainUploadResult.key }).catch(() => {});
    }
    if (attachmentUploadResult?.uploadId) {
      lecturesAPI.abortDirectUpload({ uploadId: attachmentUploadResult.uploadId, key: attachmentUploadResult.key }).catch(() => {});
    }
    throw err;
  }
}
