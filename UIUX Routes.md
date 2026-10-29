# UI/UX Routes

## Purpose

This document contains the complete and verified route inventory for the upcoming mobile-responsive UI/UX work across the frontend application. It audits all existing pages, layout shells, index redirections, and dynamic parameterized routes belonging to the **Super Admin**, **Professor**, and **Student** modules, based directly on the application's actual React Router configuration (`frontend/src/App.jsx`) and supporting page components.

---

# 1. Super Admin Routes

Base Path: `/super-admin`  
Layout Component: `SuperAdminLayout` (`frontend/src/components/layouts/SuperAdminLayout.jsx`)  
Authentication Guard: `PrivateRoute` (`allowedRoles: ['super_admin']`)

| # | Route | Page/Screen | Route Type | Notes |
|---|---|---|---|---|
| 1 | `/super-admin` | Super Admin Root Redirect | Protected / Layout / Index Redirect | Redirects automatically to `/super-admin/overview` via `<Navigate to="overview" replace />`. |
| 2 | `/super-admin/overview` | Super Admin Overview (`SuperOverview.jsx`) | Protected / Static | Global executive dashboard displaying platform-wide statistics (universities, institutions, departments, courses, students, professors), quick action navigation tiles, and recent platform notifications. |
| 3 | `/super-admin/universities` | Universities Management (`SuperUniversities.jsx`) | Protected / Static | Directory and management table of all registered universities, search/filter controls, and onboarding modal for adding new universities. |
| 4 | `/super-admin/universities/:id` | University Detail (`SuperUniversityDetail.jsx`) | Protected / Dynamic (`:id`) | Comprehensive university detail page displaying campus metadata, institutional breakdown tabs, affiliated departments, quota usage, and administrative controls. |
| 5 | `/super-admin/university-admins` | University Admins (`SuperUniversityAdmins.jsx`) | Protected / Static | Management page for creating, assigning, auditing, and managing university administrator accounts across tenant universities. |
| 6 | `/super-admin/university-analytics` | University Analytics (`SuperUniversityAnalytics.jsx`) | Protected / Static | Cross-university comparative analytics, student/faculty growth curves, and platform usage metrics. |
| 7 | `/super-admin/storage` | Storage Allocation (`SuperStorage.jsx`) | Protected / Static | Central storage management interface leveraging the shared `ResourceManagement` component (`role="super_admin"`) for monitoring disk/B2 object storage pools and tenant quotas. |
| 8 | `/super-admin/institutions` | Institutions Management (`SuperInstitutions.jsx`) | Protected / Static | List and management table of all institutions/colleges across universities, institution status toggles, and creation modal. |
| 9 | `/super-admin/inst-admins` | Institutional Admins (`SuperInstAdmins.jsx`) | Protected / Static | Management interface for appointing and managing campus-level institutional administrator accounts. |
| 10 | `/super-admin/monitoring` | System Monitoring (`SuperMonitoring.jsx`) | Protected / Static | Real-time system health dashboard tracking server health, CPU/memory metrics, API latency, and service availability. |
| 11 | `/super-admin/security-logs` | Security Logs (`SuperSecurityLogs.jsx`) | Protected / Static | Comprehensive audit log viewer for authentication attempts, IP tracking, role changes, and security events. |
| 12 | `/super-admin/policies` | System Policies (`SuperPolicies.jsx`) | Protected / Static | Platform governance, system policies, security compliance rules, and platform configuration terms. |
| 13 | `/super-admin/profile` | Super Admin Profile & Security (`SuperProfile.jsx`) | Protected / Static | Super admin user profile data, credentials update, password reset, and session settings. |

---

# 2. Professor Routes

Base Path: `/professor`  
Layout Component: `ProfessorLayout` (`frontend/src/components/layouts/ProfessorLayout.jsx`)  
Authentication Guard: `PrivateRoute` (`allowedRoles: ['professor']`)

| # | Route | Page/Screen | Route Type | Notes |
|---|---|---|---|---|
| 1 | `/professor` | Professor Root Redirect | Protected / Layout / Index Redirect | Redirects automatically to `/professor/dashboard` via `<Navigate to="dashboard" replace />`. |
| 2 | `/professor/dashboard` | Professor Dashboard (`ProfDashboard.jsx`) | Protected / Static | Primary command center displaying quick stats (lectures, labs, quizzes, students), recent uploads feed, quick action links, and quick upload CTA. |
| 3 | `/professor/upload` | Lecture & Lab Upload (`ProfUpload.jsx`) | Protected / Static | Material upload interface supporting video/audio upload, document materials, in-browser recording (`ProfessorLectureRecorder`), and processing pipeline dispatch. |
| 4 | `/professor/my-lectures` | My Lectures (`ProfMyLectures.jsx`) | Protected / Static | Catalog of professor's uploaded lectures with status badges (processing, ready, error), search/filter controls, and links to detailed views. |
| 5 | `/professor/my-labs` | My Labs (`ProfMyLabs.jsx`) | Protected / Static | Catalog of practical lab sessions and materials created by the professor with student submission tracking links. |
| 6 | `/professor/quiz-builder` | Quiz Builder (`ProfQuizBuilder.jsx`) | Protected / Static | Interactive quiz authoring studio supporting manual question composition, AI-assisted question generation, options configuration, time limits, and publishing controls. |
| 7 | `/professor/quizzes` | Quizzes Management (`ProfessorQuizzes.jsx`) | Protected / Static | Centralized dashboard of all created quizzes, active status toggles, attempt counts, and score overviews. |
| 8 | `/professor/assignments` | Assignments Management (`ProfAssignments.jsx`) | Protected / Static | Assignment authoring workbench, deadline scheduling, rubric definition, student submission review, and grading interface. |
| 9 | `/professor/attendance` | Attendance Management (`ProfAttendance.jsx`) | Protected / Static | Daily and lecture-wise student attendance register, roll-call marking, and attendance record summaries. |
| 10 | `/professor/gradebook` | Gradebook (`ProfGradebook.jsx`) | Protected / Static | Consolidated gradebook table aggregating quiz results, assignment marks, and overall class performance with export options. |
| 11 | `/professor/students` | Students Roster (`ProfStudents.jsx`) | Protected / Static | Enrolled student roster with search/filter features and shortcuts to individual attendance, gradebook, and performance records. |
| 12 | `/professor/analytics` | Teaching Analytics (`ProfAnalytics.jsx`) | Protected / Static | Teaching analytics covering lecture engagement, quiz performance distributions, and student retention trends. |
| 13 | `/professor/settings` | Professor Settings & Profile (`ProfSettings.jsx`) | Protected / Static | Profile management (name, phone, bio) and account security/password update interface. |
| 14 | `/professor/storage` | Professor Storage (`ProfStorage.jsx`) | Protected / Static | Personal storage quota utilization dashboard tracking uploaded media, storage breakdown, and cleanup tools. |
| 15 | `/professor/lectures/:lectureId` | Lecture Details & AI Workspace (`LectureDetailWithQuiz.jsx`) | Protected / Dynamic (`:lectureId`) | Comprehensive lecture workstation featuring video/audio player with time seeking, synchronized interactive transcript with inline editing (`EditContentModal`), multilingual audio synthesis & translation track manager (`AudioTrackManager`), language distribution chart (`LanguageChart`), AI quiz generation modal (`GenerateQuizModal`), and quiz preview (`QuizPreviewForProfessor`). |
| 16 | `/professor/labs/:id` | Lab Details (`ProfessorLabDetail.jsx`) | Protected / Dynamic (`:id`) | Detailed lab session viewer with experiment steps, lab media, student submission tracking, and lab instructions. |

---

# 3. Student Routes

Base Path: `/student`  
Layout Component: `StudentLayout` (`frontend/src/components/layouts/StudentLayout.jsx`)  
Authentication Guard: `PrivateRoute` (`allowedRoles: ['student']`)

| # | Route | Page/Screen | Route Type | Notes |
|---|---|---|---|---|
| 1 | `/student` | Student Root Redirect | Protected / Layout / Index Redirect | Redirects automatically to `/student/dashboard` via `<Navigate to="dashboard" replace />`. |
| 2 | `/student/dashboard` | Student Dashboard (`StudentDashboard.jsx`) | Protected / Static | Student homepage featuring learning statistics, "continue watching" lecture carousel, upcoming labs, pending quizzes, and quick access links. |
| 3 | `/student/study-assistant` | AI Study Assistant (`StudentStudyAssistant.jsx`) | Protected / Static | Conversational AI tutoring interface for querying lecture concepts, receiving explanations in native languages, and contextual learning assistance. |
| 4 | `/student/lectures` | My Lectures Library (`StudentLectures.jsx`) | Protected / Static | Course lecture library with search, subject filtering, progress indicators, and lecture cards. |
| 5 | `/student/lectures/:id` | Lecture Player & Multilingual Hub (`StudentLectureDetail.jsx`) | Protected / Dynamic (`:id`) | Core multimedia learning screen with video/audio player, interactive real-time synchronized transcript, multilingual audio track selector (`AudioTrackManager` for dubbed TTS in Hindi, Gujarati, Marathi, etc.), personal note pad, and course materials. *(Note: A link in `QuizDetail.jsx` points to `/student/lecture/:id` which is currently handled by fallback routing; the canonical route is `/student/lectures/:id`).* |
| 6 | `/student/labs` | My Labs (`StudentLabs.jsx`) | Protected / Static | Catalog of assigned laboratory practicals, due dates, experiment objectives, and completion status. |
| 7 | `/student/labs/:id` | Lab Detail & Submission (`StudentLabDetail.jsx`) | Protected / Dynamic (`:id`) | Individual laboratory workspace with procedure guidelines, lab media, submission forms, and linked quizzes. |
| 8 | `/student/quiz` | Quizzes (`StudentQuiz.jsx`) | Protected / Static | List of available, completed, and pending quizzes with due dates and past score summaries. |
| 9 | `/student/quiz/:id` | Quiz Assessment & Results (`StudentQuizDetail.jsx`) | Protected / Dynamic (`:id`) | Timed quiz examination player featuring question navigation, option selection, submission handling, and post-submission score analysis with answer keys. |
| 10 | `/student/assignments` | Assignments (`StudentAssignments.jsx`) | Protected / Static | Course assignments list, problem descriptions, submission deadlines, file upload area, and instructor feedback. |
| 11 | `/student/attendance` | Attendance Tracker (`StudentAttendance.jsx`) | Protected / Static | Personal attendance records showing overall percentage, subject-wise attendance stats, and attendance history logs. |
| 12 | `/student/notifications` | Notifications & Announcements (`StudentNotifications.jsx`) | Protected / Static | Announcements and alert center for class notices, upcoming deadlines, quiz publications, and system updates. |
| 13 | `/student/progress` | Learning Progress & Results (`StudentProgress.jsx`) | Protected / Static | Academic progress overview showcasing enrolled courses, quiz score averages, assignment completion metrics, and learning charts. |
| 14 | `/student/profile` | Student Profile (`StudentProfile.jsx`) | Protected / Static | Student profile management displaying academic info (Roll No, Department, Semester, Division), language preference settings, and account security. |

---

# 4. Route Summary

| Module / Side | Total Routes (Including Index Redirect) | Functional Page Screens | Static Routes | Dynamic Parameter Routes (`:id`, `:lectureId`) |
|---|---|---|---|---|
| **Super Admin** | 13 | 12 | 12 | 1 (`/super-admin/universities/:id`) |
| **Professor** | 16 | 15 | 14 | 2 (`/professor/lectures/:lectureId`, `/professor/labs/:id`) |
| **Student** | 14 | 13 | 11 | 3 (`/student/lectures/:id`, `/student/labs/:id`, `/student/quiz/:id`) |
| **Total Across All Three Sides** | **43** | **40** | **37** | **6** |

- **Total Super Admin routes:** 13 (12 page screens + 1 layout index redirect)
- **Total Professor routes:** 16 (15 page screens + 1 layout index redirect)
- **Total Student routes:** 14 (13 page screens + 1 layout index redirect)
- **Total routes across all three sides:** 43 routes (40 functional page screens + 3 layout index redirects)

---

# 5. UI/UX Work Scope

## Super Admin
- [ ] All Super Admin pages
- [ ] All Super Admin nested pages
- [ ] All Super Admin dynamic pages

## Professor
- [ ] All Professor pages
- [ ] All Professor nested pages
- [ ] All Professor dynamic pages

## Student
- [ ] All Student pages
- [ ] All Student nested pages
- [ ] All Student dynamic pages
