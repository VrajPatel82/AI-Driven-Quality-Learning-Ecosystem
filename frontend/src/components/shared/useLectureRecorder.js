import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Supported recording modes for the lecture recorder
 */
export const RECORDING_MODES = {
  SCREEN_MIC: 'screen-mic',
  CAMERA_MIC: 'camera-mic',
  SCREEN_CAMERA_MIC: 'screen-camera-mic'
};

/**
 * Returns the best supported video MIME type on the current browser.
 */
export const getBestSupportedMimeType = () => {
  if (typeof window === 'undefined' || !window.MediaRecorder) {
    return 'video/webm';
  }

  const candidateTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4'
  ];

  for (const type of candidateTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return 'video/webm';
};

/**
 * Formats duration in seconds into HH:MM:SS or MM:SS
 */
export const formatDuration = (totalSeconds = 0) => {
  const safeSeconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
};

/**
 * Formats byte size into human readable string
 */
export const formatFileSize = (bytes = 0) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

/**
 * Reads actual video duration from recorded Blob metadata with reliable fallback
 */
export const calculateBlobDuration = (blob, fallbackSeconds = 0) => {
  return new Promise((resolve) => {
    if (!blob || typeof window === 'undefined') {
      return resolve(Math.round(fallbackSeconds || 0));
    }

    const tempUrl = URL.createObjectURL(blob);
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';

    let isResolved = false;

    const cleanupAndResolve = (dur) => {
      if (!isResolved) {
        isResolved = true;
        try {
          URL.revokeObjectURL(tempUrl);
        } catch (e) { /* ignore */ }
        tempVideo.onloadedmetadata = null;
        tempVideo.onerror = null;
        tempVideo.ontimeupdate = null;

        const parsed = Number(dur);
        const finalDuration =
          Number.isFinite(parsed) && parsed > 0
            ? Math.round(parsed)
            : Math.max(1, Math.round(fallbackSeconds || 0));

        resolve(finalDuration);
      }
    };

    // 1500ms safety timeout if loadedmetadata doesn't fire
    const timeoutId = setTimeout(() => {
      cleanupAndResolve(fallbackSeconds);
    }, 1500);

    tempVideo.onloadedmetadata = () => {
      clearTimeout(timeoutId);
      // WebM recorded blobs in Chrome often report duration as Infinity
      if (tempVideo.duration === Infinity || isNaN(tempVideo.duration)) {
        tempVideo.currentTime = 1e101;
        tempVideo.ontimeupdate = () => {
          tempVideo.ontimeupdate = null;
          if (tempVideo.duration !== Infinity && !isNaN(tempVideo.duration) && tempVideo.duration > 0) {
            cleanupAndResolve(tempVideo.duration);
          } else if (tempVideo.currentTime > 0 && tempVideo.currentTime < 1e100) {
            cleanupAndResolve(tempVideo.currentTime);
          } else {
            cleanupAndResolve(fallbackSeconds);
          }
        };
      } else if (tempVideo.duration > 0) {
        cleanupAndResolve(tempVideo.duration);
      } else {
        cleanupAndResolve(fallbackSeconds);
      }
    };

    tempVideo.onerror = () => {
      clearTimeout(timeoutId);
      cleanupAndResolve(fallbackSeconds);
    };

    tempVideo.src = tempUrl;
  });
};

/**
 * Custom React Hook for managing browser-side lecture recording
 */
export default function useLectureRecorder() {
  const [recordingMode, setRecordingMode] = useState(RECORDING_MODES.SCREEN_MIC);
  const [status, setStatus] = useState('idle'); // 'idle' | 'preparing' | 'recording' | 'paused' | 'stopped'
  const [duration, setDuration] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [recordedMimeType, setRecordedMimeType] = useState(null);
  const [recordedSize, setRecordedSize] = useState(0);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [liveStream, setLiveStream] = useState(null);
  const [error, setError] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraMuted, setIsCameraMuted] = useState(false);

  // Stream and element references
  const displayStreamRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const micStreamRef = useRef(null);
  const canvasStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const animationFrameRef = useRef(null);
  const canvasRef = useRef(null);
  const screenVideoRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const audioContextRef = useRef(null);
  const durationRef = useRef(0);

  /**
   * Helper to stop all tracks in a MediaStream
   */
  const stopStreamTracks = (stream) => {
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('[Recorder] Failed to stop track:', e);
        }
      });
    }
  };

  /**
   * Stops all active media streams and resets stream refs
   */
  const cleanupAllStreams = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (screenVideoRef.current) {
      try {
        screenVideoRef.current.pause();
        screenVideoRef.current.srcObject = null;
      } catch (e) { /* ignore */ }
    }

    if (cameraVideoRef.current) {
      try {
        cameraVideoRef.current.pause();
        cameraVideoRef.current.srcObject = null;
      } catch (e) { /* ignore */ }
    }

    stopStreamTracks(displayStreamRef.current);
    stopStreamTracks(cameraStreamRef.current);
    stopStreamTracks(micStreamRef.current);
    stopStreamTracks(canvasStreamRef.current);

    displayStreamRef.current = null;
    cameraStreamRef.current = null;
    micStreamRef.current = null;
    canvasStreamRef.current = null;
    setLiveStream(null);

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (e) { /* ignore */ }
      audioContextRef.current = null;
    }

    setIsCameraActive(false);
  }, []);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      cleanupAllStreams();
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
    };
  }, [cleanupAllStreams, recordedUrl]);

  /**
   * Start duration timer
   */
  const startTimer = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      durationRef.current += 1;
      setDuration(durationRef.current);
    }, 1000);
  };

  /**
   * Pause duration timer
   */
  const pauseTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  /**
   * Resume duration timer
   */
  const resumeTimer = () => {
    if (!timerIntervalRef.current) {
      timerIntervalRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);
      }, 1000);
    }
  };

  /**
   * Finalizes recorded chunks into a single Blob and calculates exact duration
   */
  const finalizeRecording = useCallback(() => {
    pauseTimer();
    const finalTimerDuration = durationRef.current;
    const mimeType = mediaRecorderRef.current?.mimeType || getBestSupportedMimeType();
    const chunks = recordedChunksRef.current;

    let finalBlob = null;
    let url = null;

    if (chunks.length > 0) {
      finalBlob = new Blob(chunks, { type: mimeType });
      url = URL.createObjectURL(finalBlob);

      setRecordedBlob(finalBlob);
      setRecordedUrl(url);
      setRecordedMimeType(mimeType);
      setRecordedSize(finalBlob.size);
      setStatus('stopped');

      // Calculate duration from metadata with timer fallback
      calculateBlobDuration(finalBlob, finalTimerDuration).then((exactDuration) => {
        setRecordedDuration(exactDuration);
        setDuration(exactDuration);
      });
    } else {
      setError('No media data was recorded. Please try again.');
      setStatus('idle');
    }

    cleanupAllStreams();
  }, [cleanupAllStreams]);

  /**
   * Stops recording and triggers finalization
   */
  const stopRecording = useCallback(() => {
    pauseTimer();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch (err) {
        console.warn('[Recorder] Error while stopping recorder:', err);
        finalizeRecording();
      }
    } else {
      finalizeRecording();
    }
  }, [finalizeRecording]);

  /**
   * Begins the recording session based on current recordingMode
   */
  const startRecording = async () => {
    setError(null);

    // Browser compatibility checks
    if (typeof window === 'undefined' || !navigator.mediaDevices) {
      setError('Your browser does not support media capture APIs.');
      return;
    }

    if (!window.MediaRecorder) {
      setError('Your browser does not support MediaRecorder.');
      return;
    }

    if (
      (recordingMode === RECORDING_MODES.SCREEN_MIC ||
        recordingMode === RECORDING_MODES.SCREEN_CAMERA_MIC) &&
      !navigator.mediaDevices.getDisplayMedia
    ) {
      setError('Your browser does not support Screen Recording (getDisplayMedia).');
      return;
    }

    // Revoke old URL if re-recording
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
      setRecordedBlob(null);
    }

    setStatus('preparing');
    durationRef.current = 0;
    setDuration(0);
    setRecordedDuration(0);
    recordedChunksRef.current = [];

    try {
      let finalStream = null;
      let displayStream = null;
      let cameraStream = null;
      let micStream = null;

      // -------------------------------------------------------------
      // 1. Screen + Microphone (Default Mode)
      // -------------------------------------------------------------
      if (recordingMode === RECORDING_MODES.SCREEN_MIC) {
        try {
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always', displaySurface: 'monitor' },
            audio: true // Captures system/tab audio if shared
          });
        } catch (screenErr) {
          if (screenErr.name === 'NotAllowedError' || screenErr.name === 'AbortError') {
            setError('Screen sharing was cancelled.');
          } else {
            setError('Could not capture screen: ' + (screenErr.message || 'Permission denied'));
          }
          setStatus('idle');
          return;
        }

        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          });
        } catch (micErr) {
          stopStreamTracks(displayStream);
          setError('Microphone permission was denied. Please allow microphone access to record audio.');
          setStatus('idle');
          return;
        }

        displayStreamRef.current = displayStream;
        micStreamRef.current = micStream;

        // Expose live display stream for Google Meet style live preview
        setLiveStream(displayStream);

        // Listen for Chrome's "Stop sharing" native button
        const screenVideoTrack = displayStream.getVideoTracks()[0];
        if (screenVideoTrack) {
          screenVideoTrack.onended = () => {
            console.log('[Recorder] Screen track ended via Chrome Stop Sharing');
            stopRecording();
          };
        }

        // Mix screen audio + mic audio via AudioContext
        const audioTracks = [];
        const screenAudioTracks = displayStream.getAudioTracks();
        const micAudioTracks = micStream.getAudioTracks();

        if (screenAudioTracks.length > 0 && typeof window.AudioContext !== 'undefined') {
          try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            const audioCtx = new AudioCtx();
            audioContextRef.current = audioCtx;
            const dest = audioCtx.createMediaStreamDestination();

            const micSource = audioCtx.createMediaStreamSource(micStream);
            micSource.connect(dest);

            const screenSource = audioCtx.createMediaStreamSource(displayStream);
            screenSource.connect(dest);

            audioTracks.push(...dest.stream.getAudioTracks());
          } catch (mixErr) {
            console.warn('[Recorder] AudioContext mix failed, falling back to mic audio:', mixErr);
            audioTracks.push(...micAudioTracks);
          }
        } else {
          audioTracks.push(...micAudioTracks);
        }

        finalStream = new MediaStream([screenVideoTrack, ...audioTracks]);
      }

      // -------------------------------------------------------------
      // 2. Camera + Microphone
      // -------------------------------------------------------------
      else if (recordingMode === RECORDING_MODES.CAMERA_MIC) {
        try {
          cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          });
        } catch (camErr) {
          setError('Camera or microphone permission was denied. Please allow device permissions to record.');
          setStatus('idle');
          return;
        }

        cameraStreamRef.current = cameraStream;
        setIsCameraActive(true);

        // Expose live camera stream for preview
        setLiveStream(cameraStream);

        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = cameraStream;
          cameraVideoRef.current.muted = true;
          try {
            await cameraVideoRef.current.play();
          } catch (e) { /* ignore */ }
        }

        finalStream = cameraStream;
      }

      // -------------------------------------------------------------
      // 3. Screen + Camera + Microphone (Composited Canvas with PIP)
      // -------------------------------------------------------------
      else if (recordingMode === RECORDING_MODES.SCREEN_CAMERA_MIC) {
        try {
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always' },
            audio: true
          });
        } catch (screenErr) {
          if (screenErr.name === 'NotAllowedError' || screenErr.name === 'AbortError') {
            setError('Screen sharing was cancelled.');
          } else {
            setError('Could not capture screen: ' + (screenErr.message || 'Permission denied'));
          }
          setStatus('idle');
          return;
        }

        try {
          cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
          });
          setIsCameraActive(true);
        } catch (camErr) {
          stopStreamTracks(displayStream);
          setError('Camera permission was denied. You can continue using Screen + Microphone mode.');
          setStatus('idle');
          return;
        }

        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          });
        } catch (micErr) {
          stopStreamTracks(displayStream);
          stopStreamTracks(cameraStream);
          setError('Microphone permission was denied. Please allow microphone access to record.');
          setStatus('idle');
          return;
        }

        displayStreamRef.current = displayStream;
        cameraStreamRef.current = cameraStream;
        micStreamRef.current = micStream;

        // Listen for Chrome's "Stop sharing" native button
        const screenTrack = displayStream.getVideoTracks()[0];
        if (screenTrack) {
          screenTrack.onended = () => {
            console.log('[Recorder] Screen track ended via Chrome Stop Sharing');
            stopRecording();
          };
        }

        // Setup hidden video elements for canvas compositing
        let screenVideo = screenVideoRef.current;
        if (!screenVideo) {
          screenVideo = document.createElement('video');
          screenVideoRef.current = screenVideo;
        }
        screenVideo.srcObject = displayStream;
        screenVideo.muted = true;
        screenVideo.playsInline = true;

        let cameraVideo = cameraVideoRef.current;
        if (!cameraVideo) {
          cameraVideo = document.createElement('video');
          cameraVideoRef.current = cameraVideo;
        }
        cameraVideo.srcObject = cameraStream;
        cameraVideo.muted = true;
        cameraVideo.playsInline = true;

        await Promise.all([
          new Promise((resolve) => {
            screenVideo.onloadedmetadata = () => {
              screenVideo.play().then(resolve).catch(resolve);
            };
          }),
          new Promise((resolve) => {
            cameraVideo.onloadedmetadata = () => {
              cameraVideo.play().then(resolve).catch(resolve);
            };
          })
        ]);

        // Setup off-screen canvas
        let canvas = canvasRef.current;
        if (!canvas) {
          canvas = document.createElement('canvas');
          canvasRef.current = canvas;
        }
        const width = screenVideo.videoWidth || 1920;
        const height = screenVideo.videoHeight || 1080;
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d', { alpha: false });

        // Compositing loop: Screen as main background, Webcam as PIP in bottom right
        const drawFrame = () => {
          if (!ctx) return;

          // 1. Draw main screen video
          if (screenVideo.readyState >= 2) {
            ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
          } else {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }

          // 2. Draw camera picture-in-picture overlay in bottom right
          if (cameraVideo.readyState >= 2) {
            const pipWidth = Math.max(260, Math.round(canvas.width * 0.22));
            const pipHeight = Math.round((pipWidth * 9) / 16);
            const margin = Math.round(canvas.width * 0.02);
            const x = canvas.width - pipWidth - margin;
            const y = canvas.height - pipHeight - margin;
            const radius = 16;

            ctx.save();
            // Drop shadow for PIP overlay
            ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            ctx.shadowBlur = 16;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 6;

            // Clip rounded rectangle
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(x, y, pipWidth, pipHeight, radius);
            } else {
              ctx.rect(x, y, pipWidth, pipHeight);
            }
            ctx.fillStyle = '#000000';
            ctx.fill();
            ctx.clip();

            ctx.drawImage(cameraVideo, x, y, pipWidth, pipHeight);
            ctx.restore();

            // Accent border around camera overlay
            ctx.save();
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(x, y, pipWidth, pipHeight, radius);
            } else {
              ctx.rect(x, y, pipWidth, pipHeight);
            }
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#2563eb';
            ctx.stroke();
            ctx.restore();
          }

          animationFrameRef.current = requestAnimationFrame(drawFrame);
        };

        drawFrame();

        const canvasStream = canvas.captureStream(30);
        canvasStreamRef.current = canvasStream;
        const canvasVideoTrack = canvasStream.getVideoTracks()[0];

        // Expose live composited canvas stream for the live preview
        setLiveStream(canvasStream);

        // Mix Audio
        const audioTracks = [];
        const screenAudioTracks = displayStream.getAudioTracks();
        const micAudioTracks = micStream.getAudioTracks();

        if (screenAudioTracks.length > 0 && typeof window.AudioContext !== 'undefined') {
          try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            const audioCtx = new AudioCtx();
            audioContextRef.current = audioCtx;
            const dest = audioCtx.createMediaStreamDestination();

            const micSource = audioCtx.createMediaStreamSource(micStream);
            micSource.connect(dest);

            const screenSource = audioCtx.createMediaStreamSource(displayStream);
            screenSource.connect(dest);

            audioTracks.push(...dest.stream.getAudioTracks());
          } catch (mixErr) {
            audioTracks.push(...micAudioTracks);
          }
        } else {
          audioTracks.push(...micAudioTracks);
        }

        finalStream = new MediaStream([canvasVideoTrack, ...audioTracks]);
      }

      // -------------------------------------------------------------
      // Initialize MediaRecorder
      // -------------------------------------------------------------
      const mimeType = getBestSupportedMimeType();
      const recorder = new MediaRecorder(finalStream, {
        mimeType,
        videoBitsPerSecond: 1500000, // 1.5 Mbps - crisp 1080p/720p with lightweight file sizes
        audioBitsPerSecond: 128000   // 128 kbps crystal-clear voice audio
      });

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        finalizeRecording();
      };

      recorder.onerror = (recErr) => {
        console.error('[Recorder] MediaRecorder error:', recErr);
        setError('Recording error occurred. Please try again.');
        stopRecording();
      };

      // Request data every 1 second
      recorder.start(1000);
      setStatus('recording');
      startTimer();
    } catch (err) {
      console.error('[Recorder] Initialization failure:', err);
      cleanupAllStreams();
      setError(err.message || 'Failed to initialize recorder.');
      setStatus('idle');
    }
  };

  /**
   * Pause recording
   */
  const pauseRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      try {
        recorder.pause();
        setStatus('paused');
        pauseTimer();
      } catch (err) {
        console.error('[Recorder] Failed to pause recording:', err);
      }
    }
  };

  /**
   * Resume recording
   */
  const resumeRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'paused') {
      try {
        recorder.resume();
        setStatus('recording');
        resumeTimer();
      } catch (err) {
        console.error('[Recorder] Failed to resume recording:', err);
      }
    }
  };

  /**
   * Discard current recording and return to idle mode selection
   */
  const discardRecording = () => {
    cleanupAllStreams();
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordedMimeType(null);
    setRecordedSize(0);
    durationRef.current = 0;
    setRecordedDuration(0);
    setDuration(0);
    setError(null);
    setStatus('idle');
  };

  /**
   * Start a new recording session
   */
  const recordAgain = () => {
    discardRecording();
  };

  /**
   * Downloads the recorded video locally
   */
  const downloadRecording = (filename) => {
    if (!recordedUrl) return;

    const dateStr = new Date().toISOString().slice(0, 10);
    const extension = recordedMimeType?.includes('mp4') ? 'mp4' : 'webm';
    const finalName = filename || `lecture-recording-${dateStr}.${extension}`;

    const a = document.createElement('a');
    a.href = recordedUrl;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  /**
   * Toggle microphone mute during recording
   */
  const toggleMic = () => {
    const micStream = micStreamRef.current;
    if (micStream) {
      micStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMicMuted((prev) => !prev);
    }
  };

  /**
   * Toggle camera video during recording
   */
  const toggleCamera = () => {
    const cameraStream = cameraStreamRef.current;
    if (cameraStream) {
      cameraStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsCameraMuted((prev) => !prev);
    }
  };

  return {
    recordingMode,
    setRecordingMode,
    status,
    duration,
    formattedDuration: formatDuration(duration),
    recordedBlob,
    recordedUrl,
    recordedMimeType,
    recordedSize,
    formattedSize: formatFileSize(recordedSize),
    recordedDuration,
    formattedRecordedDuration: formatDuration(recordedDuration),
    liveStream,
    error,
    setError,
    isCameraActive,
    isMicMuted,
    isCameraMuted,
    cameraVideoRef,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardRecording,
    recordAgain,
    downloadRecording,
    toggleMic,
    toggleCamera
  };
}
