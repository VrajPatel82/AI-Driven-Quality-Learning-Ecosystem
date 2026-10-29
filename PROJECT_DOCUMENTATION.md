# AI-Powered Multilingual Lecture & University ERP System
## Complete Comprehensive Technical & Operational Documentation

---

## 1. Executive Summary

The **AI-Powered Multilingual Lecture & University ERP System** is a unified higher-education web platform designed to solve two core challenges in modern academia:
1. **The Language Barrier in Learning:** Higher education lectures in science, technology, and engineering are predominantly delivered in English. Many students comprehend complex technical topics significantly faster and deeper when taught in their native languages (e.g., Hindi, Gujarati, Marathi).
2. **Academic & Administrative Overhead:** Colleges struggle with fragmented tools for course material, attendance tracking, faculty leaves/substitutions, assignment evaluation, and assessment workflows.

This platform bridges both gaps by marrying a **Speech-to-Speech / Speech-to-Text Multilingual AI Engine** with a **Multi-Tenant Academic ERP Management Suite**.

---

## 2. High-Level System Architecture

```
                                  +---------------------------------------+
                                  |            CLIENT APPLICATION         |
                                  |         (React 18 + Vite + Tailwind)  |
                                  +-------------------+-------------------+
                                                      |
                                           REST API / JWT Auth
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |             EXPRESS SERVER            |
                                  |   (Node.js REST API, Helmet, CORS,    |
                                  |    Rate-Limiter, RBAC, Data Sanitizer)|
                                  +---------+-------------------+---------+
                                            |                   |
                     +----------------------+                   +-----------------------+
                     |                                                                  |
                     v                                                                  v
+--------------------+---------------------+                  +-------------------------+---------------------+
|        PRIMARY DATABASE & CACHING        |                  |                 AI ENGINES                    |
+------------------------------------------+                  +-----------------------------------------------+
| • MongoDB (Mongoose ODM)                 |                  | • Groq Whisper Large V3 Turbo (STT)           |
|   - 27 Collections: Users, Courses,      |                  | • Google Gemini 1.5/2.0 Flash (LLM / Vision)  |
|     Lectures, Transcripts, Attendance,   |                  | • Groq Compound Mini (Contextual Chat Tutor)  |
|     Assignments, Quizzes, ERP Ledgers    |                  | • Python TTS Synthesizer + FFmpeg (Audio Dub) |
| • Redis (Optional Caching Layer)         |                  | • PDFKit, pdf-parse, mammoth (Doc Extraction) |
+------------------------------------------+                  +-----------------------------------------------+
```

---

## 3. Technology Stack Breakdown

| Layer | Technologies Used | Details / Purpose |
| :--- | :--- | :--- |
| **Frontend UI** | React 18, Vite, Tailwind CSS, Lucide Icons | Responsive single-page application with customized dashboards for 5 distinct roles. |
| **Routing & State** | React Router DOM v6, React Context API | Role-based private route protection and central authentication context. |
| **Backend API** | Node.js, Express.js | Modular controller-service-route REST architecture. |
| **Security & Middleware** | JWT, bcryptjs, Helmet, Express Rate Limit, Mongo Sanitize, Multer | Token-based auth, password hashing, header hardening, request sanitization, and file uploads. |
| **Database** | MongoDB (v7+ Mongoose ODM) | Schema validation, document indexing, relational references, and tenant filtering. |
| **Cache Layer** | Redis (`ioredis`) | Performance caching for frequently accessed datasets with graceful fallback if offline. |
| **Speech-to-Text** | Groq SDK (`whisper-large-v3-turbo`) | High-speed audio transcription generating millisecond word-level timestamps. |
| **Large Language Models** | Google Gemini (`@google/generative-ai`), Groq API | Translation, contextual conversational tutoring, and rubric-driven assignment grading. |
| **Audio Synthesis (TTS)** | Python 3, Edge-TTS / gTTS, FFmpeg | Time-aligned narration chunking and native multilingual audio synthesis. |
| **Document Processing** | PDFKit, pdf-parse, mammoth, exceljs | Dynamic PDF generation, question extraction, and Excel grade sheet exports. |

---

## 4. Multi-Tenant Role Hierarchy & Access Control (RBAC)

The platform employs a 5-tier hierarchical authorization model with strict multi-tenant isolation:

```
[Super Admin] ──> Manages Global System, Institutions & Security Logs
      │
      └──> [Institutional Admin] ──> Manages Campus Departments & HODs
                 │
                 └──> [Department Admin / HOD] ──> Manages Courses, Faculty & Rosters
                            │
                            ├──> [Professor] ──> Uploads Lectures, Grades, Marks Attendance
                            │
                            └──> [Student] ──> Learns in Native Language, Takes Quizzes, Submits Work
```

### Role Capabilities Matrix

| Role | Boundary Scope | Key Responsibilities |
| :--- | :--- | :--- |
| `super_admin` | Global / Cross-Institution | Manage college licenses, inspect system health, monitor performance, and audit security logs. |
| `inst_admin` | College / University Campus | Manage academic departments, appoint department admins, review campus-wide attendance and analytics. |
| `dept_admin` | Academic Department (e.g., CSE) | Assign courses to faculty, manage student semester promotions, oversee attendance, handle faculty substitutions. |
| `professor` | Assigned Courses & Sections | Upload video/audio lectures, trigger translations, generate quizzes, grade assignments, take attendance. |
| `student` | Enrolled Courses & Semester | Stream lectures with multilingual audio and subtitles, chat with AI lecture tutor, attempt quizzes, view attendance. |

---

## 5. Database Schema & Data Models (MongoDB Collections)

The backend defines 27 specialized schemas in `backend/models/`:

1. **`User`**: Account credentials, hashed password, role (`student`, `professor`, `dept_admin`, `inst_admin`, `super_admin`), institution ID, department ID, semester, section/division, roll number.
2. **`Institution`**: University details, address, registration code, active status.
3. **`Department`**: Department name, code (e.g., "CSE"), and institution reference.
4. **`Course`**: Course code, name, credits, semester, department ID, assigned faculty.
5. **`Enrollment`**: Student-course-semester mapping serving as the **single source of truth** for student academic authorization.
6. **`Lecture`**: Video/audio media URLs, title, course, professor, duration, processing state (`processing`, `ready`, `failed`).
7. **`LectureTranscript`**: Original spoken text with timestamped segments (`[{ start, end, text }]`), language metadata, and translated cache.
8. **`LectureAudio`**: Multi-track dubbed audio recordings per language (e.g., Hindi, Gujarati) with chunk mappings and audio files.
9. **`AIConversation`**: Session container for student-to-AI interaction scoped to specific lectures.
10. **`AIMessage`**: Individual messages within an AI conversation (user query, prompt type, AI response, token consumption).
11. **`Quiz`**: Multiple choice assessment questions linked to a lecture or standalone, with options, correct answers, and explanations.
12. **`QuizResult`**: Student quiz submission, selected options, score, submission time, and question feedback.
13. **`Assignment`**: Title, instructions, deadline, max marks, question PDF path, and structured rubric criteria.
14. **`AttendanceSession`**: Official lecture attendance session created for a specific course, date, time slot, and division.
15. **`AttendanceRecord`**: Individual student presence entry (`present` or `absent`) associated with a session.
16. **`FacultySubstitution`**: Temporary delegation record allowing substitute faculty to take attendance for another professor's course.
17. **`Gradebook`**: Academic weightage components (quizzes, midterms, assignments) and calculated student final grades.
18. **`Announcement`**: Broadcast messages targeted by institution, department, or course.
19. **`Notification`**: Real-time user alert records for assignment deadlines, low attendance, or grade publications.
20. **`ForumPost`**: Discussion board questions, replies, resolutions, and upvotes for collaborative peer learning.
21. **`Event`**: Academic calendar items (exams, seminars, holidays).
22. **`AuditLog`**: Tamper-evident operational audit trail capturing critical administrative actions.
23. **`ResourceAllocation` & `FileMetadata`**: Disk space quota allocation and tracking of uploaded files.
24. **`MeteredAIUsageLedger`**: Audit record of AI token consumption per institution and department.

---

## 6. Complete Backend API Route Reference

All routes are prefixed with `/api` and defined in `backend/routes/`.

### 6.1 Authentication (`/api/auth`)
* `POST /api/auth/register`: Register new account with input validation.
* `POST /api/auth/login`: Authenticate email/password and issue JWT token.
* `GET  /api/auth/profile`: Return current logged-in user profile.
* `PUT  /api/auth/profile`: Update profile information.
* `PUT  /api/auth/change-password`: Update account password.

### 6.2 Lectures & Multilingual Media (`/api/lectures`)
* `GET    /api/lectures`: Get all accessible lectures (paginated, role-filtered).
* `GET    /api/lectures/student/content`: Student-specific enrolled lectures and labs.
* `GET    /api/lectures/:id`: Get lecture details by ID.
* `POST   /api/lectures`: Upload lecture video/audio and trigger background transcription.
* `PUT    /api/lectures/:id`: Update lecture metadata or attachments.
* `DELETE /api/lectures/:id`: Delete lecture and purge physical media files.
* `GET    /api/lectures/:id/transcription`: Fetch transcript with timestamps.
* `POST   /api/lectures/:id/transcription/retry`: Re-trigger Whisper STT transcription.
* `POST   /api/lectures/:id/important-questions`: AI generates key exam questions from transcript.
* `POST   /api/lectures/:id/generate-quiz`: AI generates MCQ quiz from transcript.
* `POST   /api/lectures/:lectureId/audio/generate`: Generate dubbed audio track (Hindi/Gujarati).
* `GET    /api/lectures/:lectureId/audio`: List available audio tracks.
* `DELETE /api/lectures/:lectureId/audio/:language`: Delete specific generated audio track.

### 6.3 Transcript Processing & PDF Notes (`/api/transcripts`)
* `GET  /api/transcripts/student/preferred-language`: Fetch student's default learning language.
* `PUT  /api/transcripts/student/preferred-language`: Update student's preferred language.
* `GET  /api/transcripts/:lectureId`: Retrieve transcript in source or translated language.
* `GET  /api/transcripts/:lectureId/languages`: List available translated languages.
* `POST /api/transcripts/:lectureId/translate`: Translate lecture transcript into target language.
* `GET  /api/transcripts/:lectureId/pdf/:language`: Download timestamped lecture notes PDF.

### 6.4 Contextual AI Assistant (`/api/ai-assistant`)
* `POST   /api/ai/conversations`: Resolve or start a lecture-specific conversation.
* `GET    /api/ai/conversations`: List student conversation history.
* `GET    /api/ai/conversations/:conversationId`: Fetch conversation details.
* `DELETE /api/ai/conversations/:conversationId`: Soft-delete conversation.
* `GET    /api/ai/conversations/:conversationId/messages`: Fetch conversation messages.
* `POST   /api/ai/conversations/:conversationId/messages`: Send doubt to AI; receive contextual answer.
* `DELETE /api/ai/conversations/:conversationId/messages`: Clear message history.

### 6.5 Academic Attendance & Substitution ERP (`/api/attendance`)
* `POST /api/attendance/sessions`: Create attendance session for a class.
* `GET  /api/attendance/sessions/:id`: Get attendance records of a session.
* `PUT  /api/attendance/sessions/:id`: Edit marked attendance for a session.
* `POST /api/attendance`: Mark attendance for enrolled students.
* `GET  /api/attendance/course/:courseId`: Get attendance log for a course.
* `GET  /api/attendance/student/:studentId`: Get attendance history and percentage for a student.
* `GET  /api/attendance/eligible-students`: Query eligible students based on Course + Division.
* `GET  /api/attendance/history`: Paginated history of sessions.
* `GET  /api/attendance/low-attendance`: List students falling below the minimum threshold (75%).
* `GET  /api/attendance/student/:studentId/summary`: Student attendance summary stats.
* `GET  /api/attendance/course/:courseId/summary`: Course attendance summary stats.
* `GET  /api/attendance/professor/summary`: Summary of sessions conducted by professor.
* `GET  /api/attendance/department/:departmentId/summary`: Department attendance metrics.
* `GET  /api/attendance/institution/:institutionId/summary`: Campus-wide attendance metrics.
* `POST /api/attendance/substitutions`: Assign substitute faculty to a class session.
* `GET  /api/attendance/substitutions/my`: View substitution duties assigned to current professor.
* `GET  /api/attendance/substitutions`: List all active substitutions.
* `PUT  /api/attendance/substitutions/:id`: Approve or update substitution status.

### 6.6 Assignments & AI Evaluation (`/api/assignments`)
* `GET    /api/assignments`: List assignments for courses.
* `GET    /api/assignments/:id`: Get assignment details, rubric, and question PDF.
* `POST   /api/assignments`: Create assignment with rubric criteria and question sheet.
* `POST   /api/assignments/:id/submit`: Student submits digital/scanned assignment.
* `GET    /api/assignments/:id/submissions`: Professor views student submissions.
* `POST   /api/assignments/:assignmentId/submissions/:submissionId/evaluate`: Trigger AI evaluation.
* `PUT    /api/assignments/:assignmentId/submissions/:submissionId/finalize`: Approve/finalize marks.
* `GET    /api/assignments/:id/export-excel`: Export complete assignment grading sheet to Excel.
* `DELETE /api/assignments/:id`: Delete assignment.

### 6.7 Quizzes & Assessments (`/api/quizzes` & `/api/quiz-results`)
* `GET    /api/quizzes`: List accessible quizzes.
* `GET    /api/quizzes/:id`: Fetch quiz questions.
* `POST   /api/quizzes`: Manually create quiz.
* `PUT    /api/quizzes/:id`: Update quiz questions/settings.
* `DELETE /api/quizzes/:id`: Delete quiz.
* `POST   /api/quizzes/generate-from-lecture/:lectureId`: AI generates quiz from lecture transcript.
* `POST   /api/quizzes/:id/submit`: Submit answers and receive score + explanations.
* `GET    /api/quizzes/:id/results`: Fetch quiz submission leaderboard/results.
* `DELETE /api/quiz-results/:id`: Reset/delete student quiz submission.

### 6.8 Courses & Administration (`/api/courses`, `/api/admin`, `/api/users`)
* `GET    /api/courses`: List courses (Strictly filtered by Enrollment for students).
* `GET    /api/courses/:id`: Get detailed course syllabus and instructor info.
* `POST   /api/courses`: Create course (Faculty/Admin).
* `GET    /api/users`: List users in department/institution.
* `POST   /api/users`: Create user account.
* `PUT    /api/users/:id`: Update user account.
* `PUT    /api/users/:id/update-semester`: Promote student to next semester.
* `DELETE /api/users/:id`: Delete user account.
* `GET    /api/admin/institutions` / `POST` / `PUT` / `DELETE`: Manage university tenants.
* `GET    /api/admin/departments` / `POST` / `PUT` / `DELETE`: Manage academic departments.
* `GET    /api/admin/stats` & `GET /api/admin/reports`: System usage reports.

### 6.9 Collaboration, Communication & Operations
* `GET /api/notifications/my` & `PUT /api/notifications/:id/read`: Alerts.
* `GET /api/announcements/my` & `POST /api/announcements`: Campus announcements.
* `GET /api/forum/posts` & `POST /api/forum/posts/:id/reply`: Q&A forum.
* `GET /api/gradebook/:courseId` & `POST /api/gradebook/:courseId/grades`: Gradebook.
* `POST /api/bulk/users` & `POST /api/bulk/users/parse-csv`: Batch user onboarding.
* `GET /api/export/students`, `/course/:id`, `/attendance`: Excel export utilities.
* `GET /api/audit-logs`: System audit trail for security compliance.
* `GET /api/resources/overview`, `/allocations`, `/ai-usage`: Multi-tenant disk & AI token usage.

---

## 7. Frontend Application Route Structure

Defined in `frontend/src/App.jsx` using React Router DOM v6:

### Public Routes
* `/signin` (or `/login`): Universal sign-in page.
* `/signup` (or `/register`): Self-registration page.

### 1. Student Portal (`/student/*`)
* `/student/dashboard`: Enrolled courses, upcoming tasks, attendance quick-view.
* `/student/lectures`: Course lecture list.
* `/student/lectures/:id`: Interactive lecture player (multilingual audio track switcher, synchronized subtitles, AI tutor side-panel, PDF notes download).
* `/student/labs` & `/student/labs/:id`: Practical lab session guides.
* `/student/quiz` & `/student/quiz/:id`: Assessment interface with instant grading.
* `/student/assignments`: Submission upload and feedback review portal.
* `/student/attendance`: Personal course-wise attendance breakdown and low-attendance warnings.
* `/student/progress`: Academic performance dashboard.
* `/student/notifications`: User alert center.
* `/student/profile`: Account preferences and preferred lecture translation language.

### 2. Professor Portal (`/professor/*`)
* `/professor/dashboard`: Activity overview (recent uploads, pending evaluations, classes).
* `/professor/upload`: Media uploader for lectures and lab materials.
* `/professor/my-lectures` & `/professor/lectures/:lectureId`: Lecture manager, transcription viewer, TTS trigger.
* `/professor/my-labs` & `/professor/labs/:id`: Lab experiment manager.
* `/professor/quiz-builder` & `/professor/quizzes`: Manual & AI quiz generator.
* `/professor/assignments`: Create rubrics, view submissions, run AI grading, finalize marks.
* `/professor/attendance`: Mark daily attendance sessions and view substitution duties.
* `/professor/gradebook`: Weightage configuration and semester mark sheets.
* `/professor/students`: Roster of students enrolled in taught courses.
* `/professor/analytics`: Video viewership, quiz performance, and class analytics.
* `/professor/settings`: Profile and preference settings.

### 3. Department Admin Portal (`/dept-admin/*`)
* `/dept-admin/overview`: Department health dashboard (students, faculty, classes).
* `/dept-admin/courses`: Department course catalog & faculty allocations.
* `/dept-admin/faculty`: Faculty roster and substitution assignment console.
* `/dept-admin/students`: Student records, division assignments, and semester promotions.
* `/dept-admin/attendance`: Department-wide attendance compliance monitor.
* `/dept-admin/analytics`: Academic metrics and lecture upload frequency.
* `/dept-admin/lecture-analysis/:id`: Content quality and transcription audit.
* `/dept-admin/student-issues`: Student grievance resolution console.

### 4. Institutional Admin Portal (`/inst-admin/*`)
* `/inst-admin/overview`: University-wide KPI executive dashboard.
* `/inst-admin/departments`: Campus academic departments manager.
* `/inst-admin/dept-admins`: Appoint and manage Department Heads (HODs).
* `/inst-admin/attendance`: University-wide attendance compliance monitor.
* `/inst-admin/policies`: Institution rules (e.g., minimum 75% attendance threshold).
* `/inst-admin/escalations`: Escalated academic issues.

### 5. Super Admin Portal (`/super-admin/*`)
* `/super-admin/overview`: Platform infrastructure metrics, database status, tenant distribution.
* `/super-admin/institutions`: University tenant provisioning.
* `/super-admin/inst-admins`: Institutional administrator provisioning.
* `/super-admin/monitoring`: System performance, Redis status, API health.
* `/super-admin/security-logs`: Security audit logs, authentication failures, unauthorized access attempts.

---

## 8. Deep-Dive: Core AI Processing Workflows

### 8.1 Speech-to-Speech / Speech-to-Text Pipeline
1. **Upload & Ingestion:** Professor uploads lecture video/audio via Multer (`backend/routes/lectures.js`).
2. **Audio Extraction:** Server runs FFmpeg to extract clean 16kHz mono audio.
3. **Transcription:** `backend/services/transcription.js` sends audio chunks to **Groq Whisper Large V3 Turbo**, yielding precise word-level timestamps.
4. **Translation:** `backend/services/transcriptProcessingService.js` batches segments and sends them to **Google Gemini / Groq** with context prompts to ensure technical accuracy in target languages (Hindi, Gujarati, etc.).
5. **Speech Dubbing (TTS):**
   * Segments are grouped into natural sentence narration paragraphs (18–30 seconds).
   * `backend/services/audioSynthesisService.js` spawns `backend/scripts/tts_synthesizer.py`.
   * Python synthesizes localized speech audio and normalizes timing with FFmpeg.
6. **Synchronized Playback:** In the React video player, students can switch between the original lecture audio and the synthesized Hindi/Gujarati track while watching the video.

### 8.2 Rubric-Driven AI Assignment Grading
1. **Assignment Creation:** Professor defines assignment criteria (e.g., *Concept Accuracy 40%*, *Code Quality 30%*, *Viva/Explanations 30%*) and uploads the question paper.
2. **Student Submission:** Student uploads completed work (PDF, scanned handwritten document, or text).
3. **Text / OCR Extraction:** System parses text using `pdf-parse` or sends scanned pages to **Gemini Vision** for handwritten OCR extraction.
4. **AI Evaluation:** `backend/services/aiAssignmentEvaluationService.js` feeds the question paper, student answers, and rubric into LLM.
5. **Structured Assessment Output:** AI outputs structured JSON:
   * Marks awarded per rubric item.
   * Specific strengths detected in the submission.
   * Areas for improvement and clear reasoning.
6. **Professor Finalization:** Professor reviews AI suggestions on the dashboard, adjusts marks if necessary, and finalizes the grade.

### 8.3 In-Lecture 24/7 AI Tutor Chatbot
* While watching a video, students can open the AI Assistant drawer.
* The assistant is grounded directly in the **lecture transcript**.
* If a student asks *"Explain what the professor said at 12:40 about Deadlocks"*, the AI locates the segment, extracts the exact pedagogical explanation, and simplifies it in the student's chosen language.

---

## 9. Academic Attendance & Substitution Engine

1. **Course & Division Eligibility:**
   * Attendance eligibility is strictly enforced via the `Enrollment` collection.
   * Only students officially enrolled in the specific course and division appear on the marking sheet.
2. **Session Recording:**
   * Supports multiple sessions on the same day (e.g., Lecture 1 & Lab 2).
   * Calculates real-time attendance percentage with automated low-attendance alerts (< 75%).
3. **Faculty Substitution Workflow:**
   * If a faculty member is absent, the Department Admin can assign a **Faculty Substitution**.
   * The substitute professor temporarily receives authorized access to view the course roster and mark attendance for that specific date and session.
   * The system logs whether attendance was taken by the primary professor or a verified substitute.

---

## 10. Local Development & Deployment Guide

### Prerequisites
* Node.js (v18.0 or higher)
* MongoDB (v6.0 or higher)
* Python 3.8+ (with `edge-tts`, `imageio_ffmpeg` or system FFmpeg)
* Redis (Optional - system falls back gracefully if absent)

### 1. Backend Setup
```bash
cd backend
npm install

# Create and populate backend/.env
# Example .env configuration:
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/ai-lecture-system
JWT_SECRET=super_secret_jwt_key_12345
GROQ_API_KEY=gsk_your_groq_api_key
GEMINI_API_KEY=AIzaSy_your_gemini_api_key
GEMINI_MODEL_NAME=gemini-2.0-flash
GROQ_TUTOR_MODEL=groq/compound-mini
FRONTEND_URL=http://localhost:5173
PYTHON_PATH=python

# Seed initial database records (Admin, Departments, Courses, Demo Users)
npm run seed

# Start development API server
npm run dev
```

### 2. Frontend Setup
```bash
cd ../frontend
npm install

# Create frontend/.env
# Example:
VITE_API_URL=http://localhost:5000/api

# Start Vite React development server
npm run dev
```

* Frontend URL: `http://localhost:5173`
* Backend API URL: `http://localhost:5000`
* Health Check: `http://localhost:5000/api/health`

---

## 11. Summary for AI Ingestion

> **For any AI reading this document:**
> This codebase represents a production-grade MERN + AI application. When answering questions, writing tests, or proposing feature modifications for this codebase:
> 1. Respect the **5-tier RBAC authorization model** (`super_admin`, `inst_admin`, `dept_admin`, `professor`, `student`).
> 2. Ensure all student-course queries reference the **`Enrollment`** model as the single source of truth.
> 3. Preserve the separation of the **multilingual media pipeline** (Whisper for STT, Gemini/Groq for LLM translations, Python for TTS dubbing).
> 4. Adhere to the existing Express REST controller-service structure and React Router DOM v6 route layout conventions.
