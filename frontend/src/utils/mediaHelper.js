/**
 * Media type detection helper
 * Examines lecture/lab fileType, fileName, fileKey, and fileUrl (ignoring query string tokens)
 */
export function detectMediaType(lecture) {
  if (!lecture) return { isVideo: false, isAudio: false, isPdf: false };

  const rawFileType = (lecture.fileType || '').toLowerCase();
  if (rawFileType === 'video') return { isVideo: true, isAudio: false, isPdf: false };
  if (rawFileType === 'audio') return { isVideo: false, isAudio: true, isPdf: false };
  if (rawFileType === 'pdf') return { isVideo: false, isAudio: false, isPdf: true };

  // If fileType is missing, 'document', or generic, inspect extensions on fileName, fileKey, or clean fileUrl (without query params)
  const fileUrl = lecture.fileUrl || (lecture.file ? `${window.location.origin}/${lecture.file}` : '');
  const cleanUrl = fileUrl.split('?')[0];
  const strToTest = `${lecture.fileName || ''} ${lecture.fileKey || ''} ${cleanUrl}`.toLowerCase();

  const isVideo = /\.(mp4|webm|mov|mkv|avi|flv)($|\?|\s)/i.test(strToTest) || /\.(mp4|webm|mov|mkv|avi|flv)/i.test(cleanUrl);
  const isAudio = /\.(mp3|wav|ogg|m4a|flac|aac)($|\?|\s)/i.test(strToTest) || /\.(mp3|wav|ogg|m4a|flac|aac)/i.test(cleanUrl);
  const isPdf = /\.pdf($|\?|\s)/i.test(strToTest) || /\.pdf/i.test(cleanUrl);

  return {
    isVideo,
    isAudio: !isVideo && isAudio,
    isPdf: !isVideo && !isAudio && isPdf
  };
}
