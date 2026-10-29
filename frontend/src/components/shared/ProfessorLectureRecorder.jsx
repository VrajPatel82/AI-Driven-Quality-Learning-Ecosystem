import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useLectureRecorder, { RECORDING_MODES, formatDuration } from './useLectureRecorder';
import { useAuth } from '../../context/AuthContext';
import { lecturesAPI, coursesAPI } from '../../services/api';
import { createOrUpdateLectureDirectB2 } from '../../services/directB2UploadService';
import toast from 'react-hot-toast';
import { Icons } from './Icons';

export default function ProfessorLectureRecorder({ onCancel }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    recordingMode,
    setRecordingMode,
    status,
    formattedDuration,
    recordedBlob,
    recordedUrl,
    recordedMimeType,
    formattedSize,
    recordedDuration,
    formattedRecordedDuration,
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
  } = useLectureRecorder();

  const [idlePreviewStream, setIdlePreviewStream] = useState(null);
  const idlePreviewVideoRef = useRef(null);
  const liveRecordingVideoRef = useRef(null);

  // Upload workflow state
  const [showDetailsForm, setShowDetailsForm] = useState(false);
  const [assignedCourses, setAssignedCourses] = useState([]);
  const [attachment, setAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'lecture',
    subject: '',
    experimentTitle: '',
    course: '',
    semester: '1',
    language: 'English'
  });

  // Load professor's assigned courses
  useEffect(() => {
    fetchCourses();
  }, [user]);

  const fetchCourses = async () => {
    try {
      const res = await coursesAPI.getAll({ limit: 100 });
      const apiCourses = res.data?.data || res.data || [];
      const userId = user?._id || user?.id;
      const userCourseIds = (user?.courses || []).map(c => (c._id || c).toString());

      const myCourses = apiCourses.filter(c => {
        const profId = (c.professor?._id || c.professor)?.toString();
        if (profId && userId && profId === userId.toString()) return true;
        if (userCourseIds.includes(c._id.toString())) return true;
        return false;
      });

      if (myCourses.length > 0) {
        setAssignedCourses(myCourses);
      } else if (user?.courses?.length) {
        setAssignedCourses(user.courses);
      } else {
        setAssignedCourses([]);
      }
    } catch (err) {
      if (user?.courses?.length) {
        setAssignedCourses(user.courses);
      } else {
        setAssignedCourses([]);
      }
    }
  };

  // Manage idle camera preview when camera mode is selected
  useEffect(() => {
    let activeStream = null;

    const setupIdlePreview = async () => {
      if (
        status === 'idle' &&
        (recordingMode === RECORDING_MODES.CAMERA_MIC ||
          recordingMode === RECORDING_MODES.SCREEN_CAMERA_MIC)
      ) {
        try {
          activeStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 360 } },
            audio: false
          });
          setIdlePreviewStream(activeStream);
          if (idlePreviewVideoRef.current) {
            idlePreviewVideoRef.current.srcObject = activeStream;
            idlePreviewVideoRef.current.play().catch(() => {});
          }
        } catch (e) {
          console.warn('[Recorder] Idle camera preview not available:', e);
        }
      } else {
        if (activeStream) {
          activeStream.getTracks().forEach((t) => t.stop());
        }
        setIdlePreviewStream(null);
      }
    };

    setupIdlePreview();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [recordingMode, status]);

  // Attach liveStream to live recording video element during recording/paused state
  useEffect(() => {
    if (
      (status === 'recording' || status === 'paused') &&
      liveStream &&
      liveRecordingVideoRef.current
    ) {
      liveRecordingVideoRef.current.srcObject = liveStream;
      liveRecordingVideoRef.current.play().catch((err) => {
        console.warn('[Recorder] Live recording preview play error:', err);
      });
    } else if (liveRecordingVideoRef.current && !liveStream) {
      liveRecordingVideoRef.current.srcObject = null;
    }
  }, [status, liveStream]);

  // Clean up idle preview stream when start recording is called
  const handleStart = async () => {
    if (idlePreviewStream) {
      idlePreviewStream.getTracks().forEach((t) => t.stop());
      setIdlePreviewStream(null);
    }
    setShowDetailsForm(false);
    await startRecording();
  };

  /**
   * Converts the recorded Blob into a File object compatible with existing lecture upload
   */
  const createRecordedFile = (blob, customTitle) => {
    if (!blob) return null;
    const dateStr = new Date().toISOString().slice(0, 10);
    const safeTitle = (customTitle || 'lecture-recording')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .slice(0, 40);
    const fileName = `${safeTitle}-${dateStr}.webm`;
    // Use clean video/webm MIME type to match standard multipart expectations
    return new File([blob], fileName, { type: 'video/webm' });
  };

  /**
   * Submits the recorded lecture directly to B2 via direct presigned multipart upload
   */
  const handleUploadSubmit = async (e) => {
    e.preventDefault();

    if (!recordedBlob || recordedBlob.size === 0) {
      return toast.error('No recorded video data found. Please record again.');
    }
    if (!form.title.trim()) return toast.error('Lecture title is required');
    if (!form.course) return toast.error('Please select a course');
    if (!form.semester) return toast.error('Please select a semester');
    if (form.type === 'lab' && !form.subject) return toast.error('Subject is required for labs');

    setUploading(true);

    try {
      const recordedFile = createRecordedFile(recordedBlob, form.title);

      const lectureData = {
        title: form.title.trim(),
        description: form.description || '',
        type: form.type || 'lecture',
        course: form.course,
        semester: form.semester,
        language: form.language || 'en',
        subject: form.type === 'lab' ? form.subject : undefined,
        experimentTitle: form.type === 'lab' ? form.experimentTitle : undefined
      };

      await createOrUpdateLectureDirectB2({
        file: recordedFile,
        attachmentFile: attachment,
        lectureData
      });

      toast.success(`${form.type === 'lab' ? 'Lab' : 'Lecture'} uploaded successfully! Auto-transcription has started.`);
      
      discardRecording();
      setShowDetailsForm(false);

      navigate(form.type === 'lab' ? '/professor/my-labs' : '/professor/my-lectures');
    } catch (err) {
      console.error('[Recorded Lecture Upload]', err);
      toast.error(err.response?.data?.message || err.message || 'Failed to upload recorded lecture. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden transition-all">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-border bg-gradient-to-r from-blue-50/60 via-indigo-50/30 to-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0">
              <Icons.Video className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-heading">In-App Lecture Recorder</h2>
            <span className="bg-blue-100 text-blue-700 text-[11px] sm:text-xs font-semibold px-2 sm:px-2.5 py-0.5 rounded-full border border-blue-200">
              Live Capture & Upload
            </span>
          </div>
          <p className="text-xs text-muted mt-1 leading-relaxed">
            Capture high-definition lecture video with screen sharing, camera, and microphone directly in your browser.
          </p>
        </div>

        {status === 'recording' && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 px-3.5 py-1.5 rounded-full shadow-sm self-start sm:self-auto shrink-0">
            <span className="w-3 h-3 rounded-full bg-red-600 animate-ping inline-block" />
            <span className="text-xs font-bold uppercase tracking-wider text-red-700">Recording Live</span>
            <span className="font-mono font-bold text-sm text-red-900">{formattedDuration}</span>
          </div>
        )}

        {status === 'paused' && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 px-3.5 py-1.5 rounded-full shadow-sm self-start sm:self-auto shrink-0">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5"><Icons.Pause className="w-3.5 h-3.5" /> Paused</span>
            <span className="font-mono font-bold text-sm text-amber-900">{formattedDuration}</span>
          </div>
        )}
      </div>

      {/* Error Notice */}
      {error && (
        <div className="mx-4 sm:mx-6 mt-4 sm:mt-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start justify-between gap-3 text-red-700 text-sm">
          <div className="flex items-start gap-2.5">
            <Icons.AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800">Recording Alert</p>
              <p className="mt-0.5 leading-relaxed">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 font-bold text-lg leading-none p-1 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 1. IDLE STATE: Mode Selection & Setup                         */}
      {/* ------------------------------------------------------------- */}
      {status === 'idle' && (
        <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">
          <div>
            <label className="block text-sm font-semibold text-heading mb-3">
              1. Choose Recording Mode
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
              {/* Mode A: Screen + Mic (Default) */}
              <div
                onClick={() => setRecordingMode(RECORDING_MODES.SCREEN_MIC)}
                className={`cursor-pointer rounded-2xl p-4 border-2 transition-all relative ${
                  recordingMode === RECORDING_MODES.SCREEN_MIC
                    ? 'border-blue-600 bg-blue-50/40 shadow-sm'
                    : 'border-border hover:border-blue-300 bg-white'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-blue-600"><Icons.Laptop className="w-5 h-5" /><Icons.Mic className="w-5 h-5" /></div>
                  {recordingMode === RECORDING_MODES.SCREEN_MIC && (
                    <span className="text-blue-600 font-bold text-sm flex items-center gap-1"><Icons.Check className="w-4 h-4" /> Default</span>
                  )}
                </div>
                <h3 className="font-bold text-sm text-heading">Screen + Microphone</h3>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Record your slide deck, coding IDE, or browser tab with clear voice commentary. Ideal for standard lectures.
                </p>
              </div>

              {/* Mode B: Camera + Mic */}
              <div
                onClick={() => setRecordingMode(RECORDING_MODES.CAMERA_MIC)}
                className={`cursor-pointer rounded-2xl p-4 border-2 transition-all relative ${
                  recordingMode === RECORDING_MODES.CAMERA_MIC
                    ? 'border-blue-600 bg-blue-50/40 shadow-sm'
                    : 'border-border hover:border-blue-300 bg-white'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-blue-600"><Icons.Camera className="w-5 h-5" /><Icons.Mic className="w-5 h-5" /></div>
                  {recordingMode === RECORDING_MODES.CAMERA_MIC && (
                    <span className="text-blue-600 font-bold text-sm flex items-center gap-1"><Icons.Check className="w-4 h-4" /> Selected</span>
                  )}
                </div>
                <h3 className="font-bold text-sm text-heading">Camera + Microphone</h3>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Record speaking video directly through your webcam with microphone audio.
                </p>
              </div>

              {/* Mode C: Screen + Camera + Mic */}
              <div
                onClick={() => setRecordingMode(RECORDING_MODES.SCREEN_CAMERA_MIC)}
                className={`cursor-pointer rounded-2xl p-4 border-2 transition-all relative ${
                  recordingMode === RECORDING_MODES.SCREEN_CAMERA_MIC
                    ? 'border-blue-600 bg-blue-50/40 shadow-sm'
                    : 'border-border hover:border-blue-300 bg-white'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-blue-600"><Icons.Laptop className="w-5 h-5" /><Icons.Camera className="w-5 h-5" /><Icons.Mic className="w-5 h-5" /></div>
                  {recordingMode === RECORDING_MODES.SCREEN_CAMERA_MIC && (
                    <span className="text-blue-600 font-bold text-sm flex items-center gap-1"><Icons.Check className="w-4 h-4" /> Selected</span>
                  )}
                </div>
                <h3 className="font-bold text-sm text-heading">Screen + Camera + Mic</h3>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Record your presentation with your camera live picture-in-picture in the bottom-right corner.
                </p>
              </div>
            </div>
          </div>

          {/* Optional Idle Camera Preview for Camera Modes */}
          {(recordingMode === RECORDING_MODES.CAMERA_MIC ||
            recordingMode === RECORDING_MODES.SCREEN_CAMERA_MIC) && (
            <div className="p-3.5 sm:p-4 bg-gray-50 border border-border rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-heading flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block shrink-0" />
                  Camera Preview (Setup)
                </span>
                <span className="text-[11px] text-muted">Ready to capture</span>
              </div>
              <div className="aspect-video w-full max-w-sm sm:max-w-md mx-auto bg-black rounded-lg overflow-hidden border border-gray-300 relative shadow-inner">
                <video
                  ref={idlePreviewVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                {!idlePreviewStream && (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 p-4 text-center">
                    Camera preview will initialize when permissions are allowed
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick tips */}
          <div className="p-3.5 sm:p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-1.5 text-xs text-blue-900 break-words">
            <p className="font-semibold text-blue-950 flex items-center gap-1.5">
              <Icons.Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Browser Recording Instructions:
            </p>
            <ul className="list-disc list-inside space-y-1 text-blue-800/90 pl-1 leading-relaxed">
              <li>When you click <strong>Start Recording</strong>, your browser will prompt you to choose the screen, window, or tab to capture.</li>
              <li>Ensure you grant microphone access when prompted so your voice narration is captured.</li>
              <li>You will see a <strong>Live Preview</strong> of the exact video stream being captured while recording.</li>
              <li>When finished, click <strong>Stop</strong> to review, download, or directly <strong>Upload as Lecture</strong> to your course!</li>
            </ul>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleStart}
              className="w-full sm:flex-1 btn-primary py-3 text-sm sm:text-base flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all font-bold cursor-pointer"
            >
              <span className="w-3 h-3 rounded-full bg-white animate-pulse shrink-0" />
              Start Recording
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="w-full sm:w-auto px-5 py-3 border border-border rounded-btn font-medium hover:bg-gray-50 transition-colors text-center text-sm cursor-pointer shadow-2xs"
              >
                Back to Upload Form
              </button>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. RECORDING / PAUSED STATE: Live Preview & Controls          */}
      {/* ------------------------------------------------------------- */}
      {(status === 'recording' || status === 'paused' || status === 'preparing') && (
        <div className="p-6 space-y-5">
          {/* Top Status & Timer Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-gray-50 rounded-xl border border-border">
            <div className="flex items-center gap-2.5">
              <span
                className={`w-3.5 h-3.5 rounded-full ${
                  status === 'recording' ? 'bg-red-600 animate-ping' : 'bg-amber-500'
                }`}
              />
              <span className="text-xs font-bold uppercase tracking-wider text-red-700">
                {status === 'recording'
                  ? 'Recording in Progress'
                  : status === 'paused'
                  ? 'Recording Paused'
                  : 'Preparing Media Streams...'}
              </span>
              <span className="text-xs text-muted">|</span>
              <span className="text-xs font-medium text-heading">
                Mode: <strong className="uppercase">{recordingMode.replace(/-/g, ' + ')}</strong>
              </span>
            </div>

            <div className="font-mono text-2xl md:text-3xl font-extrabold text-heading tracking-tight">
              {formattedDuration}
            </div>
          </div>

          {/* Hidden reference video for off-screen camera capture */}
          <video ref={cameraVideoRef} autoPlay muted playsInline className="hidden" />

          {/* ========================================================= */}
          {/* PROMINENT LIVE RECORDING PREVIEW (Google Meet / Zoom style) */}
          {/* ========================================================= */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-heading flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                Live Recording Preview (Actual Captured Content)
              </span>
              <span className="text-[11px] text-muted">
                {recordingMode === RECORDING_MODES.SCREEN_MIC
                  ? 'Display Stream'
                  : recordingMode === RECORDING_MODES.CAMERA_MIC
                  ? 'Webcam Stream'
                  : 'Composited Canvas (Screen + Camera PiP)'}
              </span>
            </div>

            <div className="aspect-video w-full bg-slate-950 rounded-2xl overflow-hidden border border-gray-300 relative shadow-inner flex items-center justify-center">
              <video
                ref={liveRecordingVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-contain"
              />

              {/* Top-left LIVE badge */}
              <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm text-white px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 border border-white/10 shadow-sm pointer-events-none">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span>LIVE PREVIEW</span>
              </div>

              {/* Paused Overlay */}
              {status === 'paused' && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
                  <div className="bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg flex items-center gap-2">
                    <Icons.Pause className="w-4 h-4 text-white" /> Recording Paused
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Interactive Control Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-3 pt-2">
            {status === 'recording' && (
              <button
                type="button"
                onClick={pauseRecording}
                className="w-full sm:flex-1 sm:min-w-[140px] px-5 py-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
              >
                <Icons.Pause className="w-4 h-4 text-amber-900" /> Pause
              </button>
            )}

            {status === 'paused' && (
              <button
                type="button"
                onClick={resumeRecording}
                className="w-full sm:flex-1 sm:min-w-[140px] px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
              >
                <Icons.Play className="w-4 h-4 fill-white text-white" /> Resume Recording
              </button>
            )}

            <button
              type="button"
              onClick={stopRecording}
              className="w-full sm:flex-1 sm:min-w-[140px] px-5 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Icons.Square className="w-4 h-4 fill-white text-white" /> Stop Recording
            </button>
          </div>

          {/* Optional Mute / Hardware Toggles */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 pt-1 text-xs text-muted">
            <button
              type="button"
              onClick={toggleMic}
              className={`px-3.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer ${
                isMicMuted
                  ? 'border-red-300 bg-red-50 text-red-700 font-semibold'
                  : 'border-border bg-white text-muted hover:bg-gray-50'
              }`}
            >
              {isMicMuted ? <Icons.MicOff className="w-4 h-4 text-red-600" /> : <Icons.Mic className="w-4 h-4 text-muted" />}
              {isMicMuted ? 'Microphone Muted' : 'Microphone Active'}
            </button>

            {isCameraActive && (
              <button
                type="button"
                onClick={toggleCamera}
                className={`px-3.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isCameraMuted
                    ? 'border-red-300 bg-red-50 text-red-700 font-semibold'
                    : 'border-border bg-white text-muted hover:bg-gray-50'
                }`}
              >
                {isCameraMuted ? <Icons.CameraOff className="w-4 h-4 text-red-600" /> : <Icons.Camera className="w-4 h-4 text-muted" />}
                {isCameraMuted ? 'Camera Muted' : 'Camera Active'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. STOPPED STATE: Preview, Metadata & Actions                  */}
      {/* ------------------------------------------------------------- */}
      {status === 'stopped' && recordedUrl && !showDetailsForm && (
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-heading flex items-center gap-2">
                <Icons.Award className="w-5 h-5 text-green-600 shrink-0" /> Lecture Recording Complete
              </h3>
              <p className="text-xs text-muted mt-0.5 leading-relaxed">
                Review your recorded lecture below. You can directly publish it as a lecture, download, or record again.
              </p>
            </div>
            <span className="px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full text-xs font-bold self-start sm:self-auto shrink-0">
              Ready to Upload / Save
            </span>
          </div>

          {/* Video Preview Player */}
          <div className="aspect-video w-full bg-black rounded-xl sm:rounded-2xl overflow-hidden border border-gray-200 shadow-md">
            <video
              src={recordedUrl}
              controls
              playsInline
              className="w-full h-full object-contain"
            />
          </div>

          {/* Metadata Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            <div className="p-3 bg-gray-50 rounded-xl border border-border">
              <p className="text-[11px] font-semibold text-muted uppercase">Duration</p>
              <p className="text-sm sm:text-base font-bold text-heading mt-0.5">
                {formattedRecordedDuration || formatDuration(recordedDuration)}
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-border">
              <p className="text-[11px] font-semibold text-muted uppercase">File Size</p>
              <p className="text-sm sm:text-base font-bold text-heading mt-0.5">{formattedSize}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-border">
              <p className="text-[11px] font-semibold text-muted uppercase">Format</p>
              <p className="text-sm sm:text-base font-bold text-heading mt-0.5">
                {recordedMimeType?.includes('mp4') ? 'MP4' : 'WebM Video'}
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-border">
              <p className="text-[11px] font-semibold text-muted uppercase">Mode</p>
              <p className="text-xs font-bold text-heading mt-1 uppercase truncate">
                {recordingMode.replace(/-/g, ' + ')}
              </p>
            </div>
          </div>

          {/* Auto-Transcription Notice */}
          <div className="p-3.5 sm:p-4 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
            <p className="font-semibold text-blue-950 flex items-center gap-1.5">
              <Icons.Mic className="w-4 h-4 text-blue-600 shrink-0" /> Direct Lecture Upload Pipeline
            </p>
            <p className="text-blue-800 leading-relaxed">
              Click <strong>Upload Lecture</strong> below to fill in lecture details and publish. The video will be stored securely and automatically transcribed via AI (Groq Whisper).
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3 pt-2">
            {/* Primary Action: Proceed to Lecture Details & Upload */}
            <button
              type="button"
              onClick={() => setShowDetailsForm(true)}
              className="w-full sm:flex-1 sm:min-w-[200px] btn-primary py-3 text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg font-bold cursor-pointer"
            >
              <Icons.Upload className="w-4 h-4 shrink-0" /> Upload Lecture
            </button>

            {/* Local Download */}
            <button
              type="button"
              onClick={() => downloadRecording()}
              className="w-full sm:w-auto px-4 py-3 border border-border rounded-btn text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Icons.Download className="w-4 h-4 shrink-0" /> Download (.webm)
            </button>

            {/* Record Again */}
            <button
              type="button"
              onClick={recordAgain}
              className="w-full sm:w-auto px-4 py-3 border border-border rounded-btn text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Icons.Refresh className="w-4 h-4 shrink-0" /> Record Again
            </button>

            {/* Discard */}
            <button
              type="button"
              onClick={discardRecording}
              className="w-full sm:w-auto px-4 py-3 border border-red-200 text-red-600 hover:bg-red-50 rounded-btn text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Icons.Trash className="w-4 h-4 shrink-0" /> Discard
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. LECTURE DETAILS FORM: Directly publishing recorded File     */}
      {/* ------------------------------------------------------------- */}
      {status === 'stopped' && showDetailsForm && (
        <form onSubmit={handleUploadSubmit} className="p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h3 className="text-lg font-bold text-heading flex items-center gap-2">
                <Icons.BookOpen className="w-5 h-5 text-blue-600" /> Upload Recorded Lecture
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Fill in course and lecture details. Your recorded WebM video will be attached and transcribed automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDetailsForm(false)}
              className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
            >
              ← Back to Recording
            </button>
          </div>

          {/* Compact Attached Video Preview */}
          <div className="p-4 bg-gray-50 border border-border rounded-xl flex flex-col sm:flex-row items-center gap-4">
            <div className="aspect-video w-full sm:w-48 bg-black rounded-lg overflow-hidden shrink-0 shadow-sm">
              <video src={recordedUrl} controls playsInline className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 font-bold text-[10px] uppercase">
                  Video Attached
                </span>
                <span className="font-semibold text-heading">
                  {recordedMimeType?.includes('mp4') ? 'MP4 Recording' : 'WebM Recording'}
                </span>
              </div>
              <p className="text-muted">
                Duration: <strong className="text-heading">{formattedRecordedDuration || formatDuration(recordedDuration)}</strong> | Size: <strong className="text-heading">{formattedSize}</strong>
              </p>
              <p className="text-muted">
                Mode: <strong className="text-heading uppercase">{recordingMode.replace(/-/g, ' + ')}</strong>
              </p>
            </div>
          </div>

          {/* Content Type (Lecture vs Lab) */}
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Content Type *</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="lecture"
                  checked={form.type === 'lecture'}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-4 h-4"
                />
                <span className="text-sm text-heading">Lecture</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="lab"
                  checked={form.type === 'lab'}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-4 h-4"
                />
                <span className="text-sm text-heading">Lab Session</span>
              </label>
            </div>
          </div>

          {/* Semester Selector */}
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Semester *</label>
            <select
              value={form.semester}
              onChange={(e) => setForm((f) => ({ ...f, semester: e.target.value, course: '' }))}
              className="form-input w-full"
              required
            >
              <option value="">Select Semester</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                <option key={s} value={s}>
                  Semester {s}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted mt-1">Select the semester first, then choose a course from that semester</p>
          </div>

          {/* Course Selector (Filtered strictly by selected semester & assigned courses) */}
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Course *</label>
            {(() => {
              const filteredForSem = assignedCourses.filter((c) => Number(c.semester) === Number(form.semester));
              return (
                <>
                  <select
                    value={form.course}
                    onChange={(e) => setForm((f) => ({ ...f, course: e.target.value }))}
                    className="form-input w-full"
                    required
                    disabled={!form.semester}
                  >
                    {!form.semester ? (
                      <option value="">Please select a semester first</option>
                    ) : filteredForSem.length === 0 ? (
                      <option value="" disabled selected>No courses from this semester are assigned to you.</option>
                    ) : (
                      <>
                        <option value="">Select course for Semester {form.semester}</option>
                        {filteredForSem.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name} ({c.code})
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                  {form.semester && filteredForSem.length === 0 && (
                    <p className="text-xs text-red-600 mt-1 font-medium">
                      No courses from this semester are assigned to you.
                    </p>
                  )}
                </>
              );
            })()}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-heading mb-1">
              {form.type === 'lab' ? 'Experiment Title' : 'Lecture Title'} *
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="form-input w-full"
              placeholder={form.type === 'lab' ? 'Enter experiment title' : 'Enter lecture title'}
              required
            />
          </div>

          {/* Subject (For Labs) */}
          {form.type === 'lab' && (
            <div>
              <label className="block text-sm font-medium text-heading mb-1">Subject *</label>
              <input
                type="text"
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                className="form-input w-full"
                placeholder={`Enter subject name for Semester ${form.semester}`}
                required
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="form-input w-full"
              rows={3}
              placeholder={form.type === 'lab' ? 'Enter lab session description' : 'Enter lecture description'}
            />
          </div>

          {/* Language */}
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Language</label>
            <select
              value={form.language}
              onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
              className="form-input w-full"
            >
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
              <option value="Gujarati">Gujarati</option>
            </select>
          </div>

          {/* Optional Attachment / Lab Manual */}
          <div>
            <label className="block text-sm font-medium text-heading mb-1">
              {form.type === 'lab' ? 'Lab Manual / PDF (Optional)' : 'Additional Material (Optional PDF)'}
            </label>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-purple-300 transition-colors">
              <input
                type="file"
                onChange={(e) => setAttachment(e.target.files[0])}
                className="hidden"
                id="rec-attachment-upload"
                accept=".pdf"
              />
              <label htmlFor="rec-attachment-upload" className="cursor-pointer">
                {attachment ? (
                  <div>
                    <p className="text-xs font-medium text-purple-700">{attachment.name}</p>
                    <p className="text-[10px] text-muted mt-0.5">Click to replace PDF</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-muted">Click to upload supplementary PDF manual/notes</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Auto-Transcription Banner */}
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <Icons.Mic className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-800">Auto-Transcription Enabled</p>
              <p className="text-xs text-blue-600 mt-0.5 leading-relaxed">
                This recorded lecture will be automatically transcribed using AI (Groq Whisper). Students will receive AI notes, multilingual transcripts, and interactive tutor assistance once processing completes.
              </p>
            </div>
          </div>

          {/* Progress Bar while Uploading */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-blue-700 font-semibold">
                <span>Uploading Recorded Lecture & Processing...</span>
                <span>Please wait</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div className="bg-blue-600 h-2 rounded-full animate-pulse w-full"></div>
              </div>
            </div>
          )}

          {/* Submit & Cancel Buttons */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => setShowDetailsForm(false)}
              className="w-full sm:w-auto px-5 py-3 border border-border rounded-btn font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50 text-center cursor-pointer shadow-2xs"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={uploading}
              className="btn-primary w-full sm:flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer"
            >
              {uploading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Uploading Lecture...
                </>
              ) : (
                <>
                  <Icons.Upload className="w-4 h-4 inline" /> Submit & Upload {form.type === 'lab' ? 'Lab' : 'Lecture'}
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
