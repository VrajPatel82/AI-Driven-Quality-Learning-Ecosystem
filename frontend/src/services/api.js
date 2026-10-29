import axios from 'axios';

// Get API base URL with fallback for development and production
const getBaseURL = () => {
  // Check for environment variable first
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // In production, use relative URL (same origin)
  if (import.meta.env.PROD) {
    return '/api';
  }

  // In development, fallback to localhost
  return 'http://localhost:5000/api';
};

const API_BASE_URL = getBaseURL();

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 120000 // 120 second timeout for long operations like translation
});

// Request interceptor - attach JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // For FormData payloads, remove Content-Type so browser/Axios attaches multipart/form-data with exact boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    // DEBUG: Log API requests
    if (config.url.includes('/users')) {
      console.log('[DEBUG API] Request to:', config.url);
      console.log('[DEBUG API] Params:', config.params);
      if (user) {
        try {
          const userData = JSON.parse(user);
          console.log('[DEBUG API] Request user role:', userData.role);
        } catch (e) {
          console.log('[DEBUG API] Could not parse user data');
        }
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/signin' && window.location.pathname !== '/signup') {
        window.location.href = '/signin';
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getProfile: () => api.get('/auth/profile'),
  updateProfile: (data) => api.put('/auth/profile', data),
  changePassword: (data) => api.put('/auth/change-password', data)
};

// Lectures API
export const lecturesAPI = {
  getAll: (params) => api.get('/lectures', { params }),
  getById: (id) => api.get(`/lectures/${id}`),
  create: (formData) => api.post('/lectures', formData, {
    timeout: 0 // No client-side timeout for large file uploads over slow connections
  }),
  update: (id, formData) => api.put(`/lectures/${id}`, formData, {
    timeout: 0
  }),
  delete: (id) => api.delete(`/lectures/${id}`),
  getTranscription: (id) => api.get(`/lectures/${id}/transcription`),
  retryTranscription: (id, data) => api.post(`/lectures/${id}/transcription/retry`, data || {}),
  generateQuiz: (id) => api.post(`/lectures/${id}/generate-quiz`, {}),
  getStudentContent: (params) => api.get('/lectures/student/content', { params }),
  generateImportantQuestions: (id) => api.post(`/lectures/${id}/important-questions`, {}, { timeout: 60000 }),
  getAudioTracks: (id) => api.get(`/lectures/${id}/audio`),
  generateAudio: (id, targetLanguage) => api.post(`/lectures/${id}/audio/generate`, { targetLanguage }, { timeout: 120000 }),
  deleteAudio: (id, language) => api.delete(`/lectures/${id}/audio/${language}`),
  initiateDirectUpload: (data) => api.post('/lectures/upload/initiate', data),
  completeDirectUpload: (data) => api.post('/lectures/upload/complete', data, { timeout: 120000 }),
  abortDirectUpload: (data) => api.post('/lectures/upload/abort', data)
};

// Quizzes API
export const quizzesAPI = {
  getAll: (params) => api.get('/quizzes', { params }),
  getById: (id) => api.get(`/quizzes/${id}`),
  create: (data) => api.post('/quizzes', data),
  update: (id, data) => api.put(`/quizzes/${id}`, data),
  delete: (id) => api.delete(`/quizzes/${id}`),
  submit: (id, data) => api.post(`/quizzes/${id}/submit`, data),
  getResults: (id) => api.get(`/quizzes/${id}/results`)
};

// Users API
export const usersAPI = {
  getAll: (params) => api.get('/users', { params }),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  updateSemester: (id, data) => api.put(`/users/${id}/update-semester`, data),
  importStudents: (formData) => api.post('/users/import-students', formData)
};

// Courses API (public - any authenticated user)
export const coursesAPI = {
  getAll: (params) => api.get('/courses', { params }),
  getById: (id) => api.get(`/courses/${id}`),
  getStudents: (id) => api.get(`/courses/${id}/students`),
  create: (data) => api.post('/courses', data)
};

// Attendance API
export const attendanceAPI = {
  mark: (data) => api.post('/attendance', data),
  getCourseAttendance: (courseId, params) => api.get(`/attendance/course/${courseId}`, { params }),
  getStudentAttendance: (studentId, params) => api.get(`/attendance/student/${studentId}`, { params }),
  getEligibleStudents: (params) => api.get('/attendance/eligible-students', { params }),
  createSession: (data) => api.post('/attendance/sessions', data),
  getSessionById: (id) => api.get(`/attendance/sessions/${id}`),
  updateSession: (id, data) => api.put(`/attendance/sessions/${id}`, data),
  getHistory: (params) => api.get('/attendance/history', { params }),
  getStudentSummary: (studentId) => api.get(`/attendance/student/${studentId}/summary`),
  getCourseSummary: (courseId, params) => api.get(`/attendance/course/${courseId}/summary`, { params }),
  getProfessorSummary: () => api.get('/attendance/professor/summary'),
  getDepartmentSummary: (departmentId, params) => api.get(`/attendance/department/${departmentId}/summary`, { params }),
  getInstitutionSummary: (institutionId, params) => api.get(`/attendance/institution/${institutionId}/summary`, { params }),
  getLowAttendance: (params) => api.get('/attendance/low-attendance', { params }),
  getMySubstitutions: () => api.get('/attendance/substitutions/my'),
  createSubstitution: (data) => api.post('/attendance/substitutions', data),
  getSubstitutions: (params) => api.get('/attendance/substitutions', { params }),
  updateSubstitution: (id, data) => api.put(`/attendance/substitutions/${id}`, data)
};

// Assignments API
export const assignmentsAPI = {
  getAll: (params) => api.get('/assignments', { params }),
  getById: (id) => api.get(`/assignments/${id}`),
  create: (formData) => api.post('/assignments', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  submit: (id, formData) => api.post(`/assignments/${id}/submit`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getSubmissions: (id) => api.get(`/assignments/${id}/submissions`),
  gradeSubmission: (assignmentId, submissionId, data) =>
    api.put(`/assignments/${assignmentId}/submissions/${submissionId}/grade`, data),
  evaluateSubmission: (assignmentId, submissionId) =>
    api.post(`/assignments/${assignmentId}/submissions/${submissionId}/evaluate`),
  finalizeSubmission: (assignmentId, submissionId, data) =>
    api.put(`/assignments/${assignmentId}/submissions/${submissionId}/finalize`, data),
  exportExcel: (id) =>
    api.get(`/assignments/${id}/export-excel`, { responseType: 'blob' }),
  delete: (id) => api.delete(`/assignments/${id}`)
};

// Gradebook API
export const gradebookAPI = {
  getCourse: (courseId) => api.get(`/gradebook/${courseId}`),
  getStudentGrades: (courseId, studentId) => api.get(`/gradebook/${courseId}/student/${studentId}`),
  setComponents: (courseId, data) => api.post(`/gradebook/${courseId}/components`, data),
  enterGrades: (courseId, data) => api.post(`/gradebook/${courseId}/grades`, data),
  enterBulkGrades: (courseId, data) => api.post(`/gradebook/${courseId}/grades/bulk`, data),
  downloadTemplate: (courseId, params) => api.get(`/gradebook/${courseId}/template`, { params, responseType: 'blob' }),
  previewImport: (courseId, formData) => api.post(`/gradebook/${courseId}/preview-import`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
};

// Notifications API
export const notificationsAPI = {
  getMy: (params) => api.get('/notifications/my', { params }),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
  send: (data) => api.post('/notifications/send', data),
  delete: (id) => api.delete(`/notifications/${id}`)
};

// Announcements API
export const announcementsAPI = {
  getMy: (params) => api.get('/announcements/my', { params }),
  getAll: (params) => api.get('/announcements', { params }),
  create: (data) => api.post('/announcements', data),
  delete: (id) => api.delete(`/announcements/${id}`)
};

// Forum API
export const forumAPI = {
  getPosts: (params) => api.get('/forum/posts', { params }),
  getPost: (id) => api.get(`/forum/posts/${id}`),
  createPost: (data) => api.post('/forum/posts', data),
  reply: (id, data) => api.post(`/forum/posts/${id}/reply`, data),
  toggleResolve: (id) => api.put(`/forum/posts/${id}/resolve`),
  upvoteReply: (postId, replyId) => api.put(`/forum/posts/${postId}/replies/${replyId}/upvote`),
  deletePost: (id) => api.delete(`/forum/posts/${id}`)
};

// Events / Calendar API
export const eventsAPI = {
  getAll: (params) => api.get('/events', { params }),
  create: (data) => api.post('/events', data),
  update: (id, data) => api.put(`/events/${id}`, data),
  delete: (id) => api.delete(`/events/${id}`)
};

// Analytics API
export const analyticsAPI = {
  getUniversityAdminOverview: (params) => api.get('/analytics/university-admin/overview', { params }),
  getAcademicAdminOverview: (params) => api.get('/analytics/academic-admin/overview', { params }),
  getProfessorStudentsOverview: (params) => api.get('/analytics/professor/students-overview', { params }),
  getProfessorStudentDetail: (studentId) => api.get(`/analytics/professor/student-detail/${studentId}`),
  getStudent: (id) => api.get(`/analytics/student/${id}`),
  getCourse: (id, params) => api.get(`/analytics/course/${id}`, { params }),
  getDepartment: (id) => api.get(`/analytics/department/${id}`),
  getLectureUploadAnalytics: (id) => api.get(`/analytics/department/${id}/lecture-uploads`),
  getLanguageUsageAnalytics: (id) => api.get(`/analytics/department/${id}/language-usage`)
};

// Bulk Operations API
export const bulkAPI = {
  createUsers: (data) => api.post('/bulk/users', data),
  parseCsv: (data) => api.post('/bulk/users/parse-csv', data),
  deleteUsers: (data) => api.delete('/bulk/users', { data })
};

// Export API
export const exportAPI = {
  students: (params) => api.get('/export/students', { params }),
  courseReport: (id) => api.get(`/export/course/${id}`),
  attendance: (params) => api.get('/export/attendance', { params }),
  auditLogs: (params) => api.get('/export/audit-logs', { params })
};

// Admin API
export const adminAPI = {
  getStats: () => api.get('/admin/stats'),
  getReports: () => api.get('/admin/reports'),
  // Institutions
  getInstitutions: () => api.get('/admin/institutions'),
  createInstitution: (data) => api.post('/admin/institutions', data),
  updateInstitution: (id, data) => api.put(`/admin/institutions/${id}`, data),
  deleteInstitution: (id) => api.delete(`/admin/institutions/${id}`),
  // Departments
  getDepartments: (params) => api.get('/admin/departments', { params }),
  createDepartment: (data) => api.post('/admin/departments', data),
  updateDepartment: (id, data) => api.put(`/admin/departments/${id}`, data),
  deleteDepartment: (id) => api.delete(`/admin/departments/${id}`),
  // Courses
  getCourses: (params) => api.get('/admin/courses', { params }),
  createCourse: (data) => api.post('/admin/courses', data),
  updateCourse: (id, data) => api.put(`/admin/courses/${id}`, data),
  deleteCourse: (id) => api.delete(`/admin/courses/${id}`)
};

// Universities API (Super Admin / University Admin)
export const universitiesAPI = {
  getAll: (params) => api.get('/admin/universities', { params }),
  getById: (id) => api.get(`/admin/universities/${id}`),
  create: (data) => api.post('/admin/universities', data),
  update: (id, data) => api.put(`/admin/universities/${id}`, data),
  delete: (id) => api.delete(`/admin/universities/${id}`),
  getStats: (id) => api.get(`/admin/universities/${id}/stats`),
  getInstitutions: (universityId) => api.get(`/admin/universities/${universityId}/institutions`),
  getAnalytics: () => api.get('/admin/university-analytics')
};

// University Admins API
export const universityAdminsAPI = {
  getAll: (params) => api.get('/admin/university-admins', { params }),
  create: (data) => api.post('/admin/university-admins', data),
  update: (id, data) => api.put(`/admin/university-admins/${id}`, data),
  delete: (id) => api.delete(`/admin/university-admins/${id}`)
};

// Enrollment & Promotion API (Academic Administrator)
export const enrollmentAPI = {
  getEnrollments: (params) => api.get('/enrollments', { params }),
  getStudentEnrollment: (studentId) => api.get(`/enrollments/student/${studentId}`),
  enroll: (data) => api.post('/enrollments', data),
  enrollBulk: (data) => api.post('/enrollments/bulk', data),
  unenroll: (id) => api.delete(`/enrollments/${id}`),
  promote: (data) => api.post('/enrollments/promote', data),
  getStudentHistory: (studentId) => api.get(`/enrollments/student/${studentId}/history`)
};


// Academic Lifecycle API (Semester Transition & Bulk Promotion)
export const academicLifecycleAPI = {
  transitionSingle: (data) => api.post('/academic-lifecycle/transition', data),
  transitionBulk: (data) => api.post('/academic-lifecycle/transition-bulk', data)
};


// Divisions API
export const divisionsAPI = {
  getAll: (params) => api.get('/admin/divisions', { params }),
  create: (data) => api.post('/admin/divisions', data),
  update: (id, data) => api.put(`/admin/divisions/${id}`, data),
  assignStudents: (data) => api.post('/admin/divisions/assign', data)
};

// Audit Logs API
export const auditLogsAPI = {
  getAll: (params) => api.get('/audit-logs', { params }),
  acknowledge: (id) => api.patch(`/audit-logs/${id}/acknowledge`)
};

// AI Assistant / AI Tutor API
export const aiAssistantAPI = {
  resolveConversation: (lectureId) =>
    api.post('/ai-assistant/conversations/resolve', {
      lectureId
    }),

  createStudyAssistantConversation: (data = {}) =>
    api.post('/ai-assistant/conversations/study-assistant', data),

  getHistory: (conversationId, params = {}) =>
    api.get(
      `/ai-assistant/conversations/${conversationId}/history`,
      { params }
    ),

  getStudentConversations: (params = {}) =>
    api.get('/ai-assistant/conversations', { params }),

  sendMessage: (conversationId, data) =>
    api.post(
      `/ai-assistant/conversations/${conversationId}/messages`,
      data
    ),

  clearMessages: (conversationId) =>
    api.delete(
      `/ai-assistant/conversations/${conversationId}/messages`
    ),

  deleteConversation: (conversationId) =>
    api.delete(
      `/ai-assistant/conversations/${conversationId}`
    )
};

// Resources API (Storage & Metered AI Quota)
export const resourcesAPI = {
  getOverview: () => api.get('/resources/overview'),
  getAllocations: () => api.get('/resources/allocations'),
  createAllocation: (data) => api.post('/resources/allocations', data),
  updateAllocation: (id, data) => api.put(`/resources/allocations/${id}`, data),
  revokeAllocation: (id) => api.delete(`/resources/allocations/${id}`),
  getHistory: () => api.get('/resources/history'),
  getFiles: () => api.get('/resources/files'),
  getAIUsage: () => api.get('/resources/ai-usage'),
  getProfessorBreakdown: (params) => api.get('/resources/professor/breakdown', { params }),
  getUsageLogs: (params) => api.get('/resources/usage-logs', { params }),
  getB2Status: () => api.get('/resources/storage/b2-status'),
  syncB2: () => api.post('/resources/storage/b2-sync'),
  getReconciliation: () => api.get('/resources/storage/reconciliation')
};

// AI & API Performance Analytics API
export const aiPerformanceAPI = {
  getOverview: (params) => api.get('/analytics/ai-performance/overview', { params }),
  getHistory: (params) => api.get('/analytics/ai-performance/history', { params }),
  getConfig: () => api.get('/analytics/ai-performance/config'),
  updateConfig: (data) => api.put('/analytics/ai-performance/config', data)
};

export default api;
