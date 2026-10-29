import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { ROLES, normalizeRole } from './utils/roles'

// Layouts
import StudentLayout from './components/layouts/StudentLayout'
import ProfessorLayout from './components/layouts/ProfessorLayout'
import InstitutionalAdminLayout from './components/layouts/InstitutionalAdminLayout'
import DepartmentalAdminLayout from './components/layouts/DepartmentalAdminLayout'
import SuperAdminLayout from './components/layouts/SuperAdminLayout'
import UniversityAdminLayout from './components/layouts/UniversityAdminLayout'
import AcademicAdminLayout from './components/layouts/AcademicAdminLayout'

// Auth Pages
import SignIn from './pages/auth/SignIn'
import SignUp from './pages/auth/SignUp'

// Student Pages
import StudentDashboard from './pages/student/Dashboard'
import StudentStudyAssistant from './pages/student/StudyAssistant'
import StudentLectures from './pages/student/Lectures'
import StudentLectureDetail from './pages/student/LectureDetail'
import StudentLabs from './pages/student/Labs'
import StudentLabDetail from './pages/student/LabDetail'
import StudentQuiz from './pages/student/Quiz'
import StudentQuizDetail from './pages/student/QuizDetail'
import StudentProgress from './pages/student/Progress'
import StudentProfile from './pages/student/Profile'
import StudentAssignments from './pages/student/Assignments'
import StudentAttendance from './pages/student/Attendance'
import StudentNotifications from './pages/student/Notifications'

// Professor Pages
import ProfDashboard from './pages/professor/Dashboard'
import ProfUpload from './pages/professor/Upload'
import ProfMyLectures from './pages/professor/MyLectures'
import ProfMyLabs from './pages/professor/MyLabs'
import ProfQuizBuilder from './pages/professor/QuizBuilder'
import ProfessorQuizzes from './pages/professor/Quizzes'
import ProfStudents from './pages/professor/Students'
import ProfAnalytics from './pages/professor/Analytics'
import ProfSettings from './pages/professor/Settings'
import ProfAssignments from './pages/professor/Assignments'
import ProfAttendance from './pages/professor/Attendance'
import ProfGradebook from './pages/professor/Gradebook'
import LectureDetailWithQuiz from './pages/professor/LectureDetailWithQuiz'
import ProfessorLabDetail from './pages/professor/LabDetail'
import ProfStorage from './pages/professor/Storage'

// Institutional Admin Pages
import InstOverview from './pages/inst-admin/Overview'
import InstDepartments from './pages/inst-admin/Departments'
import InstDeptAdmins from './pages/inst-admin/DeptAdmins'
import InstPolicies from './pages/inst-admin/Policies'
import InstEscalations from './pages/inst-admin/Escalations'
import InstAnalytics from './pages/inst-admin/Analytics'
import InstProfile from './pages/inst-admin/Profile'
import InstAttendance from './pages/inst-admin/Attendance'
import InstStorage from './pages/inst-admin/Storage'

// Department Admin Pages
import DeptOverview from './pages/dept-admin/Overview'
import DeptAcademicAdmins from './pages/dept-admin/AcademicAdmins'
import DeptCourses from './pages/dept-admin/Courses'
import DeptFaculty from './pages/dept-admin/Faculty'
import DeptStudents from './pages/dept-admin/Students'
import DeptAnalytics from './pages/dept-admin/Analytics'
import DeptStudentIssues from './pages/dept-admin/StudentIssues'
import DeptPolicies from './pages/dept-admin/Policies'
import DeptProfile from './pages/dept-admin/Profile'
import DeptLectureAnalysis from './pages/dept-admin/LectureAnalysis'
import DeptAttendance from './pages/dept-admin/Attendance'
import DeptStorage from './pages/dept-admin/Storage'

// Super Admin Pages
import SuperOverview from './pages/super-admin/Overview'
import SuperInstitutions from './pages/super-admin/Institutions'
import SuperInstAdmins from './pages/super-admin/InstAdmins'
import SuperMonitoring from './pages/super-admin/Monitoring'
import SuperSecurityLogs from './pages/super-admin/SecurityLogs'
import SuperPolicies from './pages/super-admin/Policies'
import SuperProfile from './pages/super-admin/Profile'
import SuperUniversities from './pages/super-admin/Universities'
import SuperUniversityDetail from './pages/super-admin/UniversityDetail'
import SuperUniversityAdmins from './pages/super-admin/UniversityAdmins'
import SuperUniversityAnalytics from './pages/super-admin/UniversityAnalytics'
import SuperStorage from './pages/super-admin/Storage'
import AIPerformanceAnalytics from './components/shared/AIPerformanceAnalytics'

// University Admin Pages
import UniDashboard from './pages/university-admin/Dashboard'
import UniInstitutions from './pages/university-admin/Institutions'
import UniInstitutionDetail from './pages/university-admin/InstitutionDetail'
import UniInstitutionAdmins from './pages/university-admin/InstitutionAdmins'
import UniDepartments from './pages/university-admin/Departments'
import UniStudents from './pages/university-admin/Students'
import UniProfessors from './pages/university-admin/Professors'
import UniAcademics from './pages/university-admin/AcademicOverview'
import UniReports from './pages/university-admin/Reports'
import UniStorage from './pages/university-admin/Storage'
import UniProfile from './pages/university-admin/Profile'

// Academic Administrator Pages
import AcadDashboard from './pages/academic-admin/Dashboard'
import AcadStudents from './pages/academic-admin/Students'
import AcadStudentDetail from './pages/academic-admin/StudentDetail'
import AcadEnrollment from './pages/academic-admin/Enrollment'
import AcadPromotion from './pages/academic-admin/Promotion'
import AcadSemesters from './pages/academic-admin/Semesters'
import AcadDivisions from './pages/academic-admin/Divisions'
import AcadCourses from './pages/academic-admin/Courses'
import AcadCourseDetail from './pages/academic-admin/CourseDetail'
import AcadAttendance from './pages/academic-admin/Attendance'
import AcadAssignments from './pages/academic-admin/Assignments'
import AcadQuizzes from './pages/academic-admin/Quizzes'
import AcadLectures from './pages/academic-admin/Lectures'
import AcadResults from './pages/academic-admin/Results'
import AcadReports from './pages/academic-admin/Reports'
import AcadProfile from './pages/academic-admin/Profile'

// Auth guard components
function PrivateRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex justify-center items-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>
  if (!user) return <Navigate to="/signin" replace />
  
  const userRole = normalizeRole(user.role)
  const normalizedAllowed = (allowedRoles || []).map(r => normalizeRole(r))
  if (allowedRoles && !normalizedAllowed.includes(userRole)) {
    return <Navigate to={getRoleDefaultPath(user.role)} replace />
  }
  return children
}

function getRoleDefaultPath(role) {
  const r = normalizeRole(role)
  switch (r) {
    case ROLES.STUDENT: return '/student/dashboard'
    case ROLES.PROFESSOR: return '/professor/dashboard'
    case ROLES.DEPARTMENT_ADMIN: return '/dept-admin/overview'
    case ROLES.INSTITUTION_ADMIN: return '/inst-admin/overview'
    case ROLES.SUPER_ADMIN: return '/super-admin/overview'
    case ROLES.UNIVERSITY_ADMIN: return '/university-admin/dashboard'
    case ROLES.ACADEMIC_ADMINISTRATOR: return '/academic-admin/dashboard'
    default: return '/signin'
  }
}

function AuthRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex justify-center items-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>
  if (user) return <Navigate to={getRoleDefaultPath(user.role)} replace />
  return <Navigate to="/signin" replace />
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-200 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Something went wrong</h2>
            <p className="text-sm text-slate-600 mb-6">
              An unexpected error occurred in this view. You can try reloading or returning to the dashboard.
            </p>
            {this.state.error && (
              <details className="text-left bg-slate-100 p-3 rounded-lg text-xs font-mono text-red-600 mb-6 max-h-40 overflow-auto">
                <summary className="cursor-pointer font-bold mb-1">Error details</summary>
                {this.state.error.toString()}
              </details>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
              >
                Try again
              </button>
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300 transition"
              >
                Return to Home
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

function App() {
  return (
    <ErrorBoundary>
      <Routes>
      {/* Auth */}
      <Route path="/" element={<AuthRedirect />} />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/login" element={<Navigate to="/signin" replace />} />
      <Route path="/register" element={<Navigate to="/signup" replace />} />

      {/* Student Portal */}
      <Route path="/student" element={
        <PrivateRoute allowedRoles={['student']}>
          <StudentLayout />
        </PrivateRoute>
      }>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<StudentDashboard />} />
        <Route path="study-assistant" element={<StudentStudyAssistant />} />
        <Route path="lectures" element={<StudentLectures />} />
        <Route path="lectures/:id" element={<StudentLectureDetail />} />
        <Route path="labs" element={<StudentLabs />} />
        <Route path="labs/:id" element={<StudentLabDetail />} />
        <Route path="quiz" element={<StudentQuiz />} />
        <Route path="quiz/:id" element={<StudentQuizDetail />} />
        <Route path="assignments" element={<StudentAssignments />} />
        <Route path="attendance" element={<StudentAttendance />} />
        <Route path="notifications" element={<StudentNotifications />} />
        <Route path="progress" element={<StudentProgress />} />
        <Route path="profile" element={<StudentProfile />} />
      </Route>

      {/* Professor Portal */}
      <Route path="/professor" element={
        <PrivateRoute allowedRoles={['professor']}>
          <ProfessorLayout />
        </PrivateRoute>
      }>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<ProfDashboard />} />
        <Route path="upload" element={<ProfUpload />} />
        <Route path="my-lectures" element={<ProfMyLectures />} />
        <Route path="my-labs" element={<ProfMyLabs />} />
        <Route path="quiz-builder" element={<ProfQuizBuilder />} />
        <Route path="quizzes" element={<ProfessorQuizzes />} />
        <Route path="assignments" element={<ProfAssignments />} />
        <Route path="attendance" element={<ProfAttendance />} />
        <Route path="gradebook" element={<ProfGradebook />} />
        <Route path="students" element={<ProfStudents />} />
        <Route path="analytics" element={<ProfAnalytics />} />
        <Route path="settings" element={<ProfSettings />} />
        <Route path="storage" element={<ProfStorage />} />
        <Route path="lectures/:lectureId" element={<LectureDetailWithQuiz />} />
        <Route path="my-lectures/:id" element={<LectureDetailWithQuiz />} />
        <Route path="labs/:id" element={<ProfessorLabDetail />} />
      </Route>

      {/* Institutional Admin */}
      <Route path="/inst-admin" element={
        <PrivateRoute allowedRoles={['inst_admin']}>
          <InstitutionalAdminLayout />
        </PrivateRoute>
      }>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<InstOverview />} />
        <Route path="departments" element={<InstDepartments />} />
        <Route path="dept-admins" element={<InstDeptAdmins />} />
        <Route path="policies" element={<InstPolicies />} />
        <Route path="escalations" element={<InstEscalations />} />
        <Route path="analytics" element={<InstAnalytics />} />
        <Route path="api-performance" element={<AIPerformanceAnalytics role="inst_admin" />} />
        <Route path="storage" element={<InstStorage />} />
        <Route path="profile" element={<InstProfile />} />
        <Route path="attendance" element={<InstAttendance />} />
      </Route>

      {/* Department Admin */}
      <Route path="/dept-admin" element={
        <PrivateRoute allowedRoles={['dept_admin']}>
          <DepartmentalAdminLayout />
        </PrivateRoute>
      }>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<DeptOverview />} />
        <Route path="academic-admins" element={<DeptAcademicAdmins />} />
        <Route path="courses" element={<DeptCourses />} />
        <Route path="faculty" element={<DeptFaculty />} />
        <Route path="students" element={<DeptStudents />} />
        <Route path="analytics" element={<DeptAnalytics />} />
        <Route path="api-performance" element={<AIPerformanceAnalytics role="dept_admin" />} />
        <Route path="student-issues" element={<DeptStudentIssues />} />
        <Route path="policies" element={<DeptPolicies />} />
        <Route path="storage" element={<DeptStorage />} />
        <Route path="profile" element={<DeptProfile />} />
        <Route path="lecture-analysis/:id" element={<DeptLectureAnalysis />} />
        <Route path="attendance" element={<DeptAttendance />} />
      </Route>

      {/* University Admin Portal */}
      <Route path="/university-admin" element={
        <PrivateRoute allowedRoles={['university_admin']}>
          <UniversityAdminLayout />
        </PrivateRoute>
      }>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<UniDashboard />} />
        <Route path="institutions" element={<UniInstitutions />} />
        <Route path="institutions/:id" element={<UniInstitutionDetail />} />
        <Route path="institution-admins" element={<UniInstitutionAdmins />} />
        <Route path="departments" element={<UniDepartments />} />
        <Route path="students" element={<UniStudents />} />
        <Route path="professors" element={<UniProfessors />} />
        <Route path="academics" element={<UniAcademics />} />
        <Route path="courses" element={<UniAcademics />} />
        <Route path="reports" element={<UniReports />} />
        <Route path="api-performance" element={<AIPerformanceAnalytics role="university_admin" />} />
        <Route path="storage" element={<UniStorage />} />
        <Route path="profile" element={<UniProfile />} />
      </Route>

      {/* Academic Administrator Portal */}
      <Route path="/academic-admin" element={
        <PrivateRoute allowedRoles={['academic_administrator']}>
          <AcademicAdminLayout />
        </PrivateRoute>
      }>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AcadDashboard />} />
        <Route path="students" element={<AcadStudents />} />
        <Route path="students/:id" element={<AcadStudentDetail />} />
        <Route path="enrollment" element={<AcadEnrollment />} />
        <Route path="promotion" element={<AcadPromotion />} />
        <Route path="semesters" element={<AcadSemesters />} />
        <Route path="divisions" element={<AcadDivisions />} />
        <Route path="courses" element={<AcadCourses />} />
        <Route path="courses/:id" element={<AcadCourseDetail />} />
        <Route path="attendance" element={<AcadAttendance />} />
        <Route path="assignments" element={<AcadAssignments />} />
        <Route path="quizzes" element={<AcadQuizzes />} />
        <Route path="lectures" element={<AcadLectures />} />
        <Route path="results" element={<AcadResults />} />
        <Route path="reports" element={<AcadReports />} />
        <Route path="profile" element={<AcadProfile />} />
      </Route>

      {/* Super Admin */}
      <Route path="/super-admin" element={
        <PrivateRoute allowedRoles={['super_admin']}>
          <SuperAdminLayout />
        </PrivateRoute>
      }>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<SuperOverview />} />
        <Route path="universities" element={<SuperUniversities />} />
        <Route path="universities/:id" element={<SuperUniversityDetail />} />
        <Route path="university-admins" element={<SuperUniversityAdmins />} />
        <Route path="university-analytics" element={<SuperUniversityAnalytics />} />
        <Route path="storage" element={<SuperStorage />} />
        <Route path="institutions" element={<SuperInstitutions />} />
        <Route path="inst-admins" element={<SuperInstAdmins />} />
        <Route path="monitoring" element={<SuperMonitoring />} />
        <Route path="api-performance" element={<SuperMonitoring defaultTab="api-performance" />} />
        <Route path="security-logs" element={<SuperSecurityLogs />} />
        <Route path="policies" element={<SuperPolicies />} />
        <Route path="profile" element={<SuperProfile />} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<AuthRedirect />} />
    </Routes>
    </ErrorBoundary>
  )
}

export default App
