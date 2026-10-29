import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { lecturesAPI, coursesAPI, resourcesAPI } from '../../services/api';
import { createOrUpdateLectureDirectB2 } from '../../services/directB2UploadService';
import { useAuth } from '../../context/AuthContext';
import ProfessorLectureRecorder from '../../components/shared/ProfessorLectureRecorder';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

// Reusable Cloud Upload Icon matching the reference design
const CloudUploadIcon = ({ className = "w-8 h-8 text-blue-600" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <path
      d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
      fill="currentColor"
    />
    <path
      d="M14 13v4h-4v-4H7l5-5 5 5h-3z"
      fill="white"
    />
  </svg>
);

export default function ProfessorUpload() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'record'
  const [courses, setCourses] = useState([]);
  const [assignedCourses, setAssignedCourses] = useState([]);
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
  const [file, setFile] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isDraggingAttachment, setIsDraggingAttachment] = useState(false);
  const [storageStatus, setStorageStatus] = useState(null);

  const formatBytes = (bytes, decimals = 1) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const isTranscribableFile = (f) => {
    if (!f) return false;
    const ext = f.name.split('.').pop().toLowerCase();
    return ['mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'm4a', 'flac', 'mpeg', 'mpga'].includes(ext);
  };

  useEffect(() => {
    fetchCourses();
    fetchStorageStatus();
  }, [user]);

  const fetchStorageStatus = async () => {
    try {
      const res = await resourcesAPI.getOverview();
      if (res.data?.success && res.data?.data?.storage) {
        setStorageStatus(res.data.data.storage);
      }
    } catch (e) {
      console.error('Failed to load storage status in upload:', e);
    }
  };

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title) return toast.error('Title is required');
    if (!form.course) return toast.error('Please select a course');
    if (!form.semester) return toast.error('Please select a semester');
    if (form.type === 'lab' && !form.subject) return toast.error('Subject is required for labs');
    if (!file) return toast.error('Please upload a file');

    setUploading(true);
    setUploadProgress(0);
    try {
      const lectureData = {
        title: form.title,
        description: form.description,
        type: form.type,
        course: form.course,
        semester: form.semester,
        language: form.language,
        subject: form.type === 'lab' ? form.subject : undefined,
        experimentTitle: form.type === 'lab' ? form.experimentTitle : undefined
      };

      await createOrUpdateLectureDirectB2({
        file,
        attachmentFile: attachment,
        lectureData,
        onProgress: (pct) => setUploadProgress(pct)
      });

      toast.success(`${form.type === 'lab' ? 'Lab' : 'Lecture'} uploaded successfully!`);
      navigate(form.type === 'lab' ? '/professor/my-labs' : '/professor/my-lectures');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const filteredForSem = assignedCourses.filter(c => Number(c.semester) === Number(form.semester));

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4 sm:space-y-6">
      {/* Page Header & Mode Switch */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Icons.BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 shrink-0" />
            <span>Create Content</span>
          </h1>
        </div>

        {/* Tab Switcher: Upload vs Record (SaaS Segmented Control) */}
        <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/90 shrink-0 self-stretch sm:self-auto shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`flex-1 sm:flex-initial px-3.5 sm:px-4 py-2 sm:py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'upload'
                ? 'bg-white text-blue-600 shadow-xs border border-slate-200/70'
                : 'text-slate-500 hover:text-slate-900 font-medium'
            }`}
          >
            <Icons.Upload className="w-3.5 h-3.5 shrink-0" />
            <span>Upload Lecture</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('record')}
            className={`flex-1 sm:flex-initial px-3.5 sm:px-4 py-2 sm:py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'record'
                ? 'bg-white text-blue-600 shadow-xs border border-slate-200/70'
                : 'text-slate-500 hover:text-slate-900 font-medium'
            }`}
          >
            <Icons.Video className="w-3.5 h-3.5 shrink-0" />
            <span>Record Lecture</span>
          </button>
        </div>
      </div>

      {/* Mode View: In-App Recorder */}
      {activeTab === 'record' && (
        <ProfessorLectureRecorder onCancel={() => setActiveTab('upload')} />
      )}

      {/* Mode View: File Upload Form matching the reference design */}
      {activeTab === 'upload' && (
        <div className="space-y-4">
          {storageStatus && storageStatus.allocated > 0 && storageStatus.remaining <= 0 && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-800">
              <Icons.AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm">Storage Full (0 Bytes Remaining)</p>
                <p className="text-xs text-red-700 mt-0.5 leading-relaxed">
                  Your allocated storage quota ({formatBytes(storageStatus.allocated)}) is completely full. New uploads are disabled. Please delete existing lectures or contact your Department Admin for more storage.
                </p>
              </div>
            </div>
          )}

          {storageStatus && storageStatus.allocated > 0 && storageStatus.remaining > 0 && (storageStatus.remaining / storageStatus.allocated) <= 0.05 && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-900">
              <Icons.AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm">Storage Almost Full: Only {formatBytes(storageStatus.remaining)} Remaining</p>
                <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                  You have used {storageStatus.percentageUsed}% of your allocated {formatBytes(storageStatus.allocated)}. Only {formatBytes(storageStatus.remaining)} remaining.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xs border border-slate-200/90 p-4 sm:p-6 lg:p-8 space-y-5 sm:space-y-6">
            {/* SECTION 1: Content Type */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Icons.FileText className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Content Type *</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {/* Option 1: Lecture */}
                <div
                  onClick={() => setForm(f => ({ ...f, type: 'lecture' }))}
                  className={`rounded-xl py-3.5 px-4 sm:py-4 sm:px-5 flex items-center gap-3.5 cursor-pointer transition-all ${
                    form.type === 'lecture'
                      ? 'border-2 border-blue-600 bg-blue-50/60 shadow-xs'
                      : 'border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-white ${
                    form.type === 'lecture' ? 'border-2 border-blue-600' : 'border-2 border-slate-300'
                  }`}>
                    {form.type === 'lecture' && <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                  </div>
                  <Icons.BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 shrink-0" />
                  <div className="min-w-0">
                    <span className="block font-bold text-xs sm:text-sm text-slate-900 leading-tight">Lecture</span>
                    <span className="block text-[11px] sm:text-xs text-slate-500 mt-0.5">Upload a lecture video, audio or PDF</span>
                  </div>
                </div>

                {/* Option 2: Lab Session */}
                <div
                  onClick={() => setForm(f => ({ ...f, type: 'lab' }))}
                  className={`rounded-xl py-3.5 px-4 sm:py-4 sm:px-5 flex items-center gap-3.5 cursor-pointer transition-all ${
                    form.type === 'lab'
                      ? 'border-2 border-blue-600 bg-blue-50/60 shadow-xs'
                      : 'border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-white ${
                    form.type === 'lab' ? 'border-2 border-blue-600' : 'border-2 border-slate-300'
                  }`}>
                    {form.type === 'lab' && <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                  </div>
                  <Icons.Flask className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 shrink-0" />
                  <div className="min-w-0">
                    <span className="block font-bold text-xs sm:text-sm text-slate-900 leading-tight">Lab Session</span>
                    <span className="block text-[11px] sm:text-xs text-slate-500 mt-0.5">Upload lab session material</span>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 2: Course Information */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Icons.GraduationCap className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Course Information</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-6">
                {/* Semester */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-800">
                    Semester <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={form.semester}
                      onChange={e => setForm(f => ({ ...f, semester: e.target.value, course: '' }))}
                      className="w-full h-11 text-xs font-normal text-slate-800 bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 rounded-xl px-3.5 appearance-none pr-10 cursor-pointer transition shadow-2xs"
                      required
                    >
                      <option value="">Select Semester</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                        <option key={s} value={s}>Semester {s}</option>
                      ))}
                    </select>
                    <Icons.ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-slate-400">Select the semester first, then choose a course from that semester</p>
                </div>

                {/* Course */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-800">
                    Course <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={form.course}
                      onChange={e => setForm(f => ({ ...f, course: e.target.value }))}
                      className="w-full h-11 text-xs font-normal text-slate-800 bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 rounded-xl px-3.5 appearance-none pr-10 cursor-pointer transition disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed shadow-2xs"
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
                          {filteredForSem.map(c => (
                            <option key={c._id} value={c._id}>{c.name} ({c.code})</option>
                          ))}
                        </>
                      )}
                    </select>
                    <Icons.ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  {form.semester && filteredForSem.length === 0 && (
                    <p className="text-[11px] text-red-500 font-medium">
                      No courses from this semester are assigned to you.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 3: Lecture Details */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Icons.FileText className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{form.type === 'lab' ? 'Lab Details' : 'Lecture Details'}</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-6">
                {/* Title */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-800">
                    {form.type === 'lab' ? 'Experiment Title' : 'Lecture Title'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder={form.type === 'lab' ? 'Enter experiment title' : 'Enter lecture title'}
                    className="w-full h-11 text-xs font-normal text-slate-800 bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 rounded-xl px-3.5 transition shadow-2xs placeholder:text-slate-400"
                    required
                  />
                </div>

                {/* Language */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-800">Language</label>
                  <div className="relative">
                    <select
                      value={form.language}
                      onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
                      className="w-full h-11 text-xs font-normal text-slate-800 bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 rounded-xl px-3.5 appearance-none pr-10 cursor-pointer transition shadow-2xs"
                    >
                      <option value="English">English</option>
                      <option value="Hindi">Hindi</option>
                      <option value="Gujarati">Gujarati</option>
                    </select>
                    <Icons.ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Subject (for labs) */}
              {form.type === 'lab' && (
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-800">Subject <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    placeholder={`Enter subject name for Semester ${form.semester || ''}`}
                    className="w-full h-11 text-xs font-normal text-slate-800 bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 rounded-xl px-3.5 transition shadow-2xs placeholder:text-slate-400"
                    required
                  />
                  <p className="text-[11px] text-slate-400">Subject should be relevant to Semester {form.semester}</p>
                </div>
              )}

              {/* Description */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-800">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder={form.type === 'lab' ? 'Enter lab session description' : 'Enter lecture description'}
                  className="w-full min-h-[95px] text-xs font-normal text-slate-800 bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 rounded-xl p-3.5 transition shadow-2xs placeholder:text-slate-400 resize-y"
                />
              </div>
            </div>

            {/* SECTION 4: Files */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Icons.Paperclip className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Files</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {/* Lecture File (Video, Audio, PDF) */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-800">
                    {form.type === 'lab' ? 'Lab Recording / Media' : 'Lecture File (Video, Audio, PDF)'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="file"
                    onChange={e => setFile(e.target.files[0])}
                    className="hidden"
                    id="file-upload"
                    accept="video/*,audio/*,.pdf"
                  />
                  <label
                    htmlFor="file-upload"
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
                    onDragLeave={() => setIsDraggingFile(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingFile(false);
                      if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]);
                    }}
                    className={`w-full rounded-2xl py-7 sm:py-9 px-4 sm:px-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center min-h-[175px] sm:min-h-[190px] group ${
                      isDraggingFile
                        ? 'border-2 border-dashed border-blue-500 bg-blue-100/50'
                        : file
                        ? 'border-2 border-solid border-blue-300 bg-[#f0f6ff]'
                        : 'border-2 border-dashed border-[#ccd6ed] hover:border-blue-400 bg-[#f8faff] hover:bg-[#f0f5ff]'
                    }`}
                  >
                    {file ? (
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-2 shadow-2xs">
                          <Icons.Check className="w-5 h-5 stroke-[2.5]" />
                        </div>
                        <p className="text-xs font-bold text-slate-800 max-w-[260px] truncate" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFile(null);
                          }}
                          className="mt-2 text-[11px] font-semibold text-red-500 hover:text-red-700 hover:underline flex items-center gap-1"
                        >
                          <Icons.X className="w-3.5 h-3.5" />
                          Remove file
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center">
                        <CloudUploadIcon className="w-9 h-9 text-blue-600 mb-2.5 group-hover:scale-105 transition-transform" />
                        <p className="text-xs font-semibold text-slate-800">
                          <span className="text-blue-600 underline font-semibold">Click to upload</span> or drag & drop
                        </p>
                        <p className="text-[11px] sm:text-xs text-slate-500 mt-1 font-normal">
                          {form.type === 'lab' ? 'Upload lab recording / media file' : 'Upload main lecture file (video, audio or PDF)'}
                        </p>
                        <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1 font-normal">
                          Supported formats: MP4, MOV, AVI, MP3, WAV, PDF
                        </p>
                      </div>
                    )}
                  </label>
                </div>

                {/* Additional Material (Optional PDF) */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-800">
                    {form.type === 'lab' ? 'Lab Manual (Optional PDF)' : 'Additional Material (Optional PDF)'}
                  </label>
                  <input
                    type="file"
                    onChange={e => setAttachment(e.target.files[0])}
                    className="hidden"
                    id="attachment-upload"
                    accept=".pdf"
                  />
                  <label
                    htmlFor="attachment-upload"
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingAttachment(true); }}
                    onDragLeave={() => setIsDraggingAttachment(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingAttachment(false);
                      if (e.dataTransfer.files?.[0]) setAttachment(e.dataTransfer.files[0]);
                    }}
                    className={`w-full rounded-2xl py-7 sm:py-9 px-4 sm:px-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center min-h-[175px] sm:min-h-[190px] group ${
                      isDraggingAttachment
                        ? 'border-2 border-dashed border-blue-500 bg-blue-100/50'
                        : attachment
                        ? 'border-2 border-solid border-blue-300 bg-[#f0f6ff]'
                        : 'border-2 border-dashed border-[#ccd6ed] hover:border-blue-400 bg-[#f8faff] hover:bg-[#f0f5ff]'
                    }`}
                  >
                    {attachment ? (
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-2 shadow-2xs">
                          <Icons.Check className="w-5 h-5 stroke-[2.5]" />
                        </div>
                        <p className="text-xs font-bold text-slate-800 max-w-[260px] truncate" title={attachment.name}>
                          {attachment.name}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{(attachment.size / (1024 * 1024)).toFixed(2)} MB</p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setAttachment(null);
                          }}
                          className="mt-2 text-[11px] font-semibold text-red-500 hover:text-red-700 hover:underline flex items-center gap-1"
                        >
                          <Icons.X className="w-3.5 h-3.5" />
                          Remove file
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center">
                        <CloudUploadIcon className="w-9 h-9 text-blue-600 mb-2.5 group-hover:scale-105 transition-transform" />
                        <p className="text-xs font-semibold text-slate-800">
                          <span className="text-blue-600 underline font-semibold">Click to upload</span> or drag & drop
                        </p>
                        <p className="text-[11px] sm:text-xs text-slate-500 mt-1 font-normal">
                          Upload PDF manual or supplementary notes
                        </p>
                        <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1 font-normal">
                          Supported format: PDF
                        </p>
                      </div>
                    )}
                  </label>
                </div>
              </div>
            </div>

            {/* Transcription Info Banner */}
            {file && isTranscribableFile(file) && (
              <div className="flex items-start gap-3 p-3.5 sm:p-4 bg-blue-50/80 border border-blue-200/80 rounded-xl text-blue-900">
                <Icons.Mic className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-blue-900">Auto-Transcription Enabled</p>
                  <p className="text-[11px] text-blue-700 mt-0.5 leading-relaxed">
                    This audio/video file will be automatically transcribed using AI (Groq Whisper).
                    The transcription will be available to students once processing is complete.
                  </p>
                </div>
              </div>
            )}

            {/* Progress Bar */}
            {uploading && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-blue-900">
                  <span>Direct B2 Upload Progress</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* SECTION 5: Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 pt-1 sm:pt-2">
              <button
                type="submit"
                disabled={uploading}
                className="w-full sm:flex-1 h-12 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Icons.Upload className="w-4 h-4 shrink-0" />
                <span>{uploading ? 'Uploading...' : `Upload ${form.type === 'lab' ? 'Lab' : 'Lecture'}`}</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/professor')}
                className="w-full sm:w-44 lg:w-52 h-12 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 text-xs sm:text-sm font-semibold border border-slate-200 hover:border-slate-300 rounded-xl transition-all flex items-center justify-center cursor-pointer shadow-2xs"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
