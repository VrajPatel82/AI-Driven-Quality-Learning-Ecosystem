const mongoose = require('mongoose');
const User = require('../models/User');
const Quiz = require('../models/Quiz');
const QuizResult = require('../models/QuizResult');
const Lecture = require('../models/Lecture');
const Course = require('../models/Course');
const Attendance = require('../models/Attendance');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const Enrollment = require('../models/Enrollment');
const Assignment = require('../models/Assignment');
const Department = require('../models/Department');
const Institution = require('../models/Institution');
const Gradebook = require('../models/Gradebook');

// @desc    Get student performance analytics
// @route   GET /api/analytics/student/:id
exports.getStudentAnalytics = async (req, res, next) => {
  try {
    const studentId = req.params.id;
    const targetStudentId = (studentId && studentId !== 'undefined' && mongoose.Types.ObjectId.isValid(studentId))
      ? new mongoose.Types.ObjectId(studentId)
      : req.user._id;

    // Quiz performance over time
    const quizResults = await QuizResult.find({ student: targetStudentId })
      .populate('quiz', 'title course createdAt')
      .sort({ createdAt: -1 });

    const quizScores = quizResults.map(r => ({
      quizTitle: r.quiz?.title || 'Quiz',
      score: r.totalScore,
      maxScore: r.maxScore,
      percentage: r.maxScore > 0 ? parseFloat(((r.totalScore / r.maxScore) * 100).toFixed(1)) : 0,
      date: r.createdAt
    }));

    // Average score
    const avgScore = quizScores.length
      ? parseFloat((quizScores.reduce((sum, q) => sum + q.percentage, 0) / quizScores.length).toFixed(1))
      : null;

    const formattedQuizResults = quizResults.map(r => ({
      _id: r._id,
      quiz: r.quiz,
      score: r.totalScore,
      totalMarks: r.maxScore,
      percentage: r.maxScore > 0 ? parseFloat(((r.totalScore / r.maxScore) * 100).toFixed(1)) : 0,
      submittedAt: r.submittedAt || r.createdAt,
      createdAt: r.createdAt
    }));

    // Assignment stats
    const assignmentCount = await Assignment.countDocuments({ 'submissions.student': targetStudentId });

    // Attendance stats
    const attendanceService = require('../services/attendanceService');
    const studentSummary = await attendanceService.getStudentAttendance({ studentId: targetStudentId, courseId: null, user: { role: 'super_admin' } });
    const totalClasses = studentSummary.stats.totalClasses;
    const attendancePercentage = studentSummary.stats.percentage;

    // Rank among all students (by avg quiz score)
    const allResults = await QuizResult.aggregate([
      { $group: { _id: '$student', avgPct: { $avg: { $multiply: [{ $divide: ['$totalScore', '$maxScore'] }, 100] } } } },
      { $sort: { avgPct: -1 } }
    ]);
    const rank = allResults.findIndex(r => r._id.toString() === targetStudentId.toString()) + 1;

    res.json({
      quizzes: {
        totalAttempted: quizScores.length,
        averageScore: avgScore
      },
      assignments: {
        totalSubmitted: assignmentCount || 0
      },
      quizResults: formattedQuizResults,
      quizScores,
      avgScore: avgScore !== null ? avgScore : 0,
      totalQuizzes: quizScores.length,
      attendancePercentage,
      totalClasses,
      rank: rank || null,
      totalStudents: allResults.length
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get course analytics
// @route   GET /api/analytics/course/:id
exports.getCourseAnalytics = async (req, res, next) => {
  try {
    const courseId = req.params.id;
    const { semester } = req.query;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const targetSemester = semester ? parseInt(semester, 10) : course.semester;

    // 1. Authoritative Total Students from Enrollment
    const enrollments = await Enrollment.find({
      course: courseId,
      status: 'active'
    }).populate('student', 'isActive currentSemester');

    const validEnrollments = enrollments.filter(e =>
      e.student && e.student.isActive !== false && (!targetSemester || e.student.currentSemester === targetSemester)
    );
    const totalStudents = validEnrollments.length > 0
      ? validEnrollments.length
      : enrollments.filter(e => e.student && e.student.isActive !== false).length;

    // 2. Authoritative Attendance from AttendanceSession & AttendanceRecord
    const sessionQuery = {
      course: courseId,
      status: 'CONDUCTED'
    };
    if (targetSemester) {
      sessionQuery.semester = targetSemester;
    }

    let sessions = await AttendanceSession.find(sessionQuery).sort({ date: 1 });
    if (sessions.length === 0 && targetSemester) {
      sessions = await AttendanceSession.find({ course: courseId, status: 'CONDUCTED' }).sort({ date: 1 });
    }

    const sessionIds = sessions.map(s => s._id);
    let avgAttendance = null;
    const attendanceTrend = [];

    if (sessionIds.length > 0) {
      const records = await AttendanceRecord.find({
        session: { $in: sessionIds }
      });

      sessions.forEach(sess => {
        const sessRecords = records.filter(r => r.session.toString() === sess._id.toString());
        const presentCount = sessRecords.filter(r => r.status === 'PRESENT').length;
        const totalCount = sessRecords.length;
        const pct = totalCount > 0 ? parseFloat(((presentCount / totalCount) * 100).toFixed(1)) : 0;
        attendanceTrend.push({
          date: sess.date,
          percentage: pct
        });
      });

      let totalPresent = 0;
      let totalMarked = 0;
      records.forEach(r => {
        if (r.status === 'PRESENT') totalPresent++;
        if (r.status === 'PRESENT' || r.status === 'ABSENT') totalMarked++;
      });

      if (totalMarked > 0) {
        avgAttendance = parseFloat(((totalPresent / totalMarked) * 100).toFixed(1));
      }
    }

    // 3. Quizzes & Quiz Results
    const quizQuery = { course: courseId };
    if (targetSemester) {
      quizQuery.semester = targetSemester;
    }
    let quizzes = await Quiz.find(quizQuery);
    if (quizzes.length === 0 && targetSemester) {
      quizzes = await Quiz.find({ course: courseId });
    }
    const quizIds = quizzes.map(q => q._id);

    const results = await QuizResult.find({ quiz: { $in: quizIds } });
    const scores = results.map(r => r.maxScore > 0 ? (r.totalScore / r.maxScore) * 100 : 0);
    const avgScore = scores.length ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : null;

    const quizBreakdown = await Promise.all(quizzes.map(async (quiz) => {
      const qResults = results.filter(r => r.quiz.toString() === quiz._id.toString());
      const qScores = qResults.map(r => r.maxScore > 0 ? (r.totalScore / r.maxScore) * 100 : 0);
      return {
        title: quiz.title,
        quizTitle: quiz.title,
        attempts: qResults.length,
        totalAttempts: qResults.length,
        avgScore: qScores.length ? parseFloat((qScores.reduce((a, b) => a + b, 0) / qScores.length).toFixed(1)) : 0,
        highestScore: qScores.length ? Math.max(...qScores).toFixed(1) : 0,
        lowestScore: qScores.length ? Math.min(...qScores).toFixed(1) : 0
      };
    }));

    // 4. Lectures count
    const lectureQuery = { course: courseId };
    if (targetSemester) {
      lectureQuery.semester = targetSemester;
    }
    let lectureCount = await Lecture.countDocuments(lectureQuery);
    if (lectureCount === 0 && targetSemester) {
      lectureCount = await Lecture.countDocuments({ course: courseId });
    }

    // Assignment stats
    const assignments = await Assignment.find({ course: courseId });
    const assignmentCount = assignments.length;

    res.json({
      success: true,
      totalStudents,
      avgAttendance,
      avgQuizScore: avgScore,
      avgScore: avgScore !== null ? avgScore : 0,
      totalLectures: lectureCount,
      lectureCount,
      totalQuizzes: quizzes.length,
      assignmentCount,
      quizPerformance: quizBreakdown,
      quizBreakdown,
      attendanceTrend
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get department analytics
// @route   GET /api/analytics/department/:id
exports.getDepartmentAnalytics = async (req, res, next) => {
  try {
    const deptId = req.params.id;

    const courses = await Course.find({ department: deptId });
    const courseIds = courses.map(c => c._id);

    const [totalStudents, totalProfessors, lectures, attendanceRecords] = await Promise.all([
      User.countDocuments({ department: deptId, role: 'student' }),
      User.countDocuments({ department: deptId, role: 'professor' }),
      courseIds.length ? require('../models/Lecture').find({ course: { $in: courseIds } }) : [],
      courseIds.length ? require('../models/Attendance').find({ course: { $in: courseIds } }) : []
    ]);

    // Get lectures for this department
    const deptLectures = lectures.filter(l => courseIds.some(id => id.toString() === l.course?.toString()));
    const totalLectures = deptLectures.length;

    // Get attendance for this department's courses
    const deptAttendance = attendanceRecords.filter(a => courseIds.some(id => id.toString() === a.course?.toString()));
    
    // Calculate average attendance percentage
    let avgAttendance = 0;
    if (deptAttendance.length > 0) {
      let totalAttendancePercent = 0;
      let recordCount = 0;
      
      deptAttendance.forEach(record => {
        if (record.students && record.students.length > 0) {
          const presentCount = record.students.filter(s => s.status === 'present' || s.status === 'late').length;
          const percentage = (presentCount / record.students.length) * 100;
          totalAttendancePercent += percentage;
          recordCount++;
        }
      });
      
      avgAttendance = recordCount > 0 ? parseFloat((totalAttendancePercent / recordCount).toFixed(1)) : 0;
    }

    // Quiz results for department courses
    const quizzes = await require('../models/Quiz').find({ course: { $in: courseIds } });
    const quizIds = quizzes.map(q => q._id);
    const results = await require('../models/QuizResult').find({ quiz: { $in: quizIds } });

    const scores = results.map(r => r.maxScore > 0 ? (r.totalScore / r.maxScore) * 100 : 0);
    const avgScore = scores.length ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : 0;
    const passCount = scores.filter(s => s >= 50).length;
    const passPercentage = scores.length ? parseFloat(((passCount / scores.length) * 100).toFixed(1)) : 0;

    // Top students
    const topStudentResults = await require('../models/QuizResult').aggregate([
      { $match: { quiz: { $in: quizIds } } },
      { $group: { _id: '$student', avgPct: { $avg: { $multiply: [{ $divide: ['$totalScore', '$maxScore'] }, 100] } }, quizCount: { $sum: 1 } } },
      { $sort: { avgPct: -1 } },
      { $limit: 10 }
    ]);
    await User.populate(topStudentResults, { path: '_id', select: 'name email' });

    // Course-wise stats
    const courseStats = await Promise.all(courses.map(async (c) => {
      const cQuizzes = quizzes.filter(q => q.course.toString() === c._id.toString());
      const cQuizIds = cQuizzes.map(q => q._id);
      const cResults = results.filter(r => cQuizIds.some(id => id.toString() === r.quiz.toString()));
      const cScores = cResults.map(r => r.maxScore > 0 ? (r.totalScore / r.maxScore) * 100 : 0);

      return {
        courseName: c.name,
        courseCode: c.code,
        totalQuizzes: cQuizzes.length,
        avgScore: cScores.length ? parseFloat((cScores.reduce((a, b) => a + b, 0) / cScores.length).toFixed(1)) : 0,
        totalAttempts: cResults.length
      };
    }));

    res.json({
      totalStudents,
      totalProfessors,
      totalCourses: courses.length,
      totalLectures,
      avgAttendance,
      avgScore,
      passPercentage,
      topStudents: topStudentResults,
      courseStats
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get lecture upload analytics for department
// @route   GET /api/analytics/department/:id/lecture-uploads
exports.getLectureUploadAnalytics = async (req, res, next) => {
  try {
    const deptId = req.params.id;
    
    // Get all professors in department
    const professors = await User.find({ department: deptId, role: 'professor' }).select('name professorId');
    const profIds = professors.map(p => p._id);
    
    // Get all lectures uploaded by these professors
    const lectures = await Lecture.find({ uploadedBy: { $in: profIds } });
    
    // Group by professor
    const professorStats = professors.map(prof => {
      const profLectures = lectures.filter(l => l.uploadedBy.toString() === prof._id.toString());
      
      // Count by month
      const monthlyCount = {};
      profLectures.forEach(l => {
        const monthKey = new Date(l.createdAt).toISOString().slice(0, 7); // YYYY-MM
        monthlyCount[monthKey] = (monthlyCount[monthKey] || 0) + 1;
      });
      
      return {
        professorName: prof.name,
        professorId: prof.professorId,
        totalLectures: profLectures.length,
        lecturesByType: {
          lecture: profLectures.filter(l => l.type === 'lecture').length,
          lab: profLectures.filter(l => l.type === 'lab').length
        },
        monthlyUploads: monthlyCount
      };
    });
    
    // Department-wide stats
    const totalLectures = lectures.length;
    const avgLecturesPerProf = professors.length > 0 ? parseFloat((totalLectures / professors.length).toFixed(1)) : 0;
    
    res.json({
      totalLectures,
      totalProfessors: professors.length,
      avgLecturesPerProf,
      professorStats
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get language usage analytics for department
// @route   GET /api/analytics/department/:id/language-usage
exports.getLanguageUsageAnalytics = async (req, res, next) => {
  try {
    const deptId = req.params.id;
    
    // Get all professors in department
    const professors = await User.find({ department: deptId, role: 'professor' }).select('name professorId');
    const profIds = professors.map(p => p._id);
    
    // Get all lectures uploaded by these professors
    const lectures = await Lecture.find({ uploadedBy: { $in: profIds } });
    
    // Group by professor and calculate language percentages
    const professorLanguageStats = professors.map(prof => {
      const profLectures = lectures.filter(l => l.uploadedBy.toString() === prof._id.toString());
      
      if (profLectures.length === 0) {
        return {
          professorName: prof.name,
          professorId: prof.professorId,
          totalLectures: 0,
          languageDistribution: {
            English: 0,
            Hindi: 0,
            Gujarati: 0,
            Mixed: 0
          }
        };
      }
      
      // Count teaching languages
      const languageCount = {
        English: 0,
        Hindi: 0,
        Gujarati: 0,
        Mixed: 0
      };
      
      profLectures.forEach(l => {
        const lang = l.teachingLanguage || 'English';
        if (languageCount.hasOwnProperty(lang)) {
          languageCount[lang]++;
        }
      });
      
      // Calculate percentages
      const languageDistribution = {};
      Object.keys(languageCount).forEach(lang => {
        languageDistribution[lang] = parseFloat(((languageCount[lang] / profLectures.length) * 100).toFixed(1));
      });
      
      return {
        professorName: prof.name,
        professorId: prof.professorId,
        totalLectures: profLectures.length,
        languageDistribution
      };
    });
    
    // Department-wide language stats
    const totalLanguageCount = {
      English: 0,
      Hindi: 0,
      Gujarati: 0,
      Mixed: 0
    };
    
    lectures.forEach(l => {
      const lang = l.teachingLanguage || 'English';
      if (totalLanguageCount.hasOwnProperty(lang)) {
        totalLanguageCount[lang]++;
      }
    });
    
    const deptLanguageDistribution = {};
    Object.keys(totalLanguageCount).forEach(lang => {
      deptLanguageDistribution[lang] = lectures.length > 0 ? parseFloat(((totalLanguageCount[lang] / lectures.length) * 100).toFixed(1)) : 0;
    });
    
    res.json({
      totalLectures: lectures.length,
      departmentLanguageDistribution: deptLanguageDistribution,
      professorLanguageStats
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Academic Admin overview analytics
// @route   GET /api/analytics/academic-admin/overview
exports.getAcademicAdminOverview = async (req, res, next) => {
  try {
    const user = req.user;
    let targetDeptId = null;

    // RBAC: Department / Institution isolation
    if (user.department) {
      targetDeptId = user.department._id || user.department;
    } else if (['dept_admin', 'academic_admin', 'academic_administrator'].includes(user.role)) {
      if (user.department) {
        targetDeptId = user.department._id || user.department;
      }
    } else if (['inst_admin', 'super_admin', 'university_admin'].includes(user.role)) {
      if (req.query.department && mongoose.Types.ObjectId.isValid(req.query.department)) {
        targetDeptId = new mongoose.Types.ObjectId(req.query.department);
      }
    }

    // Fetch department professors to resolve course assignments
    const deptProfessors = await User.find({
      role: 'professor',
      ...(targetDeptId ? { department: targetDeptId } : {})
    }).select('name email courses');

    // Fetch all courses in department scope
    const allDeptCourses = await Course.find(targetDeptId ? { department: targetDeptId } : {}).populate('professor', 'name email');

    // Authoritative faculty resolution for every course
    allDeptCourses.forEach(c => {
      let prof = (c.professor && c.professor.name)
        ? c.professor
        : deptProfessors.find(p => p.courses && p.courses.some(cId => cId.toString() === c._id.toString()));
      c._resolvedProfessor = prof ? { _id: prof._id, name: prof.name, email: prof.email } : null;
    });

    const filterOptions = {
      courses: allDeptCourses.map(c => ({
        _id: c._id,
        code: c.code,
        name: c.name,
        semester: c.semester,
        professorId: c._resolvedProfessor ? c._resolvedProfessor._id.toString() : null,
        professorName: c._resolvedProfessor ? c._resolvedProfessor.name : 'Unassigned'
      })),
      professors: deptProfessors.map(p => ({
        _id: p._id,
        name: p.name,
        email: p.email,
        courses: (p.courses || []).map(id => id.toString())
      }))
    };

    // Filter courses matching query parameters
    let courses = allDeptCourses;
    if (req.query.semester) {
      const sem = parseInt(req.query.semester, 10);
      courses = courses.filter(c => c.semester === sem);
    }
    if (req.query.course && mongoose.Types.ObjectId.isValid(req.query.course)) {
      courses = courses.filter(c => c._id.toString() === req.query.course.toString());
    }
    if (req.query.professor && mongoose.Types.ObjectId.isValid(req.query.professor)) {
      const pId = req.query.professor.toString();
      courses = courses.filter(c => {
        if (c._resolvedProfessor && c._resolvedProfessor._id.toString() === pId) return true;
        const profDoc = deptProfessors.find(p => p._id.toString() === pId);
        return profDoc && profDoc.courses && profDoc.courses.some(cId => cId.toString() === c._id.toString());
      });
    }

    const courseIds = courses.map(c => c._id);

    if (courseIds.length === 0) {
      return res.json({
        success: true,
        filters: {
          academicTerm: req.query.academicTerm || null,
          semester: req.query.semester ? parseInt(req.query.semester, 10) : null,
          course: req.query.course || null,
          division: req.query.division || null,
          professor: req.query.professor || null
        },
        filterOptions,
        summary: {
          totalStudents: 0,
          totalCourses: 0,
          averagePerformance: 0,
          averageAttendance: 0,
          atRiskStudents: 0
        },
        semesterPerformance: [],
        coursePerformance: [],
        marksDistribution: [
          { label: '0–<40', count: 0 },
          { label: '40–<50', count: 0 },
          { label: '50–<60', count: 0 },
          { label: '60–<70', count: 0 },
          { label: '70–<80', count: 0 },
          { label: '80–<90', count: 0 },
          { label: '90–100', count: 0 }
        ],
        attendanceAnalytics: {
          averageAttendance: 0,
          bySemester: [],
          byCourse: [],
          lowAttendanceStudents: []
        },
        atRiskStudents: []
      });
    }

    // Build enrollment query
    const enrollmentQuery = {
      course: { $in: courseIds },
      status: 'active'
    };
    if (req.query.division) {
      enrollmentQuery.division = req.query.division.trim().toUpperCase();
    }
    if (req.query.academicTerm) {
      enrollmentQuery.academicTerm = req.query.academicTerm;
    }

    const enrollments = await Enrollment.find(enrollmentQuery)
      .populate('student', 'name email enrollmentNumber currentSemester division isActive')
      .populate('course', 'name code semester');

    const validEnrollments = enrollments.filter(e => e.student && e.student.isActive !== false);

    // Group unique students
    const activeStudentsMap = new Map();
    validEnrollments.forEach(e => {
      const sId = e.student._id.toString();
      if (!activeStudentsMap.has(sId)) {
        activeStudentsMap.set(sId, {
          _id: e.student._id,
          name: e.student.name,
          email: e.student.email,
          enrollmentNumber: e.student.enrollmentNumber || 'N/A',
          semester: e.student.currentSemester || e.course?.semester || 1,
          division: e.division || e.student.division || 'A',
          enrollments: [],
          hasBacklog: false
        });
      }
      const stData = activeStudentsMap.get(sId);
      stData.enrollments.push(e);
      if (e.isBacklog) stData.hasBacklog = true;
    });

    // Gradebook Calculations
    const gradebookQuery = { course: { $in: courseIds } };
    if (req.query.academicTerm) {
      gradebookQuery.academicTerm = req.query.academicTerm;
    }
    const Gradebook = require('../models/Gradebook');
    const gradebooks = await Gradebook.find(gradebookQuery);

    const studentCourseGradesMap = new Map(); // `${studentId}_${courseId}` -> weightedPct
    const studentGradesListMap = new Map(); // studentId -> array of weighted Pcts

    gradebooks.forEach(gb => {
      const cId = gb.course.toString();
      if (!gb.components || gb.components.length === 0) return;

      const studentGradesGroup = new Map();
      (gb.grades || []).forEach(g => {
        if (!g.student) return;
        const sId = g.student.toString();
        if (!activeStudentsMap.has(sId)) return;

        if (!studentGradesGroup.has(sId)) {
          studentGradesGroup.set(sId, []);
        }
        studentGradesGroup.get(sId).push(g);
      });

      studentGradesGroup.forEach((entries, sId) => {
        let totalWeighted = 0;
        entries.forEach(entry => {
          const comp = gb.components.find(c => c.name === entry.componentName);
          if (comp && comp.maxMarks > 0) {
            const pct = (entry.marksObtained / comp.maxMarks) * comp.weightage;
            totalWeighted += pct;
          }
        });
        const finalPct = parseFloat(totalWeighted.toFixed(2));
        const key = `${sId}_${cId}`;
        studentCourseGradesMap.set(key, finalPct);

        if (!studentGradesListMap.has(sId)) {
          studentGradesListMap.set(sId, []);
        }
        studentGradesListMap.get(sId).push(finalPct);
      });
    });

    // Attendance Calculations
    const sessionQuery = {
      course: { $in: courseIds },
      status: 'CONDUCTED'
    };
    if (req.query.semester) {
      sessionQuery.semester = parseInt(req.query.semester, 10);
    }
    if (req.query.division) {
      sessionQuery.division = req.query.division.trim().toUpperCase();
    }
    if (req.query.academicTerm) {
      sessionQuery.academicTerm = req.query.academicTerm;
    }

    const sessions = await AttendanceSession.find(sessionQuery);
    const sessionIds = sessions.map(s => s._id);

    const records = sessionIds.length > 0
      ? await AttendanceRecord.find({ session: { $in: sessionIds } })
      : [];

    const studentAttendanceMap = new Map();
    const courseAttendanceMap = new Map();
    const semesterAttendanceMap = new Map();

    sessions.forEach(sess => {
      const sem = sess.semester;
      if (!semesterAttendanceMap.has(sem)) {
        semesterAttendanceMap.set(sem, { total: 0, present: 0, sessionsCount: 0 });
      }
      semesterAttendanceMap.get(sem).sessionsCount += 1;
    });

    records.forEach(rec => {
      const sId = rec.student.toString();
      const cId = rec.course.toString();

      const sess = sessions.find(s => s._id.toString() === rec.session.toString());
      const sem = sess ? sess.semester : null;

      if (activeStudentsMap.has(sId)) {
        if (!studentAttendanceMap.has(sId)) {
          studentAttendanceMap.set(sId, { total: 0, present: 0 });
        }
        const stAtt = studentAttendanceMap.get(sId);
        stAtt.total += 1;
        if (rec.status === 'PRESENT') stAtt.present += 1;
      }

      if (!courseAttendanceMap.has(cId)) {
        courseAttendanceMap.set(cId, { total: 0, present: 0 });
      }
      const cAtt = courseAttendanceMap.get(cId);
      cAtt.total += 1;
      if (rec.status === 'PRESENT') cAtt.present += 1;

      if (sem) {
        if (!semesterAttendanceMap.has(sem)) {
          semesterAttendanceMap.set(sem, { total: 0, present: 0, sessionsCount: 0 });
        }
        const semAtt = semesterAttendanceMap.get(sem);
        semAtt.total += 1;
        if (rec.status === 'PRESENT') semAtt.present += 1;
      }
    });

    // Marks Distribution Buckets (7 non-overlapping buckets)
    const buckets = [
      { label: '0–<40', count: 0, min: 0, max: 40 },
      { label: '40–<50', count: 0, min: 40, max: 50 },
      { label: '50–<60', count: 0, min: 50, max: 60 },
      { label: '60–<70', count: 0, min: 60, max: 70 },
      { label: '70–<80', count: 0, min: 70, max: 80 },
      { label: '80–<90', count: 0, min: 80, max: 90 },
      { label: '90–100', count: 0, min: 90, max: 100.1 }
    ];

    const allStudentAvgPcts = [];
    activeStudentsMap.forEach((st, sId) => {
      const grades = studentGradesListMap.get(sId);
      if (grades && grades.length > 0) {
        const avgPct = parseFloat((grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1));
        allStudentAvgPcts.push(avgPct);

        for (let b of buckets) {
          if (avgPct >= b.min && avgPct < b.max) {
            b.count += 1;
            break;
          }
        }
      }
    });

    const averagePerformance = allStudentAvgPcts.length > 0
      ? parseFloat((allStudentAvgPcts.reduce((a, b) => a + b, 0) / allStudentAvgPcts.length).toFixed(1))
      : 0;

    const studentAttPercentages = [];
    studentAttendanceMap.forEach((attData) => {
      if (attData.total > 0) {
        const pct = parseFloat(((attData.present / attData.total) * 100).toFixed(1));
        studentAttPercentages.push(pct);
      }
    });

    const averageAttendance = studentAttPercentages.length > 0
      ? parseFloat((studentAttPercentages.reduce((a, b) => a + b, 0) / studentAttPercentages.length).toFixed(1))
      : 0;

    // Course Performance
    const coursePerformance = courses.map(c => {
      const cId = c._id.toString();
      const cEnrollments = validEnrollments.filter(e => e.course?._id.toString() === cId || e.course?.toString() === cId);

      const cGrades = [];
      cEnrollments.forEach(e => {
        const sId = e.student._id.toString();
        const key = `${sId}_${cId}`;
        if (studentCourseGradesMap.has(key)) {
          cGrades.push(studentCourseGradesMap.get(key));
        }
      });

      const avgPct = cGrades.length > 0
        ? parseFloat((cGrades.reduce((a, b) => a + b, 0) / cGrades.length).toFixed(1))
        : 0;
      const highestPct = cGrades.length > 0 ? Math.max(...cGrades) : 0;
      const lowestPct = cGrades.length > 0 ? Math.min(...cGrades) : 0;
      const passCount = cGrades.filter(g => g >= 50).length;
      const failCount = cGrades.filter(g => g < 50).length;
      const passPct = cGrades.length > 0 ? parseFloat(((passCount / cGrades.length) * 100).toFixed(1)) : 0;

      return {
        courseId: c._id,
        courseName: c.name,
        courseCode: c.code,
        semester: c.semester,
        professor: c._resolvedProfessor ? c._resolvedProfessor.name : 'Unassigned',
        professorId: c._resolvedProfessor ? c._resolvedProfessor._id : null,
        enrolledCount: cEnrollments.length,
        averagePercentage: avgPct,
        highestPercentage: highestPct,
        lowestPercentage: lowestPct,
        passCount,
        failCount,
        passPercentage: passPct
      };
    });

    // Semester Performance (Semesters 1-8)
    const semesterMap = new Map();
    courses.forEach(c => {
      const sem = c.semester || 1;
      if (!semesterMap.has(sem)) {
        semesterMap.set(sem, { courses: [], studentIds: new Set() });
      }
      semesterMap.get(sem).courses.push(c);
    });

    validEnrollments.forEach(e => {
      const sem = e.course?.semester || e.student.currentSemester || 1;
      if (!semesterMap.has(sem)) {
        semesterMap.set(sem, { courses: [], studentIds: new Set() });
      }
      semesterMap.get(sem).studentIds.add(e.student._id.toString());
    });

    const semesterPerformance = [];
    const sortedSemesters = Array.from(semesterMap.keys()).sort((a, b) => a - b);

    sortedSemesters.forEach(sem => {
      const semData = semesterMap.get(sem);
      const semCourseIds = semData.courses.map(c => c._id.toString());
      const semGrades = [];

      semData.studentIds.forEach(sId => {
        semCourseIds.forEach(cId => {
          const key = `${sId}_${cId}`;
          if (studentCourseGradesMap.has(key)) {
            semGrades.push(studentCourseGradesMap.get(key));
          }
        });
      });

      const avgPct = semGrades.length > 0
        ? parseFloat((semGrades.reduce((a, b) => a + b, 0) / semGrades.length).toFixed(1))
        : 0;
      const passCount = semGrades.filter(g => g >= 50).length;
      const failCount = semGrades.filter(g => g < 50).length;
      const passPct = semGrades.length > 0 ? parseFloat(((passCount / semGrades.length) * 100).toFixed(1)) : 0;

      semesterPerformance.push({
        semester: sem,
        studentCount: semData.studentIds.size,
        courseCount: semData.courses.length,
        averagePercentage: avgPct,
        passCount,
        failCount,
        passPercentage: passPct
      });
    });

    // Low Attendance & At-Risk Students
    const lowAttendanceStudents = [];
    const atRiskStudents = [];

    activeStudentsMap.forEach((st, sId) => {
      const attData = studentAttendanceMap.get(sId);
      const attPct = (attData && attData.total > 0)
        ? parseFloat(((attData.present / attData.total) * 100).toFixed(1))
        : null;

      const grades = studentGradesListMap.get(sId);
      const acadPct = (grades && grades.length > 0)
        ? parseFloat((grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1))
        : null;

      const riskFactors = [];

      if (attPct !== null && attPct < 75) {
        riskFactors.push('Low Attendance (<75%)');
        lowAttendanceStudents.push({
          studentId: st._id,
          name: st.name,
          enrollmentNumber: st.enrollmentNumber,
          semester: st.semester,
          division: st.division,
          totalClasses: attData.total,
          presentClasses: attData.present,
          attendancePercentage: attPct
        });
      }

      if (acadPct !== null && acadPct < 50) {
        riskFactors.push('Low Academic Marks (<50%)');
      }

      if (st.hasBacklog) {
        riskFactors.push('Active Backlog');
      }

      if (riskFactors.length > 0) {
        atRiskStudents.push({
          studentId: st._id,
          name: st.name,
          enrollmentNumber: st.enrollmentNumber,
          semester: st.semester,
          division: st.division,
          academicPercentage: acadPct,
          attendancePercentage: attPct,
          isBacklog: st.hasBacklog,
          riskFactors
        });
      }
    });

    const attendanceByCourse = courses.map(c => {
      const cId = c._id.toString();
      const cAtt = courseAttendanceMap.get(cId);
      const cSessions = sessions.filter(s => s.course.toString() === cId);
      const avgAtt = (cAtt && cAtt.total > 0)
        ? parseFloat(((cAtt.present / cAtt.total) * 100).toFixed(1))
        : 0;

      return {
        courseId: c._id,
        courseName: c.name,
        courseCode: c.code,
        averageAttendance: avgAtt,
        totalSessions: cSessions.length
      };
    });

    const attendanceBySemester = sortedSemesters.map(sem => {
      const semAtt = semesterAttendanceMap.get(sem);
      const avgAtt = (semAtt && semAtt.total > 0)
        ? parseFloat(((semAtt.present / semAtt.total) * 100).toFixed(1))
        : 0;

      return {
        semester: sem,
        averageAttendance: avgAtt,
        totalSessions: semAtt ? semAtt.sessionsCount : 0
      };
    });

    res.json({
      success: true,
      filters: {
        academicTerm: req.query.academicTerm || null,
        semester: req.query.semester ? parseInt(req.query.semester, 10) : null,
        course: req.query.course || null,
        division: req.query.division || null,
        professor: req.query.professor || null
      },
      filterOptions,
      summary: {
        totalStudents: activeStudentsMap.size,
        totalCourses: courses.length,
        averagePerformance,
        averageAttendance,
        atRiskStudents: atRiskStudents.length
      },
      semesterPerformance,
      coursePerformance,
      marksDistribution: buckets.map(b => ({ label: b.label, count: b.count })),
      attendanceAnalytics: {
        averageAttendance,
        bySemester: attendanceBySemester,
        byCourse: attendanceByCourse,
        lowAttendanceStudents
      },
      atRiskStudents
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get University Admin Overview Analytics
// @route   GET /api/analytics/university-admin/overview
exports.getUniversityAdminOverview = async (req, res, next) => {
  try {
    const user = req.user;
    let universityId = null;

    if (user.role === 'university_admin') {
      universityId = user.university?._id || user.university;
      if (!universityId) {
        const University = require('../models/University');
        const uni = await University.findOne({ admin: user._id });
        if (uni) universityId = uni._id;
      }
      if (!universityId) {
        return res.status(403).json({ success: false, message: 'Access denied: No university associated with this University Admin.' });
      }
    } else if (user.role === 'super_admin') {
      if (req.query.university && mongoose.Types.ObjectId.isValid(req.query.university)) {
        universityId = new mongoose.Types.ObjectId(req.query.university);
      } else {
        const University = require('../models/University');
        const firstUni = await University.findOne({ status: 'active' }).sort({ name: 1 });
        if (firstUni) universityId = firstUni._id;
      }
    } else {
      return res.status(403).json({ success: false, message: 'Access denied: University Admin role required.' });
    }

    const Institution = require('../models/Institution');
    const Department = require('../models/Department');
    const Course = require('../models/Course');

    // 1. Resolve authorized Scope
    const authInstitutions = await Institution.find({ university: universityId }).sort({ name: 1 });
    const authInstIds = authInstitutions.map(i => i._id);

    const authDepartments = authInstIds.length
      ? await Department.find({ institution: { $in: authInstIds } }).sort({ name: 1 })
      : [];
    const authDeptIds = authDepartments.map(d => d._id);

    const authCourses = authDeptIds.length
      ? await Course.find({ department: { $in: authDeptIds } }).populate('professor', 'name email').sort({ name: 1 })
      : [];
    const authCourseIds = authCourses.map(c => c._id);

    const authProfessors = await User.find({
      role: 'professor',
      $or: [
        { university: universityId },
        ...(authInstIds.length ? [{ institution: { $in: authInstIds } }] : []),
        ...(authDeptIds.length ? [{ department: { $in: authDeptIds } }] : [])
      ]
    }).select('name email professorId department institution university courses isActive');

    const authStudents = await User.find({
      role: 'student',
      $or: [
        { university: universityId },
        ...(authInstIds.length ? [{ institution: { $in: authInstIds } }] : []),
        ...(authDeptIds.length ? [{ department: { $in: authDeptIds } }] : [])
      ]
    }).select('name email enrollmentNumber currentSemester division department institution university isActive');

    // 2. Validate and Apply Optional Query Filters
    const {
      institution: filterInst,
      department: filterDept,
      semester: filterSemStr,
      academicTerm: filterTerm,
      professor: filterProf,
      course: filterCourse,
      division: filterDivStr
    } = req.query;

    // FIX 1: Reject Malformed ObjectId Filters with HTTP 400
    if (filterInst !== undefined && filterInst !== null && filterInst !== '' && !mongoose.Types.ObjectId.isValid(filterInst)) {
      return res.status(400).json({ success: false, message: 'Invalid institution filter.' });
    }
    if (filterDept !== undefined && filterDept !== null && filterDept !== '' && !mongoose.Types.ObjectId.isValid(filterDept)) {
      return res.status(400).json({ success: false, message: 'Invalid department filter.' });
    }
    if (filterCourse !== undefined && filterCourse !== null && filterCourse !== '' && !mongoose.Types.ObjectId.isValid(filterCourse)) {
      return res.status(400).json({ success: false, message: 'Invalid course filter.' });
    }
    if (filterProf !== undefined && filterProf !== null && filterProf !== '' && !mongoose.Types.ObjectId.isValid(filterProf)) {
      return res.status(400).json({ success: false, message: 'Invalid professor filter.' });
    }

    // FIX 2: Validate Semester (must be integer between 1 and 8)
    let filterSemester = null;
    if (filterSemStr !== undefined && filterSemStr !== null && filterSemStr !== '') {
      const num = Number(filterSemStr);
      if (!Number.isInteger(num) || num < 1 || num > 8) {
        return res.status(400).json({ success: false, message: 'Semester must be between 1 and 8.' });
      }
      filterSemester = num;
    }

    const filterDivision = filterDivStr ? filterDivStr.trim().toUpperCase() : null;

    // Filter institutions in scope
    let filteredInsts = authInstitutions;
    if (filterInst) {
      filteredInsts = filteredInsts.filter(i => i._id.toString() === filterInst.toString());
    }
    const scopedInstIdsStr = new Set(filteredInsts.map(i => i._id.toString()));

    // Filter departments in scope
    let filteredDepts = authDepartments.filter(d => scopedInstIdsStr.has(d.institution.toString()));
    if (filterDept) {
      filteredDepts = filteredDepts.filter(d => d._id.toString() === filterDept.toString());
    }
    const scopedDeptIdsStr = new Set(filteredDepts.map(d => d._id.toString()));

    // Filter courses in scope
    let filteredCourses = authCourses.filter(c => scopedDeptIdsStr.has(c.department.toString()));
    if (filterSemester) {
      filteredCourses = filteredCourses.filter(c => c.semester === filterSemester);
    }
    if (filterCourse) {
      filteredCourses = filteredCourses.filter(c => c._id.toString() === filterCourse.toString());
    }

    // Resolve Faculty for Courses (Course.professor primary, User.courses fallback)
    filteredCourses.forEach(c => {
      let prof = (c.professor && c.professor.name)
        ? c.professor
        : authProfessors.find(p => p.courses && p.courses.some(cId => cId.toString() === c._id.toString()));
      c._resolvedProfessor = prof ? { _id: prof._id, name: prof.name, email: prof.email } : null;
    });

    if (filterProf) {
      const targetProfIdStr = filterProf.toString();
      filteredCourses = filteredCourses.filter(c => {
        if (c._resolvedProfessor && c._resolvedProfessor._id.toString() === targetProfIdStr) return true;
        const pDoc = authProfessors.find(p => p._id.toString() === targetProfIdStr);
        return pDoc && pDoc.courses && pDoc.courses.some(cId => cId.toString() === c._id.toString());
      });
    }

    const filteredCourseIds = filteredCourses.map(c => c._id);

    // Scoped Students
    let filteredStudents = authStudents.filter(s => {
      const instId = s.institution?._id || s.institution;
      const deptId = s.department?._id || s.department;
      if (instId && !scopedInstIdsStr.has(instId.toString())) return false;
      if (deptId && !scopedDeptIdsStr.has(deptId.toString())) return false;
      if (filterSemester && s.currentSemester !== filterSemester) return false;
      if (filterDivision && (s.division || 'A').toUpperCase() !== filterDivision) return false;
      return true;
    });

    // Scoped Professors
    let filteredProfessors = authProfessors.filter(p => {
      const instId = p.institution?._id || p.institution;
      const deptId = p.department?._id || p.department;
      if (instId && !scopedInstIdsStr.has(instId.toString())) return false;
      if (deptId && !scopedDeptIdsStr.has(deptId.toString())) return false;
      if (filterProf && mongoose.Types.ObjectId.isValid(filterProf) && p._id.toString() !== filterProf.toString()) return false;
      return true;
    });

    // Filter Options for Frontend
    const filterOptions = {
      institutions: authInstitutions.map(i => ({ _id: i._id, name: i.name, code: i.code })),
      departments: authDepartments.map(d => ({ _id: d._id, name: d.name, code: d.code, institutionId: d.institution })),
      professors: authProfessors.map(p => ({ _id: p._id, name: p.name, email: p.email, departmentId: p.department })),
      courses: authCourses.map(c => ({ _id: c._id, name: c.name, code: c.code, departmentId: c.department, semester: c.semester }))
    };

    // 3. Fetch Active Enrollments for filtered courses
    const enrollmentQuery = {
      course: { $in: filteredCourseIds },
      status: 'active'
    };
    if (filterDivision) enrollmentQuery.division = filterDivision;
    if (filterTerm) enrollmentQuery.academicTerm = filterTerm;

    const enrollments = filteredCourseIds.length > 0
      ? await Enrollment.find(enrollmentQuery)
          .populate('student', 'name email enrollmentNumber currentSemester division isActive institution department')
          .populate('course', 'name code semester department')
      : [];

    const validEnrollments = enrollments.filter(e => e.student && e.student.isActive !== false);

    // Group unique students who have active enrollments in filtered courses
    const activeEnrolledStudentsMap = new Map();
    validEnrollments.forEach(e => {
      const sId = e.student._id.toString();
      if (!activeEnrolledStudentsMap.has(sId)) {
        activeEnrolledStudentsMap.set(sId, {
          _id: e.student._id,
          name: e.student.name,
          email: e.student.email,
          enrollmentNumber: e.student.enrollmentNumber || 'N/A',
          semester: e.student.currentSemester || e.course?.semester || 1,
          division: e.division || e.student.division || 'A',
          institution: e.student.institution,
          department: e.student.department || e.course?.department,
          hasBacklog: false,
          enrollments: []
        });
      }
      const stData = activeEnrolledStudentsMap.get(sId);
      stData.enrollments.push(e);
      if (e.isBacklog) stData.hasBacklog = true;
    });

    const targetStudentMap = activeEnrolledStudentsMap.size > 0
      ? activeEnrolledStudentsMap
      : new Map(filteredStudents.map(s => [s._id.toString(), {
          _id: s._id,
          name: s.name,
          email: s.email,
          enrollmentNumber: s.enrollmentNumber || 'N/A',
          semester: s.currentSemester || 1,
          division: s.division || 'A',
          institution: s.institution,
          department: s.department,
          hasBacklog: false,
          enrollments: []
        }]));

    // 4. Gradebook Calculations
    const gradebookQuery = { course: { $in: filteredCourseIds } };
    if (filterTerm) gradebookQuery.academicTerm = filterTerm;

    const Gradebook = require('../models/Gradebook');
    const gradebooks = filteredCourseIds.length > 0 ? await Gradebook.find(gradebookQuery) : [];

    const studentCourseGradesMap = new Map();
    const studentGradesListMap = new Map();

    gradebooks.forEach(gb => {
      const cId = gb.course.toString();
      if (!gb.components || gb.components.length === 0) return;

      const studentGradesGroup = new Map();
      (gb.grades || []).forEach(g => {
        if (!g.student) return;
        const sId = g.student.toString();
        if (!targetStudentMap.has(sId)) return;

        if (!studentGradesGroup.has(sId)) {
          studentGradesGroup.set(sId, []);
        }
        studentGradesGroup.get(sId).push(g);
      });

      studentGradesGroup.forEach((entries, sId) => {
        let totalWeighted = 0;
        entries.forEach(entry => {
          const comp = gb.components.find(c => c.name === entry.componentName);
          if (comp && comp.maxMarks > 0) {
            const pct = (entry.marksObtained / comp.maxMarks) * comp.weightage;
            totalWeighted += pct;
          }
        });
        const finalPct = parseFloat(totalWeighted.toFixed(2));
        studentCourseGradesMap.set(`${sId}_${cId}`, finalPct);

        if (!studentGradesListMap.has(sId)) {
          studentGradesListMap.set(sId, []);
        }
        studentGradesListMap.get(sId).push(finalPct);
      });
    });

    // 5. Attendance Calculations
    const sessionQuery = {
      course: { $in: filteredCourseIds },
      status: 'CONDUCTED'
    };
    if (filterSemester) sessionQuery.semester = filterSemester;
    if (filterDivision) sessionQuery.division = filterDivision;
    if (filterTerm) sessionQuery.academicTerm = filterTerm;

    const sessions = filteredCourseIds.length > 0 ? await AttendanceSession.find(sessionQuery) : [];
    const sessionIds = sessions.map(s => s._id);

    const records = sessionIds.length > 0 ? await AttendanceRecord.find({ session: { $in: sessionIds } }) : [];

    const studentAttendanceMap = new Map();
    const courseAttendanceMap = new Map();
    const deptAttendanceMap = new Map();
    const instAttendanceMap = new Map();
    const semAttendanceMap = new Map();

    sessions.forEach(sess => {
      const sem = sess.semester;
      if (!semAttendanceMap.has(sem)) {
        semAttendanceMap.set(sem, { total: 0, present: 0, sessionsCount: 0 });
      }
      semAttendanceMap.get(sem).sessionsCount += 1;
    });

    records.forEach(rec => {
      const sId = rec.student.toString();
      const cId = rec.course.toString();
      const sess = sessions.find(s => s._id.toString() === rec.session.toString());
      if (!sess) return;

      const instId = sess.institution ? sess.institution.toString() : null;
      const deptId = sess.department ? sess.department.toString() : null;
      const sem = sess.semester;

      if (targetStudentMap.has(sId)) {
        if (!studentAttendanceMap.has(sId)) {
          studentAttendanceMap.set(sId, { total: 0, present: 0 });
        }
        const stAtt = studentAttendanceMap.get(sId);
        stAtt.total += 1;
        if (rec.status === 'PRESENT') stAtt.present += 1;
      }

      if (!courseAttendanceMap.has(cId)) {
        courseAttendanceMap.set(cId, { total: 0, present: 0 });
      }
      const cAtt = courseAttendanceMap.get(cId);
      cAtt.total += 1;
      if (rec.status === 'PRESENT') cAtt.present += 1;

      if (deptId) {
        if (!deptAttendanceMap.has(deptId)) {
          deptAttendanceMap.set(deptId, { total: 0, present: 0 });
        }
        const dAtt = deptAttendanceMap.get(deptId);
        dAtt.total += 1;
        if (rec.status === 'PRESENT') dAtt.present += 1;
      }

      if (instId) {
        if (!instAttendanceMap.has(instId)) {
          instAttendanceMap.set(instId, { total: 0, present: 0 });
        }
        const iAtt = instAttendanceMap.get(instId);
        iAtt.total += 1;
        if (rec.status === 'PRESENT') iAtt.present += 1;
      }

      if (sem) {
        if (!semAttendanceMap.has(sem)) {
          semAttendanceMap.set(sem, { total: 0, present: 0, sessionsCount: 0 });
        }
        const sAtt = semAttendanceMap.get(sem);
        sAtt.total += 1;
        if (rec.status === 'PRESENT') sAtt.present += 1;
      }
    });

    // 6. Overall Metrics Computation
    const allStudentAvgPcts = [];
    const allCoursePctsList = [];

    studentCourseGradesMap.forEach((pct) => {
      allCoursePctsList.push(pct);
    });

    targetStudentMap.forEach((st, sId) => {
      const grades = studentGradesListMap.get(sId);
      if (grades && grades.length > 0) {
        const avgPct = parseFloat((grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1));
        allStudentAvgPcts.push(avgPct);
      }
    });

    const averagePerformance = allStudentAvgPcts.length > 0
      ? parseFloat((allStudentAvgPcts.reduce((a, b) => a + b, 0) / allStudentAvgPcts.length).toFixed(1))
      : 0;

    const passCountGlobal = allCoursePctsList.filter(g => g >= 50).length;
    const passRate = allCoursePctsList.length > 0
      ? parseFloat(((passCountGlobal / allCoursePctsList.length) * 100).toFixed(1))
      : 0;

    const studentAttPcts = [];
    studentAttendanceMap.forEach((attData) => {
      if (attData.total > 0) {
        studentAttPcts.push(parseFloat(((attData.present / attData.total) * 100).toFixed(1)));
      }
    });

    const averageAttendance = studentAttPcts.length > 0
      ? parseFloat((studentAttPcts.reduce((a, b) => a + b, 0) / studentAttPcts.length).toFixed(1))
      : 0;

    // 7. At-Risk Students & Categories
    let lowAcademicCount = 0;
    let lowAttendanceCount = 0;
    let activeBacklogCount = 0;
    let multipleRiskCount = 0;
    let totalAtRiskStudents = 0;

    targetStudentMap.forEach((st, sId) => {
      const attData = studentAttendanceMap.get(sId);
      const attPct = (attData && attData.total > 0)
        ? parseFloat(((attData.present / attData.total) * 100).toFixed(1))
        : null;

      const grades = studentGradesListMap.get(sId);
      const acadPct = (grades && grades.length > 0)
        ? parseFloat((grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1))
        : null;

      let riskCount = 0;
      if (attPct !== null && attPct < 75) {
        lowAttendanceCount++;
        riskCount++;
      }
      if (acadPct !== null && acadPct < 50) {
        lowAcademicCount++;
        riskCount++;
      }
      if (st.hasBacklog) {
        activeBacklogCount++;
        riskCount++;
      }
      if (riskCount >= 2) {
        multipleRiskCount++;
      }
      if (riskCount > 0) {
        totalAtRiskStudents++;
      }
    });

    // 8. Faculty Workload & Allocation Metrics
    const profAssignedCoursesMap = new Map();
    const profStudentsTaughtMap = new Map();

    filteredCourses.forEach(c => {
      if (c._resolvedProfessor && c._resolvedProfessor._id) {
        const pId = c._resolvedProfessor._id.toString();
        if (!profAssignedCoursesMap.has(pId)) {
          profAssignedCoursesMap.set(pId, []);
        }
        profAssignedCoursesMap.get(pId).push(c._id.toString());
      }
    });

    validEnrollments.forEach(e => {
      const cId = e.course?._id.toString();
      const sId = e.student._id.toString();
      const courseObj = filteredCourses.find(c => c._id.toString() === cId);
      if (courseObj && courseObj._resolvedProfessor && courseObj._resolvedProfessor._id) {
        const pId = courseObj._resolvedProfessor._id.toString();
        if (!profStudentsTaughtMap.has(pId)) {
          profStudentsTaughtMap.set(pId, new Set());
        }
        profStudentsTaughtMap.get(pId).add(sId);
      }
    });

    const assignedCoursesCount = filteredCourses.filter(c => c._resolvedProfessor !== null).length;
    const unassignedCoursesCount = filteredCourses.length - assignedCoursesCount;

    const courseAllocationList = filteredProfessors.map(p => {
      const pId = p._id.toString();
      const coursesAssigned = profAssignedCoursesMap.get(pId) || [];
      const studentsTaughtSet = profStudentsTaughtMap.get(pId) || new Set();
      return {
        professorId: p._id,
        name: p.name,
        email: p.email,
        coursesCount: coursesAssigned.length,
        studentsTaught: studentsTaughtSet.size
      };
    });

    const facultyWithoutCoursesList = filteredProfessors
      .filter(p => {
        const pId = p._id.toString();
        const coursesAssigned = profAssignedCoursesMap.get(pId) || [];
        return coursesAssigned.length === 0;
      })
      .map(p => {
        const deptObj = authDepartments.find(d => d._id.toString() === (p.department?._id || p.department)?.toString());
        return {
          professorId: p._id,
          name: p.name,
          email: p.email,
          departmentName: deptObj ? deptObj.name : 'N/A'
        };
      });

    const unassignedCoursesList = filteredCourses
      .filter(c => c._resolvedProfessor === null)
      .map(c => {
        const deptObj = authDepartments.find(d => d._id.toString() === c.department.toString());
        return {
          courseId: c._id,
          name: c.name,
          code: c.code,
          departmentId: c.department,
          departmentName: deptObj ? deptObj.name : 'N/A',
          semester: c.semester
        };
      });

    const facultyCoverageByDept = filteredDepts.map(d => {
      const dId = d._id.toString();
      const deptCourses = filteredCourses.filter(c => c.department.toString() === dId);
      const assigned = deptCourses.filter(c => c._resolvedProfessor !== null).length;
      const coveragePercentage = deptCourses.length > 0 ? parseFloat(((assigned / deptCourses.length) * 100).toFixed(1)) : 100;
      return {
        departmentId: d._id,
        name: d.name,
        totalCourses: deptCourses.length,
        assignedCourses: assigned,
        coveragePercentage
      };
    });

    // 9. Course Performance List
    const coursePerformanceList = filteredCourses.map(c => {
      const cId = c._id.toString();
      const cEnrollments = validEnrollments.filter(e => e.course?._id.toString() === cId);
      const instObj = authInstitutions.find(i => {
        const deptObj = authDepartments.find(d => d._id.toString() === c.department.toString());
        return deptObj && i._id.toString() === deptObj.institution.toString();
      });
      const deptObj = authDepartments.find(d => d._id.toString() === c.department.toString());

      const cGrades = [];
      cEnrollments.forEach(e => {
        const sId = e.student._id.toString();
        const key = `${sId}_${cId}`;
        if (studentCourseGradesMap.has(key)) {
          cGrades.push(studentCourseGradesMap.get(key));
        }
      });

      const avgPct = cGrades.length > 0 ? parseFloat((cGrades.reduce((a, b) => a + b, 0) / cGrades.length).toFixed(1)) : 0;
      const highestPct = cGrades.length > 0 ? Math.max(...cGrades) : 0;
      const lowestPct = cGrades.length > 0 ? Math.min(...cGrades) : 0;
      const passC = cGrades.filter(g => g >= 50).length;
      const failC = cGrades.filter(g => g < 50).length;
      const passPct = cGrades.length > 0 ? parseFloat(((passC / cGrades.length) * 100).toFixed(1)) : 0;

      return {
        courseId: c._id,
        courseName: c.name,
        courseCode: c.code,
        institutionId: instObj ? instObj._id : null,
        institutionName: instObj ? instObj.name : 'N/A',
        departmentId: deptObj ? deptObj._id : null,
        departmentName: deptObj ? deptObj.name : 'N/A',
        semester: c.semester,
        professor: c._resolvedProfessor ? c._resolvedProfessor.name : 'Unassigned',
        enrolledCount: cEnrollments.length,
        averagePercentage: avgPct,
        highestPercentage: highestPct,
        lowestPercentage: lowestPct,
        passCount: passC,
        failCount: failC,
        passPercentage: passPct
      };
    });

    // 10. Institution Performance
    const institutionPerformanceList = filteredInsts.map(inst => {
      const iId = inst._id.toString();
      const iDepts = authDepartments.filter(d => d.institution.toString() === iId);
      const iDeptIdsStr = new Set(iDepts.map(d => d._id.toString()));
      const iCourses = filteredCourses.filter(c => iDeptIdsStr.has(c.department.toString()));

      const iStudents = Array.from(targetStudentMap.values()).filter(s => {
        const instId = s.institution?._id || s.institution;
        return instId && instId.toString() === iId;
      });

      const iProfs = filteredProfessors.filter(p => {
        const instId = p.institution?._id || p.institution;
        return instId && instId.toString() === iId;
      });

      const iGrades = [];
      iStudents.forEach(s => {
        const grades = studentGradesListMap.get(s._id.toString());
        if (grades) iGrades.push(...grades);
      });

      const avgPct = iGrades.length > 0 ? parseFloat((iGrades.reduce((a, b) => a + b, 0) / iGrades.length).toFixed(1)) : 0;
      const passC = iGrades.filter(g => g >= 50).length;
      const passPct = iGrades.length > 0 ? parseFloat(((passC / iGrades.length) * 100).toFixed(1)) : 0;

      const iAtt = instAttendanceMap.get(iId);
      const avgAtt = (iAtt && iAtt.total > 0) ? parseFloat(((iAtt.present / iAtt.total) * 100).toFixed(1)) : 0;

      let atRiskC = 0;
      let backlogsC = 0;

      iStudents.forEach(s => {
        const sId = s._id.toString();
        const attData = studentAttendanceMap.get(sId);
        const attPct = (attData && attData.total > 0) ? (attData.present / attData.total) * 100 : null;
        const grades = studentGradesListMap.get(sId);
        const acadPct = (grades && grades.length > 0) ? (grades.reduce((a, b) => a + b, 0) / grades.length) : null;

        if (s.hasBacklog) backlogsC++;
        if ((attPct !== null && attPct < 75) || (acadPct !== null && acadPct < 50) || s.hasBacklog) {
          atRiskC++;
        }
      });

      return {
        institutionId: inst._id,
        institutionName: inst.name,
        code: inst.code,
        studentCount: iStudents.length,
        facultyCount: iProfs.length,
        courseCount: iCourses.length,
        departmentCount: iDepts.length,
        averagePerformance: avgPct,
        averageAttendance: avgAtt,
        passRate: passPct,
        atRiskStudents: atRiskC,
        activeBacklogs: backlogsC
      };
    });

    // 11. Department Performance
    const departmentPerformanceList = filteredDepts.map(dept => {
      const dId = dept._id.toString();
      const instObj = authInstitutions.find(i => i._id.toString() === dept.institution.toString());
      const dCourses = filteredCourses.filter(c => c.department.toString() === dId);
      const dStudents = Array.from(targetStudentMap.values()).filter(s => {
        const deptId = s.department?._id || s.department;
        return deptId && deptId.toString() === dId;
      });

      const dProfs = filteredProfessors.filter(p => {
        const deptId = p.department?._id || p.department;
        return deptId && deptId.toString() === dId;
      });

      const dGrades = [];
      dStudents.forEach(s => {
        const grades = studentGradesListMap.get(s._id.toString());
        if (grades) dGrades.push(...grades);
      });

      const avgPct = dGrades.length > 0 ? parseFloat((dGrades.reduce((a, b) => a + b, 0) / dGrades.length).toFixed(1)) : 0;
      const passC = dGrades.filter(g => g >= 50).length;
      const passPct = dGrades.length > 0 ? parseFloat(((passC / dGrades.length) * 100).toFixed(1)) : 0;

      const dAtt = deptAttendanceMap.get(dId);
      const avgAtt = (dAtt && dAtt.total > 0) ? parseFloat(((dAtt.present / dAtt.total) * 100).toFixed(1)) : 0;

      let atRiskC = 0;
      let backlogsC = 0;

      dStudents.forEach(s => {
        const sId = s._id.toString();
        const attData = studentAttendanceMap.get(sId);
        const attPct = (attData && attData.total > 0) ? (attData.present / attData.total) * 100 : null;
        const grades = studentGradesListMap.get(sId);
        const acadPct = (grades && grades.length > 0) ? (grades.reduce((a, b) => a + b, 0) / grades.length) : null;

        if (s.hasBacklog) backlogsC++;
        if ((attPct !== null && attPct < 75) || (acadPct !== null && acadPct < 50) || s.hasBacklog) {
          atRiskC++;
        }
      });

      const assignedCount = dCourses.filter(c => c._resolvedProfessor !== null).length;
      const coveragePercentage = dCourses.length > 0 ? parseFloat(((assignedCount / dCourses.length) * 100).toFixed(1)) : 100;

      return {
        departmentId: dept._id,
        departmentName: dept.name,
        code: dept.code,
        institutionId: instObj ? instObj._id : null,
        institutionName: instObj ? instObj.name : 'N/A',
        studentCount: dStudents.length,
        facultyCount: dProfs.length,
        courseCount: dCourses.length,
        averagePerformance: avgPct,
        averageAttendance: avgAtt,
        passRate: passPct,
        atRiskStudents: atRiskC,
        activeBacklogs: backlogsC,
        facultyCoverage: coveragePercentage
      };
    });

    // 12. Semester Performance
    const semMap = new Map();
    filteredCourses.forEach(c => {
      const sem = c.semester || 1;
      if (!semMap.has(sem)) semMap.set(sem, { courses: [], studentIds: new Set() });
      semMap.get(sem).courses.push(c);
    });

    validEnrollments.forEach(e => {
      const sem = e.course?.semester || e.student?.currentSemester || 1;
      if (!semMap.has(sem)) semMap.set(sem, { courses: [], studentIds: new Set() });
      semMap.get(sem).studentIds.add(e.student._id.toString());
    });

    const sortedSemesters = Array.from(semMap.keys()).sort((a, b) => a - b);
    const semesterPerformanceList = sortedSemesters.map(sem => {
      const sData = semMap.get(sem);
      const sCourseIds = sData.courses.map(c => c._id.toString());
      const sGrades = [];

      sData.studentIds.forEach(sId => {
        sCourseIds.forEach(cId => {
          const key = `${sId}_${cId}`;
          if (studentCourseGradesMap.has(key)) sGrades.push(studentCourseGradesMap.get(key));
        });
      });

      const avgPct = sGrades.length > 0 ? parseFloat((sGrades.reduce((a, b) => a + b, 0) / sGrades.length).toFixed(1)) : 0;
      const passC = sGrades.filter(g => g >= 50).length;
      const failC = sGrades.filter(g => g < 50).length;
      const passPct = sGrades.length > 0 ? parseFloat(((passC / sGrades.length) * 100).toFixed(1)) : 0;

      const sAtt = semAttendanceMap.get(sem);
      const avgAtt = (sAtt && sAtt.total > 0) ? parseFloat(((sAtt.present / sAtt.total) * 100).toFixed(1)) : 0;

      let atRiskC = 0;
      sData.studentIds.forEach(sId => {
        const attData = studentAttendanceMap.get(sId);
        const attPct = (attData && attData.total > 0) ? (attData.present / attData.total) * 100 : null;
        const grades = studentGradesListMap.get(sId);
        const acadPct = (grades && grades.length > 0) ? (grades.reduce((a, b) => a + b, 0) / grades.length) : null;
        const stObj = targetStudentMap.get(sId);

        if ((attPct !== null && attPct < 75) || (acadPct !== null && acadPct < 50) || (stObj && stObj.hasBacklog)) {
          atRiskC++;
        }
      });

      return {
        semester: sem,
        studentCount: sData.studentIds.size,
        courseCount: sData.courses.length,
        averagePerformance: avgPct,
        averageAttendance: avgAtt,
        passCount: passC,
        failCount: failC,
        passRate: passPct,
        atRiskStudents: atRiskC
      };
    });

    // 13. Student Insights Data Breakdowns
    const studentsByInstMap = new Map();
    const studentsByDeptMap = new Map();
    const studentsBySemMap = new Map();
    const studentsByDivMap = new Map();

    targetStudentMap.forEach(st => {
      const instObj = authInstitutions.find(i => i._id.toString() === (st.institution?._id || st.institution)?.toString());
      const deptObj = authDepartments.find(d => d._id.toString() === (st.department?._id || st.department)?.toString());

      const instName = instObj ? instObj.name : 'Other / Unassigned';
      const deptName = deptObj ? deptObj.name : 'Other / Unassigned';
      const sem = st.semester || 1;
      const div = st.division || 'A';

      studentsByInstMap.set(instName, (studentsByInstMap.get(instName) || 0) + 1);
      studentsByDeptMap.set(deptName, (studentsByDeptMap.get(deptName) || 0) + 1);
      studentsBySemMap.set(sem, (studentsBySemMap.get(sem) || 0) + 1);
      studentsByDivMap.set(div, (studentsByDivMap.get(div) || 0) + 1);
    });

    const studentInsights = {
      byInstitution: Array.from(studentsByInstMap.entries()).map(([name, count]) => ({ name, count })),
      byDepartment: Array.from(studentsByDeptMap.entries()).map(([name, count]) => ({ name, count })),
      bySemester: Array.from(studentsBySemMap.entries()).map(([semester, count]) => ({ semester, count })).sort((a, b) => a.semester - b.semester),
      byDivision: Array.from(studentsByDivMap.entries()).map(([division, count]) => ({ division, count })),
      riskBreakdown: {
        lowAcademicPerformance: lowAcademicCount,
        lowAttendance: lowAttendanceCount,
        activeBacklog: activeBacklogCount,
        multipleRiskFactors: multipleRiskCount
      }
    };

    // 14. Faculty Insights Data Breakdowns
    const facultyByInstMap = new Map();
    const facultyByDeptMap = new Map();

    filteredProfessors.forEach(p => {
      const instObj = authInstitutions.find(i => i._id.toString() === (p.institution?._id || p.institution)?.toString());
      const deptObj = authDepartments.find(d => d._id.toString() === (p.department?._id || p.department)?.toString());

      const instName = instObj ? instObj.name : 'Other / Unassigned';
      const deptName = deptObj ? deptObj.name : 'Other / Unassigned';

      facultyByInstMap.set(instName, (facultyByInstMap.get(instName) || 0) + 1);
      facultyByDeptMap.set(deptName, (facultyByDeptMap.get(deptName) || 0) + 1);
    });

    const facultyInsights = {
      byInstitution: Array.from(facultyByInstMap.entries()).map(([name, count]) => ({ name, count })),
      byDepartment: Array.from(facultyByDeptMap.entries()).map(([name, count]) => ({ name, count })),
      courseAllocation: courseAllocationList,
      facultyCoverage: facultyCoverageByDept,
      unassignedCourses: unassignedCoursesList,
      facultyWithoutCourses: facultyWithoutCoursesList
    };

    // 15. Summary Metrics Object
    const summary = {
      totalStudents: targetStudentMap.size,
      activeStudents: Array.from(targetStudentMap.values()).filter(s => s.isActive !== false).length,
      totalFaculty: filteredProfessors.length,
      activeFaculty: filteredProfessors.filter(p => p.isActive !== false).length,
      totalInstitutions: filteredInsts.length,
      totalDepartments: filteredDepts.length,
      totalCourses: filteredCourses.length,
      averagePerformance,
      averageAttendance,
      passRate,
      atRiskStudents: totalAtRiskStudents,
      activeBacklogs: activeBacklogCount,
      assignedCourses: assignedCoursesCount,
      unassignedCourses: unassignedCoursesCount
    };

    res.json({
      success: true,
      filters: {
        institution: filterInst || null,
        department: filterDept || null,
        semester: filterSemester || null,
        academicTerm: filterTerm || null,
        professor: filterProf || null,
        course: filterCourse || null,
        division: filterDivision || null
      },
      summary,
      institutionPerformance: institutionPerformanceList,
      departmentPerformance: departmentPerformanceList,
      semesterPerformance: semesterPerformanceList,
      studentInsights,
      facultyInsights,
      coursePerformance: coursePerformanceList,
      filterOptions
    });

  } catch (error) {
    next(error);
  }
};

// Helper for safe Mongo ObjectId string extraction
const toIdStr = (val) => {
  if (!val) return '';
  if (val._id) return val._id.toString();
  return val.toString();
};

// @desc    Get Professor Student Overview aggregation
// @route   GET /api/analytics/professor/students-overview
exports.getProfessorStudentsOverview = async (req, res, next) => {
  try {
    const user = req.user;
    const userId = user._id;

    // 1. Identify professor's assigned courses
    let assignedCourses = [];
    if (['super_admin', 'university_admin', 'academic_admin', 'academic_administrator', 'inst_admin', 'dept_admin'].includes(user.role)) {
      if (req.query.professorId && mongoose.Types.ObjectId.isValid(req.query.professorId)) {
        const pId = new mongoose.Types.ObjectId(req.query.professorId);
        assignedCourses = await Course.find({
          $or: [{ professor: pId }, { _id: { $in: user.courses || [] } }]
        }).populate('department', 'name code');
      } else {
        assignedCourses = await Course.find({}).populate('department', 'name code');
      }
    } else {
      const userCourseIds = (user.courses || []).map(c => toIdStr(c));
      assignedCourses = await Course.find({
        $or: [
          { professor: userId },
          { _id: { $in: userCourseIds } }
        ]
      }).populate('department', 'name code');
    }

    const courseIds = assignedCourses.map(c => c._id);

    if (courseIds.length === 0) {
      return res.json({
        success: true,
        students: [],
        filters: {
          courses: [],
          semesters: [],
          divisions: []
        }
      });
    }

    const courseFilterOptions = assignedCourses.map(c => ({
      _id: c._id,
      code: c.code,
      name: c.name,
      semester: c.semester
    }));

    const semestersSet = new Set();
    assignedCourses.forEach(c => {
      if (c.semester) semestersSet.add(c.semester);
    });

    // 2. Fetch active enrollments for assigned courses
    const enrollments = await Enrollment.find({
      course: { $in: courseIds },
      status: 'active'
    }).populate({
      path: 'student',
      select: 'name email enrollmentNumber currentSemester division department isActive createdAt',
      populate: { path: 'department', select: 'name code' }
    }).populate('course', 'name code semester');

    const validEnrollments = enrollments.filter(e => e.student && e.student.isActive !== false);

    const divisionsSet = new Set();
    validEnrollments.forEach(e => {
      const div = e.division || e.student?.division;
      if (div) divisionsSet.add(div.trim().toUpperCase());
      if (e.student?.currentSemester) semestersSet.add(e.student.currentSemester);
    });

    // 3. Map students to unique entries
    const studentMap = new Map();
    validEnrollments.forEach(e => {
      const s = e.student;
      const sId = toIdStr(s);
      if (!sId) return;

      if (!studentMap.has(sId)) {
        studentMap.set(sId, {
          _id: s._id || s,
          name: s.name || 'Unknown Student',
          email: s.email || 'N/A',
          enrollmentNumber: s.enrollmentNumber || 'N/A',
          department: s.department ? (s.department.name || s.department.code || (typeof s.department === 'string' ? s.department : 'N/A')) : 'N/A',
          currentSemester: s.currentSemester || e.course?.semester || 1,
          division: e.division || s.division || 'N/A',
          createdAt: s.createdAt,
          enrolledCourseIds: []
        });
      }
      const st = studentMap.get(sId);
      if (e.course) {
        const cId = toIdStr(e.course);
        if (cId && !st.enrolledCourseIds.includes(cId)) {
          st.enrolledCourseIds.push(cId);
        }
      }
    });

    const studentIds = Array.from(studentMap.keys()).map(id => new mongoose.Types.ObjectId(id));

    if (studentIds.length === 0) {
      return res.json({
        success: true,
        students: [],
        filters: {
          courses: courseFilterOptions,
          semesters: Array.from(semestersSet).sort((a, b) => a - b),
          divisions: Array.from(divisionsSet).sort()
        }
      });
    }

    // 4. Batch query Attendance
    const sessions = await AttendanceSession.find({
      course: { $in: courseIds },
      status: 'CONDUCTED'
    });
    const sessionIds = sessions.map(s => s._id);

    const attendanceRecords = sessionIds.length > 0
      ? await AttendanceRecord.find({
          session: { $in: sessionIds },
          student: { $in: studentIds }
        })
      : [];

    const studentAttendanceStats = new Map();
    attendanceRecords.forEach(rec => {
      const sId = toIdStr(rec.student);
      if (!sId) return;
      if (!studentAttendanceStats.has(sId)) {
        studentAttendanceStats.set(sId, { total: 0, present: 0 });
      }
      const stat = studentAttendanceStats.get(sId);
      stat.total += 1;
      if (rec.status === 'PRESENT') stat.present += 1;
    });

    // 5. Batch query Gradebook
    const Gradebook = require('../models/Gradebook');
    const gradebooks = await Gradebook.find({ course: { $in: courseIds } });

    const studentGradebookScores = new Map();
    gradebooks.forEach(gb => {
      if (!gb.components || gb.components.length === 0) return;
      const studentGradesGroup = new Map();
      (gb.grades || []).forEach(g => {
        const sId = toIdStr(g.student);
        if (!sId) return;
        if (!studentGradesGroup.has(sId)) {
          studentGradesGroup.set(sId, []);
        }
        studentGradesGroup.get(sId).push(g);
      });

      studentGradesGroup.forEach((entries, sId) => {
        let totalWeighted = 0;
        entries.forEach(entry => {
          const comp = gb.components.find(c => c.name === entry.componentName);
          if (comp && comp.maxMarks > 0) {
            totalWeighted += (entry.marksObtained / comp.maxMarks) * comp.weightage;
          }
        });
        if (!studentGradebookScores.has(sId)) {
          studentGradebookScores.set(sId, []);
        }
        studentGradebookScores.get(sId).push(totalWeighted);
      });
    });

    // 6. Batch query Assignments
    const assignments = await Assignment.find({ course: { $in: courseIds } });
    const now = new Date();
    const studentAssignmentStats = new Map();

    studentIds.forEach(sIdObj => {
      const sId = toIdStr(sIdObj);
      const studentCourses = studentMap.get(sId)?.enrolledCourseIds || [];
      const relevantAssignments = assignments.filter(a => studentCourses.includes(toIdStr(a.course)));

      let submittedCount = 0;
      let totalObtained = 0;
      let totalMax = 0;
      let pendingCount = 0;

      relevantAssignments.forEach(a => {
        const sub = (a.submissions || []).find(s => toIdStr(s.student) === sId);
        if (sub && sub.status === 'graded' && typeof sub.marks === 'number') {
          submittedCount++;
          totalObtained += sub.marks;
          totalMax += a.maxMarks;
        } else if (sub) {
          submittedCount++;
        } else {
          if (new Date(a.dueDate) < now) {
            pendingCount++;
          }
        }
      });

      studentAssignmentStats.set(sId, {
        totalRelevant: relevantAssignments.length,
        submitted: submittedCount,
        gradedAverage: totalMax > 0 ? (totalObtained / totalMax) * 100 : null,
        pendingCount
      });
    });

    // 7. Batch query Quizzes & QuizResults
    const quizzes = await Quiz.find({ course: { $in: courseIds } });
    const quizIds = quizzes.map(q => q._id);

    const quizResults = quizIds.length > 0
      ? await QuizResult.find({ quiz: { $in: quizIds }, student: { $in: studentIds } })
      : [];

    const studentQuizStats = new Map();
    quizResults.forEach(r => {
      const sId = toIdStr(r.student);
      if (!sId) return;
      if (!studentQuizStats.has(sId)) {
        studentQuizStats.set(sId, { attempted: 0, totalPct: 0 });
      }
      const stat = studentQuizStats.get(sId);
      stat.attempted += 1;
      const pct = r.maxScore > 0 ? (r.totalScore / r.maxScore) * 100 : 0;
      stat.totalPct += pct;
    });

    const studentSummaries = [];

    studentMap.forEach((st, sId) => {
      const att = studentAttendanceStats.get(sId);
      const attendancePercentage = (att && att.total > 0)
        ? parseFloat(((att.present / att.total) * 100).toFixed(1))
        : null;

      const gbScores = studentGradebookScores.get(sId);
      let gradebookAverage = null;
      if (gbScores && gbScores.length > 0) {
        gradebookAverage = parseFloat((gbScores.reduce((a, b) => a + b, 0) / gbScores.length).toFixed(1));
      }

      const qStat = studentQuizStats.get(sId);
      const quizAverage = (qStat && qStat.attempted > 0)
        ? parseFloat((qStat.totalPct / qStat.attempted).toFixed(1))
        : null;

      const asStat = studentAssignmentStats.get(sId);
      const assignmentSubmitted = asStat ? asStat.submitted : 0;
      const assignmentTotal = asStat ? asStat.totalRelevant : 0;

      let averageMarks = gradebookAverage;
      if (averageMarks === null) {
        const scoresToAvg = [];
        if (quizAverage !== null) scoresToAvg.push(quizAverage);
        if (asStat && asStat.gradedAverage !== null) scoresToAvg.push(asStat.gradedAverage);
        if (scoresToAvg.length > 0) {
          averageMarks = parseFloat((scoresToAvg.reduce((a, b) => a + b, 0) / scoresToAvg.length).toFixed(1));
        }
      }

      let progressPercentage = null;
      if (attendancePercentage !== null && averageMarks !== null) {
        progressPercentage = parseFloat((0.4 * attendancePercentage + 0.6 * averageMarks).toFixed(1));
      } else if (attendancePercentage !== null) {
        progressPercentage = attendancePercentage;
      } else if (averageMarks !== null) {
        progressPercentage = averageMarks;
      }

      const indicators = [];
      if (attendancePercentage !== null && attendancePercentage < 75) {
        indicators.push('Low Attendance');
      }
      if (asStat && asStat.pendingCount > 0) {
        indicators.push('Pending Assignment');
      }
      if (averageMarks !== null && averageMarks < 50) {
        indicators.push('Recent Performance Drop');
      }
      if (indicators.length === 0) {
        indicators.push('No Pending Issues');
      }

      let performanceStatus = 'Regular';
      if (indicators.includes('Low Attendance') || indicators.includes('Pending Assignment') || indicators.includes('Recent Performance Drop') || (averageMarks !== null && averageMarks < 50)) {
        performanceStatus = 'Needs Attention';
      } else if ((progressPercentage !== null && progressPercentage >= 80) || (averageMarks !== null && averageMarks >= 80)) {
        performanceStatus = 'High Performance';
      }

      studentSummaries.push({
        _id: st._id,
        name: st.name,
        email: st.email,
        enrollmentNumber: st.enrollmentNumber,
        department: st.department,
        currentSemester: st.currentSemester,
        division: st.division,
        createdAt: st.createdAt,
        coursesCount: st.enrolledCourseIds.length,
        attendancePercentage,
        attendanceDetails: att ? { totalSessions: att.total, presentSessions: att.present } : null,
        averageMarks,
        gradebookAverage,
        quizAverage,
        assignmentSubmitted,
        assignmentTotal,
        progressPercentage,
        indicators,
        performanceStatus
      });
    });

    res.json({
      success: true,
      students: studentSummaries,
      filters: {
        courses: courseFilterOptions,
        semesters: Array.from(semestersSet).sort((a, b) => a - b),
        divisions: Array.from(divisionsSet).sort()
      }
    });

  } catch (error) {
    console.error('Error in getProfessorStudentsOverview:', error);
    next(error);
  }
};

// @desc    Get detailed student academic overview for professor scope
// @route   GET /api/analytics/professor/student-detail/:studentId
exports.getProfessorStudentDetail = async (req, res, next) => {
  try {
    const user = req.user;
    const userId = user._id;
    const targetStudentId = req.params.studentId;

    if (!mongoose.Types.ObjectId.isValid(targetStudentId)) {
      return res.status(400).json({ success: false, message: 'Invalid student ID' });
    }

    const studentObjId = new mongoose.Types.ObjectId(targetStudentId);
    const student = await User.findById(studentObjId)
      .select('name email enrollmentNumber currentSemester division department createdAt')
      .populate('department', 'name code');

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    let assignedCourses = [];
    if (['super_admin', 'university_admin', 'academic_admin', 'academic_administrator', 'inst_admin', 'dept_admin'].includes(user.role)) {
      assignedCourses = await Course.find({}).select('name code semester department');
    } else {
      const userCourseIds = (user.courses || []).map(c => toIdStr(c));
      assignedCourses = await Course.find({
        $or: [{ professor: userId }, { _id: { $in: userCourseIds } }]
      }).select('name code semester department');
    }

    const courseIds = assignedCourses.map(c => c._id);

    const studentEnrollments = await Enrollment.find({
      student: studentObjId,
      course: { $in: courseIds },
      status: 'active'
    }).populate('course', 'name code semester');

    if (studentEnrollments.length === 0 && !['super_admin', 'university_admin', 'academic_admin'].includes(user.role)) {
      return res.status(403).json({ success: false, message: 'Student is not enrolled in your courses' });
    }

    const relevantCourseIds = studentEnrollments.map(e => e.course._id);

    // 1. Course Performance
    const Gradebook = require('../models/Gradebook');
    const gradebooks = await Gradebook.find({ course: { $in: relevantCourseIds } });

    const sessions = await AttendanceSession.find({
      course: { $in: relevantCourseIds },
      status: 'CONDUCTED'
    });
    const sessionIds = sessions.map(s => s._id);

    const attendanceRecords = sessionIds.length > 0
      ? await AttendanceRecord.find({
          session: { $in: sessionIds },
          student: studentObjId
        })
      : [];

    const coursePerformanceList = studentEnrollments.map(e => {
      const c = e.course;
      const cId = toIdStr(c);

      const cSessions = sessions.filter(s => toIdStr(s.course) === cId);
      const cSessionIds = cSessions.map(s => toIdStr(s._id));
      const cRecords = attendanceRecords.filter(r => cSessionIds.includes(toIdStr(r.session)));
      const cPresent = cRecords.filter(r => r.status === 'PRESENT').length;
      const cAttPct = cRecords.length > 0 ? parseFloat(((cPresent / cRecords.length) * 100).toFixed(1)) : null;

      const gb = gradebooks.find(g => toIdStr(g.course) === cId);
      let cAvgMarks = null;
      if (gb && gb.components && gb.components.length > 0) {
        let totalWeighted = 0;
        let hasGrade = false;
        (gb.grades || []).forEach(g => {
          if (toIdStr(g.student) === targetStudentId) {
            const comp = gb.components.find(cp => cp.name === g.componentName);
            if (comp && comp.maxMarks > 0) {
              totalWeighted += (g.marksObtained / comp.maxMarks) * comp.weightage;
              hasGrade = true;
            }
          }
        });
        if (hasGrade) {
          cAvgMarks = parseFloat(totalWeighted.toFixed(1));
        }
      }

      let cProgress = null;
      if (cAttPct !== null && cAvgMarks !== null) {
        cProgress = parseFloat((0.4 * cAttPct + 0.6 * cAvgMarks).toFixed(1));
      } else if (cAttPct !== null) {
        cProgress = cAttPct;
      } else if (cAvgMarks !== null) {
        cProgress = cAvgMarks;
      }

      return {
        courseId: c._id,
        courseName: c.name,
        courseCode: c.code,
        semester: c.semester,
        attendancePercentage: cAttPct,
        averageMarks: cAvgMarks,
        progressPercentage: cProgress
      };
    });

    // 2. Assignments
    const assignments = await Assignment.find({ course: { $in: relevantCourseIds } })
      .populate('course', 'name code')
      .sort({ dueDate: -1 });

    const assignmentList = [];
    let submittedCount = 0;
    let pendingCount = 0;
    let totalScoreObtained = 0;
    let totalScoreMax = 0;

    assignments.forEach(a => {
      const sub = (a.submissions || []).find(s => toIdStr(s.student) === targetStudentId);
      let statusText = 'Pending';
      let marksText = 'Pending';
      let scorePct = null;

      if (sub) {
        submittedCount++;
        statusText = sub.status === 'graded' ? 'Graded' : 'Submitted';
        if (typeof sub.marks === 'number') {
          marksText = `${sub.marks}/${a.maxMarks}`;
          totalScoreObtained += sub.marks;
          totalScoreMax += a.maxMarks;
          scorePct = parseFloat(((sub.marks / a.maxMarks) * 100).toFixed(1));
        }
      } else {
        pendingCount++;
      }

      assignmentList.push({
        _id: a._id,
        title: a.title,
        courseName: a.course?.name || 'N/A',
        dueDate: a.dueDate,
        maxMarks: a.maxMarks,
        status: statusText,
        marksText,
        scorePct,
        submittedAt: sub ? sub.submittedAt : null,
        evaluationStatus: sub ? (sub.evaluationStatus || 'NOT_EVALUATED') : 'NOT_EVALUATED'
      });
    });

    const assignmentAvg = totalScoreMax > 0 ? parseFloat(((totalScoreObtained / totalScoreMax) * 100).toFixed(1)) : null;

    // 3. Quizzes
    const quizzes = await Quiz.find({ course: { $in: relevantCourseIds } }).populate('course', 'name code');
    const quizIds = quizzes.map(q => q._id);

    const quizResults = quizIds.length > 0
      ? await QuizResult.find({ quiz: { $in: quizIds }, student: studentObjId })
          .populate({ path: 'quiz', select: 'title course', populate: { path: 'course', select: 'name code' } })
          .sort({ createdAt: -1 })
      : [];

    let quizTotalScore = 0;
    let quizTotalAttempted = quizResults.length;
    const recentQuizzes = quizResults.map(r => {
      const pct = r.maxScore > 0 ? parseFloat(((r.totalScore / r.maxScore) * 100).toFixed(1)) : 0;
      quizTotalScore += pct;
      return {
        _id: r._id,
        quizId: r.quiz?._id,
        quizTitle: r.quiz?.title || 'Quiz',
        courseName: r.quiz?.course?.name || 'N/A',
        scoreText: `${r.totalScore}/${r.maxScore}`,
        percentage: pct,
        submittedAt: r.submittedAt || r.createdAt
      };
    });

    const quizAvgScore = quizTotalAttempted > 0 ? parseFloat((quizTotalScore / quizTotalAttempted).toFixed(1)) : null;

    // 4. Real Recent Activity
    const recentActivity = [];

    recentQuizzes.forEach(q => {
      if (q.submittedAt) {
        recentActivity.push({
          type: 'QUIZ',
          title: `Completed quiz: ${q.quizTitle}`,
          date: q.submittedAt,
          detail: `Score: ${q.scoreText} (${q.percentage}%)`
        });
      }
    });

    assignmentList.forEach(a => {
      if (a.submittedAt) {
        recentActivity.push({
          type: 'ASSIGNMENT',
          title: `Submitted assignment: ${a.title}`,
          date: a.submittedAt,
          detail: `Status: ${a.status} (${a.marksText})`
        });
      }
    });

    recentActivity.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Summary Totals
    const overallAttPct = attendanceRecords.length > 0
      ? parseFloat(((attendanceRecords.filter(r => r.status === 'PRESENT').length / attendanceRecords.length) * 100).toFixed(1))
      : null;

    const courseAvgMarksList = coursePerformanceList.map(cp => cp.averageMarks).filter(m => m !== null);
    const overallAvgMarks = courseAvgMarksList.length > 0
      ? parseFloat((courseAvgMarksList.reduce((a, b) => a + b, 0) / courseAvgMarksList.length).toFixed(1))
      : (assignmentAvg || quizAvgScore || null);

    let overallProgress = null;
    if (overallAttPct !== null && overallAvgMarks !== null) {
      overallProgress = parseFloat((0.4 * overallAttPct + 0.6 * overallAvgMarks).toFixed(1));
    } else if (overallAttPct !== null) {
      overallProgress = overallAttPct;
    } else if (overallAvgMarks !== null) {
      overallProgress = overallAvgMarks;
    }

    res.json({
      success: true,
      student: {
        _id: student._id,
        name: student.name,
        email: student.email,
        enrollmentNumber: student.enrollmentNumber || 'N/A',
        department: student.department ? (student.department.name || student.department.code || student.department) : 'N/A',
        currentSemester: student.currentSemester || studentEnrollments[0]?.course?.semester || 1,
        division: studentEnrollments[0]?.division || student.division || 'A'
      },
      summary: {
        attendancePercentage: overallAttPct,
        averageMarks: overallAvgMarks,
        assignmentSubmitted: submittedCount,
        assignmentTotal: assignments.length,
        progressPercentage: overallProgress
      },
      coursePerformance: coursePerformanceList,
      assignments: {
        submitted: submittedCount,
        pending: pendingCount,
        averageScore: assignmentAvg,
        list: assignmentList
      },
      quizzes: {
        attempted: quizTotalAttempted,
        totalQuizzes: quizzes.length,
        averageScore: quizAvgScore,
        list: recentQuizzes
      },
      recentActivity: recentActivity.slice(0, 10)
    });

  } catch (error) {
    console.error('Error in getProfessorStudentDetail:', error);
    next(error);
  }
};


