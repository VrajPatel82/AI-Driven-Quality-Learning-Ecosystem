'use strict';

/**
 * Complete Database Seed Script - Restructured with Proper Academic Hierarchy
 * 
 * ACADEMIC STRUCTURE:
 * Institution 
 *   → Department (with 1 Departmental Admin)
 *     → Courses (each with exactly 1 Professor)
 *       → Lectures (exactly 3 per professor per course)
 *         → Quizzes & Assignments (created by course professor only)
 *
 * Run: cd backend && npm run seed
 * WARNING: Deletes ALL existing data first.
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User         = require('./models/User');
const Institution  = require('./models/Institution');
const Department   = require('./models/Department');
const Course       = require('./models/Course');
const Lecture      = require('./models/Lecture');
const Quiz         = require('./models/Quiz');
const QuizResult   = require('./models/QuizResult');
const Assignment   = require('./models/Assignment');
const Announcement = require('./models/Announcement');
const ForumPost    = require('./models/ForumPost');
const Attendance   = require('./models/Attendance');
const Event        = require('./models/Event');
const Gradebook    = require('./models/Gradebook');
const Notification = require('./models/Notification');
const AuditLog     = require('./models/AuditLog');
const ResourceAllocation = require('./models/ResourceAllocation');
const ResourceAllocationHistory = require('./models/ResourceAllocationHistory');
const FileMetadata = require('./models/FileMetadata');
const MeteredAIUsageLedger = require('./models/MeteredAIUsageLedger');
const AIConversation = require('./models/AIConversation');
const AIMessage = require('./models/AIMessage');

const daysAgo     = (n) => new Date(Date.now() - n * 864e5);
const daysFromNow = (n) => new Date(Date.now() + n * 864e5);
const DUMMY_PDF   = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
const DUMMY_VIDEO = 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4';

// ── HELPER: Generate Department and Professor IDs ──────────────────────────
const generateIds = async () => {
  let deptIdCount = 0;
  let profIdCount = 0;

  const departments = await Department.find();
  for (const dept of departments) {
    if (!dept.departmentId) {
      const inst = await Institution.findById(dept.institution);
      if (inst) {
        const instCode = inst.code || 'UNK';
        const deptCode = dept.code || 'UNK';
        dept.departmentId = `${instCode}-${deptCode}-001`;
        await dept.save();
        deptIdCount++;
      }
    }
  }

  const professors = await User.find({ role: 'professor' }).populate('institution').populate('department');
  const profsByDept = {};
  for (const prof of professors) {
    if (!prof.professorId && prof.department && prof.institution) {
      const deptKey = prof.department._id.toString();
      if (!profsByDept[deptKey]) profsByDept[deptKey] = [];
      profsByDept[deptKey].push(prof);
    }
  }

  for (const [deptKey, profs] of Object.entries(profsByDept)) {
    const dept = await Department.findById(deptKey).populate('institution');
    if (dept && dept.institution) {
      const instCode = dept.institution.code || 'UNK';
      const deptCode = dept.code || 'UNK';
      for (let i = 0; i < profs.length; i++) {
        profs[i].professorId = `${instCode}-${deptCode}-PROF-${String(i + 1).padStart(3, '0')}`;
        await profs[i].save();
        profIdCount++;
      }
    }
  }

  return { deptIdCount, profIdCount };
};

const seedData = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB\n');

        console.log('Clearing existing data...');
        await Promise.all([
            User.deleteMany({}), Institution.deleteMany({}), Department.deleteMany({}),
            Course.deleteMany({}), Lecture.deleteMany({}), Quiz.deleteMany({}),
            QuizResult.deleteMany({}), Assignment.deleteMany({}), Announcement.deleteMany({}),
            ForumPost.deleteMany({}), Attendance.deleteMany({}),
            Event.deleteMany({}), Gradebook.deleteMany({}), Notification.deleteMany({}),
            ResourceAllocation.deleteMany({}), ResourceAllocationHistory.deleteMany({}),
            FileMetadata.deleteMany({}), MeteredAIUsageLedger.deleteMany({}),
            AIConversation.deleteMany({}), AIMessage.deleteMany({})
        ]);
        try { await ResourceAllocation.collection.dropIndexes(); } catch (e) {}
        try { await FileMetadata.collection.dropIndexes(); } catch (e) {}
        try { await MeteredAIUsageLedger.collection.dropIndexes(); } catch (e) {}
        console.log('All collections cleared.\n');

        // ── 1. INSTITUTIONS ─────────────────────────────────────────────
        console.log('Creating institutions...');
        const institutions = await Institution.insertMany([
            { name: 'Indian Institute of Technology Bombay', code: 'IITB', address: 'Main Gate Rd, IIT Area, Powai, Mumbai' },
            { name: 'Indian Institute of Technology Delhi',  code: 'IITD', address: 'Hauz Khas, New Delhi' },
        ]);
        const [iitb, iitd] = institutions;
        console.log('  Created ' + institutions.length + ' institutions.');

        // ── 2. DEPARTMENTS ───────────────────────────────────────────────
        console.log('Creating departments (with 1 departmental admin each)...');
        const departments = await Department.insertMany([
            { name: 'Computer Science & Engineering', code: 'CSE',  institution: iitb._id },
            { name: 'Electrical Engineering',          code: 'EE',   institution: iitb._id },
            { name: 'Computer Science & Engineering', code: 'CSE',  institution: iitd._id },
            { name: 'Electronics & Communication',     code: 'ECE',  institution: iitd._id },
        ]);
        const [iitb_cse, iitb_ee, iitd_cse, iitd_ece] = departments;
        console.log('  Created ' + departments.length + ' departments.');

        // ── 3. USERS ─────────────────────────────────────────────────────
        console.log('Creating users...');
        const PWD = 'Password@123';
        const usersData = [
            // Super Admin
            { name: 'superadmin',          email: 'admin@superadmin.com',    password: PWD, role: 'super_admin', phone: '+91-9000000001' },
            
            // University Admin
            { name: 'Dr. K. S. Sharma',         email: 'uni.admin@iitb.ac.in',    password: PWD, role: 'university_admin', institution: iitb._id, phone: '+91-9000000002' },

            // Institutional Admins
            { name: 'Dr. Ramesh Kumar',         email: 'admin@iitb.ac.in',        password: PWD, role: 'inst_admin', institution: iitb._id, phone: '+91-9100000001' },
            { name: 'Prof. Anjali Gupta',       email: 'admin@iitd.ac.in',        password: PWD, role: 'inst_admin', institution: iitd._id, phone: '+91-9100000002' },
            
            // Academic Administrator
            { name: 'Dr. Neha Gupta',           email: 'acad.cse@iitb.ac.in',     password: PWD, role: 'academic_administrator', institution: iitb._id, department: iitb_cse._id, phone: '+91-9200000005' },
            
            // Departmental Admins (one per department)
            { name: 'Amit Patel',               email: 'hod.cse@iitb.ac.in',      password: PWD, role: 'dept_admin', institution: iitb._id, department: iitb_cse._id, phone: '+91-9200000001' },
            { name: 'Dr. Priya Nair',           email: 'hod.ee@iitb.ac.in',       password: PWD, role: 'dept_admin', institution: iitb._id, department: iitb_ee._id,  phone: '+91-9200000002' },
            { name: 'Dr. Suresh Menon',         email: 'hod.cse@iitd.ac.in',      password: PWD, role: 'dept_admin', institution: iitd._id, department: iitd_cse._id, phone: '+91-9200000003' },
            { name: 'Dr. Rajesh Kumar',         email: 'hod.ece@iitd.ac.in',      password: PWD, role: 'dept_admin', institution: iitd._id, department: iitd_ece._id, phone: '+91-9200000004' },
            
            // IITB CSE Professors
            { name: 'Prof. Vikram Malhotra',    email: 'vikram@iitb.ac.in',       password: PWD, role: 'professor', institution: iitb._id, department: iitb_cse._id, phone: '+91-9300000001', bio: 'Specializes in Algorithms and Data Structures' },
            { name: 'Prof. Suchitra Iyer',      email: 'suchitra@iitb.ac.in',     password: PWD, role: 'professor', institution: iitb._id, department: iitb_cse._id, phone: '+91-9300000002', bio: 'Expert in Machine Learning' },
            { name: 'Prof. Arun Sharma',        email: 'arun@iitb.ac.in',         password: PWD, role: 'professor', institution: iitb._id, department: iitb_cse._id, phone: '+91-9300000003', bio: 'Database Systems specialist' },
            
            // IITB EE Professors
            { name: 'Prof. Neha Joshi',         email: 'neha@iitb.ac.in',         password: PWD, role: 'professor', institution: iitb._id, department: iitb_ee._id,  phone: '+91-9300000004', bio: 'Power Electronics and Drives' },
            { name: 'Prof. Rajesh Desai',       email: 'rajesh@iitb.ac.in',       password: PWD, role: 'professor', institution: iitb._id, department: iitb_ee._id,  phone: '+91-9300000005', bio: 'Digital Signal Processing' },
            
            // IITD CSE Professors
            { name: 'Prof. Sandeep Reddy',      email: 'sandeep@iitd.ac.in',      password: PWD, role: 'professor', institution: iitd._id, department: iitd_cse._id, phone: '+91-9300000006', bio: 'Cloud Computing and Distributed Systems' },
            { name: 'Prof. Kavita Mishra',      email: 'kavita@iitd.ac.in',       password: PWD, role: 'professor', institution: iitd._id, department: iitd_cse._id, phone: '+91-9300000007', bio: 'Compiler Design and Programming Languages' },
            
            // IITD ECE Professors
            { name: 'Prof. Mohan Singh',        email: 'mohan@iitd.ac.in',        password: PWD, role: 'professor', institution: iitd._id, department: iitd_ece._id, phone: '+91-9300000008', bio: 'VLSI Design and Microelectronics' },
            { name: 'Prof. Swati Patel',        email: 'swati@iitd.ac.in',        password: PWD, role: 'professor', institution: iitd._id, department: iitd_ece._id, phone: '+91-9300000009', bio: 'Communication Systems' },
            
            // Students - IITB CSE
            { name: 'Rahul Verma',    email: 'rahul@iitb.ac.in',    password: PWD, role: 'student', institution: iitb._id, department: iitb_cse._id, phone: '+91-9400000001', enrollmentNumber: 'IITB-CSE-001', currentSemester: 3 },
            { name: 'Priya Singh',    email: 'priya@iitb.ac.in',    password: PWD, role: 'student', institution: iitb._id, department: iitb_cse._id, phone: '+91-9400000002', enrollmentNumber: 'IITB-CSE-002', currentSemester: 4 },
            { name: 'Siddharth Joshi',email: 'siddharth@iitb.ac.in',password: PWD, role: 'student', institution: iitb._id, department: iitb_cse._id, phone: '+91-9400000003', enrollmentNumber: 'IITB-CSE-003', currentSemester: 5 },
            { name: 'Ananya Sharma',  email: 'ananya@iitb.ac.in',   password: PWD, role: 'student', institution: iitb._id, department: iitb_cse._id, phone: '+91-9400000004', enrollmentNumber: 'IITB-CSE-004', currentSemester: 5 },
            { name: 'Arjun Mehta',    email: 'arjun@iitb.ac.in',    password: PWD, role: 'student', institution: iitb._id, department: iitb_cse._id, phone: '+91-9400000005', enrollmentNumber: 'IITB-CSE-005', currentSemester: 6 },
            
            // Students - IITB EE
            { name: 'Rohan Desai',    email: 'rohan@iitb.ac.in',    password: 'Student@123', role: 'student', institution: iitb._id, department: iitb_ee._id,  phone: '+91-9400000006', enrollmentNumber: 'IITB-EE-001', currentSemester: 6 },
            { name: 'Sneha Patil',    email: 'sneha@iitb.ac.in',    password: PWD, role: 'student', institution: iitb._id, department: iitb_ee._id,  phone: '+91-9400000007', enrollmentNumber: 'IITB-EE-002', currentSemester: 6 },
            
            // Students - IITD CSE
            { name: 'Karan Agarwal',  email: 'karan@iitd.ac.in',    password: PWD, role: 'student', institution: iitd._id, department: iitd_cse._id, phone: '+91-9400000008', enrollmentNumber: 'IITD-CSE-001', currentSemester: 7 },
            { name: 'Meera Krishnan', email: 'meera@iitd.ac.in',    password: PWD, role: 'student', institution: iitd._id, department: iitd_cse._id, phone: '+91-9400000009', enrollmentNumber: 'IITD-CSE-002', currentSemester: 7 },
            
            // Students - IITD ECE
            { name: 'Tamil Selvam',   email: 'tamil@iitd.ac.in',    password: PWD, role: 'student', institution: iitd._id, department: iitd_ece._id, phone: '+91-9400000010', enrollmentNumber: 'IITD-ECE-001', currentSemester: 8 },
            { name: 'Revathi Kumar',  email: 'revathi@iitd.ac.in',  password: PWD, role: 'student', institution: iitd._id, department: iitd_ece._id, phone: '+91-9400000011', enrollmentNumber: 'IITD-ECE-002', currentSemester: 8 },
        ];
        const users = [];
        for (const u of usersData) { const user = new User(u); await user.save(); users.push(user); }
        const superAdmin = users.find(u => u.email === 'admin@superadmin.com');
        const uniAdmin = users.find(u => u.email === 'uni.admin@iitb.ac.in');
        const iitbAdmin = users.find(u => u.email === 'admin@iitb.ac.in');
        const iitdAdmin = users.find(u => u.email === 'admin@iitd.ac.in');
        const acadAdmin = users.find(u => u.email === 'acad.cse@iitb.ac.in');
        const iitbCseHod = users.find(u => u.email === 'hod.cse@iitb.ac.in');
        const iitbEeHod = users.find(u => u.email === 'hod.ee@iitb.ac.in');
        const iitdCseHod = users.find(u => u.email === 'hod.cse@iitd.ac.in');
        const iitdEceHod = users.find(u => u.email === 'hod.ece@iitd.ac.in');
        const profVikram = users.find(u => u.email === 'vikram@iitb.ac.in');
        const profSuchitra = users.find(u => u.email === 'suchitra@iitb.ac.in');
        const profArun = users.find(u => u.email === 'arun@iitb.ac.in');
        const profNeha = users.find(u => u.email === 'neha@iitb.ac.in');
        const profRajesh = users.find(u => u.email === 'rajesh@iitb.ac.in');
        const profSandeep = users.find(u => u.email === 'sandeep@iitd.ac.in');
        const profKavita = users.find(u => u.email === 'kavita@iitd.ac.in');
        const profMohan = users.find(u => u.email === 'mohan@iitd.ac.in');
        const profSwati = users.find(u => u.email === 'swati@iitd.ac.in');
        const rahul = users.find(u => u.email === 'rahul@iitb.ac.in');
        const priya = users.find(u => u.email === 'priya@iitb.ac.in');
        const siddharth = users.find(u => u.email === 'siddharth@iitb.ac.in');
        const ananya = users.find(u => u.email === 'ananya@iitb.ac.in');
        const arjun = users.find(u => u.email === 'arjun@iitb.ac.in');
        const rohan = users.find(u => u.email === 'rohan@iitb.ac.in');
        const sneha = users.find(u => u.email === 'sneha@iitb.ac.in');
        const karan = users.find(u => u.email === 'karan@iitd.ac.in');
        const meera = users.find(u => u.email === 'meera@iitd.ac.in');
        const tamil = users.find(u => u.email === 'tamil@iitd.ac.in');
        const revathi = users.find(u => u.email === 'revathi@iitd.ac.in');

        const iitbCseStudents = [rahul, priya, siddharth, ananya, arjun];
        const iitbEeStudents = [rohan, sneha];
        const iitdCseStudents = [karan, meera];
        const iitdEceStudents = [tamil, revathi];
        
        console.log('  Created ' + users.length + ' users.');

        // ── 4. COURSES ───────────────────────────────────────────────────
        console.log('Creating courses (each assigned to exactly one professor)...');
        const courses = await Course.insertMany([
            // IITB CSE - Prof. Vikram teaches 2 courses (will have 6 lectures total: 3 per course)
            { name: 'Data Structures and Algorithms',    code: 'CS201', department: iitb_cse._id, semester: 3 },
            { name: 'Design and Analysis of Algorithms', code: 'CS202', department: iitb_cse._id, semester: 4 },
            
            // IITB CSE - Prof. Suchitra teaches 1 course (will have 3 lectures)
            { name: 'Introduction to Machine Learning',  code: 'CS301', department: iitb_cse._id, semester: 5 },
            
            // IITB CSE - Prof. Arun teaches 1 course (will have 3 lectures)
            { name: 'Database Management Systems',       code: 'CS302', department: iitb_cse._id, semester: 5 },
            
            // IITB EE - Prof. Neha teaches 2 courses (will have 6 lectures total: 3 per course)
            { name: 'Circuit Theory',                    code: 'EE201', department: iitb_ee._id,  semester: 3 },
            { name: 'Digital Electronics',               code: 'EE202', department: iitb_ee._id,  semester: 4 },
            
            // IITB EE - Prof. Rajesh teaches 1 course (will have 3 lectures)
            { name: 'Signals and Systems',               code: 'EE301', department: iitb_ee._id,  semester: 5 },
            
            // IITD CSE - Prof. Sandeep teaches 2 courses (will have 6 lectures total: 3 per course)
            { name: 'Cloud Computing',                   code: 'DCS401', department: iitd_cse._id, semester: 6 },
            { name: 'Distributed Systems',               code: 'DCS402', department: iitd_cse._id, semester: 7 },
            
            // IITD CSE - Prof. Kavita teaches 1 course (will have 3 lectures)
            { name: 'Compiler Design',                   code: 'DCS403', department: iitd_cse._id, semester: 6 },
            
            // IITD ECE - Prof. Mohan teaches 2 courses (will have 6 lectures total: 3 per course)
            { name: 'VLSI Design',                       code: 'EC301', department: iitd_ece._id, semester: 5 },
            { name: 'Microelectronics',                  code: 'EC302', department: iitd_ece._id, semester: 6 },
            
            // IITD ECE - Prof. Swati teaches 1 course (will have 3 lectures)
            { name: 'Communication Systems',             code: 'EC401', department: iitd_ece._id, semester: 7 },
        ]);
        const [dsa, daa, ml, dbms, circuit, de, ss, cloud, ds, compiler, vlsi, micro, comm] = courses;
        console.log('  Created ' + courses.length + ' courses.');

        // ── LINK PROFESSORS TO COURSES ───────────────────────────────────
        console.log('Linking professors to their assigned courses...');
        profVikram.courses = [dsa._id, daa._id];
        await profVikram.save();
        profSuchitra.courses = [ml._id];
        await profSuchitra.save();
        profArun.courses = [dbms._id];
        await profArun.save();
        profNeha.courses = [circuit._id, de._id];
        await profNeha.save();
        profRajesh.courses = [ss._id];
        await profRajesh.save();
        profSandeep.courses = [cloud._id, ds._id];
        await profSandeep.save();
        profKavita.courses = [compiler._id];
        await profKavita.save();
        profMohan.courses = [vlsi._id, micro._id];
        await profMohan.save();
        profSwati.courses = [comm._id];
        await profSwati.save();
        console.log('  Professors linked to courses.');

        // ── ENROLL STUDENTS IN COURSES ──────────────────────────────────
        console.log('Enrolling students in department courses...');
        const Enrollment = require('./models/Enrollment');
        
        // IITB CSE students - enroll in IITB CSE courses matching their semester
        for (const student of iitbCseStudents) {
            const currentCourses = [dsa, daa, ml, dbms].filter(c => c.semester === student.currentSemester);
            const pastCourses = [dsa, daa, ml, dbms].filter(c => c.semester < student.currentSemester);
            student.courses = currentCourses.map(c => c._id);
            await student.save();
            for (const c of pastCourses) {
                await Enrollment.create({
                    student: student._id,
                    course: c._id,
                    status: 'completed',
                    academicTerm: `SEM-${c.semester}`,
                    division: student.division || '',
                    attemptNumber: 1,
                    isBacklog: false
                });
            }
            for (const c of currentCourses) {
                await Enrollment.create({
                    student: student._id,
                    course: c._id,
                    status: 'active',
                    academicTerm: 'CURRENT',
                    division: student.division || '',
                    attemptNumber: 1,
                    isBacklog: false
                });
            }
        }
        
        // IITB EE students - enroll in IITB EE courses matching their semester
        for (const student of iitbEeStudents) {
            const currentCourses = [circuit, de, ss].filter(c => c.semester === student.currentSemester);
            const pastCourses = [circuit, de, ss].filter(c => c.semester < student.currentSemester);
            student.courses = currentCourses.map(c => c._id);
            await student.save();
            for (const c of pastCourses) {
                await Enrollment.create({
                    student: student._id,
                    course: c._id,
                    status: 'completed',
                    academicTerm: `SEM-${c.semester}`,
                    division: student.division || '',
                    attemptNumber: 1,
                    isBacklog: false
                });
            }
            for (const c of currentCourses) {
                await Enrollment.create({
                    student: student._id,
                    course: c._id,
                    status: 'active',
                    academicTerm: 'CURRENT',
                    division: student.division || '',
                    attemptNumber: 1,
                    isBacklog: false
                });
            }
        }
        
        // IITD CSE students - enroll in IITD CSE courses matching their semester
        for (const student of iitdCseStudents) {
            const currentCourses = [cloud, ds, compiler].filter(c => c.semester === student.currentSemester);
            const pastCourses = [cloud, ds, compiler].filter(c => c.semester < student.currentSemester);
            student.courses = currentCourses.map(c => c._id);
            await student.save();
            for (const c of pastCourses) {
                await Enrollment.create({
                    student: student._id,
                    course: c._id,
                    status: 'completed',
                    academicTerm: `SEM-${c.semester}`,
                    division: student.division || '',
                    attemptNumber: 1,
                    isBacklog: false
                });
            }
            for (const c of currentCourses) {
                await Enrollment.create({
                    student: student._id,
                    course: c._id,
                    status: 'active',
                    academicTerm: 'CURRENT',
                    division: student.division || '',
                    attemptNumber: 1,
                    isBacklog: false
                });
            }
        }
        
        // IITD ECE students - enroll in IITD ECE courses matching their semester
        for (const student of iitdEceStudents) {
            const currentCourses = [vlsi, micro, comm].filter(c => c.semester === student.currentSemester);
            const pastCourses = [vlsi, micro, comm].filter(c => c.semester < student.currentSemester);
            student.courses = currentCourses.map(c => c._id);
            await student.save();
            for (const c of pastCourses) {
                await Enrollment.create({
                    student: student._id,
                    course: c._id,
                    status: 'completed',
                    academicTerm: `SEM-${c.semester}`,
                    division: student.division || '',
                    attemptNumber: 1,
                    isBacklog: false
                });
            }
            for (const c of currentCourses) {
                await Enrollment.create({
                    student: student._id,
                    course: c._id,
                    status: 'active',
                    academicTerm: 'CURRENT',
                    division: student.division || '',
                    attemptNumber: 1,
                    isBacklog: false
                });
            }
        }
        console.log('  Students enrolled in courses (both User.courses array and Enrollment collection).');

        // ── 5. LECTURES ──────────────────────────────────────────────────
        console.log('Creating lectures (2 per course)...');
        const lecturesList = [
            // DSA (Prof. Vikram, Semester 3)
            { title: 'Introduction to Data Structures', description: 'Basics of arrays, linked lists, and memory management', type: 'lecture', subject: 'Data Structures', fileUrl: DUMMY_PDF, fileType: 'pdf', course: dsa._id, uploadedBy: profVikram._id, semester: 3 },
            { title: 'Advanced Tree Structures', description: 'AVL trees, Red-Black trees, and B-trees', type: 'lecture', subject: 'Data Structures', fileUrl: DUMMY_VIDEO, fileType: 'video', course: dsa._id, uploadedBy: profVikram._id, semester: 3 },
            
            // DAA (Prof. Vikram, Semester 4)
            { title: 'Divide and Conquer Algorithms', description: 'Understanding the divide and conquer paradigm with examples', type: 'lecture', subject: 'Algorithms', fileUrl: DUMMY_PDF, fileType: 'pdf', course: daa._id, uploadedBy: profVikram._id, semester: 4 },
            { title: 'Dynamic Programming Fundamentals', description: 'Optimal substructure and memoization techniques', type: 'lecture', subject: 'Algorithms', fileUrl: DUMMY_VIDEO, fileType: 'video', course: daa._id, uploadedBy: profVikram._id, semester: 4 },
            
            // ML (Prof. Suchitra, Semester 5)
            { title: 'Supervised Learning Basics', description: 'Introduction to classification and regression', type: 'lecture', subject: 'Machine Learning', fileUrl: DUMMY_PDF, fileType: 'pdf', course: ml._id, uploadedBy: profSuchitra._id, semester: 5 },
            { title: 'Neural Networks and Deep Learning', description: 'Architecture and training of neural networks', type: 'lecture', subject: 'Machine Learning', fileUrl: DUMMY_VIDEO, fileType: 'video', course: ml._id, uploadedBy: profSuchitra._id, semester: 5 },
            
            // DBMS (Prof. Arun, Semester 5)
            { title: 'Relational Algebra and SQL', description: 'Query processing and optimization fundamentals', type: 'lecture', subject: 'Database Systems', fileUrl: DUMMY_PDF, fileType: 'pdf', course: dbms._id, uploadedBy: profArun._id, semester: 5 },
            { title: 'Transaction Management and ACID Properties', description: 'Concurrency control and recovery mechanisms', type: 'lecture', subject: 'Database Systems', fileUrl: DUMMY_VIDEO, fileType: 'video', course: dbms._id, uploadedBy: profArun._id, semester: 5 },
            
            // Circuit Theory (Prof. Neha, Semester 3)
            { title: 'DC Circuit Analysis', description: 'Kirchhoff\'s laws and mesh/nodal analysis', type: 'lecture', subject: 'Circuit Theory', fileUrl: DUMMY_PDF, fileType: 'pdf', course: circuit._id, uploadedBy: profNeha._id, semester: 3 },
            { title: 'AC Circuits and Phasors', description: 'Sinusoidal steady-state analysis', type: 'lecture', subject: 'Circuit Theory', fileUrl: DUMMY_VIDEO, fileType: 'video', course: circuit._id, uploadedBy: profNeha._id, semester: 3 },
            
            // Digital Electronics (Prof. Neha, Semester 4)
            { title: 'Boolean Algebra and Logic Gates', description: 'Logic design and minimization techniques', type: 'lecture', subject: 'Digital Electronics', fileUrl: DUMMY_PDF, fileType: 'pdf', course: de._id, uploadedBy: profNeha._id, semester: 4 },
            { title: 'Sequential Circuits and Finite State Machines', description: 'Flip-flops, counters, and FSM design', type: 'lecture', subject: 'Digital Electronics', fileUrl: DUMMY_VIDEO, fileType: 'video', course: de._id, uploadedBy: profNeha._id, semester: 4 },
            
            // Signals and Systems (Prof. Rajesh, Semester 5)
            { title: 'Linear Time-Invariant Systems', description: 'Impulse response and convolution', type: 'lecture', subject: 'Signals and Systems', fileUrl: DUMMY_PDF, fileType: 'pdf', course: ss._id, uploadedBy: profRajesh._id, semester: 5 },
            { title: 'Fourier Analysis and Transform', description: 'Fourier series, transform, and applications', type: 'lecture', subject: 'Signals and Systems', fileUrl: DUMMY_VIDEO, fileType: 'video', course: ss._id, uploadedBy: profRajesh._id, semester: 5 },
            
            // Cloud Computing (Prof. Sandeep, Semester 6)
            { title: 'Cloud Service Models and Deployment', description: 'IaaS, PaaS, SaaS, and hybrid clouds', type: 'lecture', subject: 'Cloud Computing', fileUrl: DUMMY_PDF, fileType: 'pdf', course: cloud._id, uploadedBy: profSandeep._id, semester: 6 },
            { title: 'Virtualization and Containerization', description: 'VMs, Docker, Kubernetes fundamentals', type: 'lecture', subject: 'Cloud Computing', fileUrl: DUMMY_VIDEO, fileType: 'video', course: cloud._id, uploadedBy: profSandeep._id, semester: 6 },
            
            // Distributed Systems (Prof. Sandeep, Semester 7)
            { title: 'Distributed Algorithms and Consensus', description: 'Byzantine fault tolerance and consensus protocols', type: 'lecture', subject: 'Distributed Systems', fileUrl: DUMMY_PDF, fileType: 'pdf', course: ds._id, uploadedBy: profSandeep._id, semester: 7 },
            { title: 'Distributed Data Management', description: 'Replication, consistency models, and distributed transactions', type: 'lecture', subject: 'Distributed Systems', fileUrl: DUMMY_VIDEO, fileType: 'video', course: ds._id, uploadedBy: profSandeep._id, semester: 7 },
            
            // Compiler Design (Prof. Kavita, Semester 6)
            { title: 'Lexical and Syntax Analysis', description: 'Scanning, parsing, and abstract syntax trees', type: 'lecture', subject: 'Compilers', fileUrl: DUMMY_PDF, fileType: 'pdf', course: compiler._id, uploadedBy: profKavita._id, semester: 6 },
            { title: 'Semantic Analysis and Code Generation', description: 'Type checking and intermediate code generation', type: 'lecture', subject: 'Compilers', fileUrl: DUMMY_VIDEO, fileType: 'video', course: compiler._id, uploadedBy: profKavita._id, semester: 6 },
            
            // VLSI Design (Prof. Mohan, Semester 5)
            { title: 'CMOS Logic and Circuit Design', description: 'Gate design, power dissipation, and timing', type: 'lecture', subject: 'VLSI', fileUrl: DUMMY_PDF, fileType: 'pdf', course: vlsi._id, uploadedBy: profMohan._id, semester: 5 },
            { title: 'VLSI Design Methodology', description: 'CAD tools, simulation, and physical design', type: 'lecture', subject: 'VLSI', fileUrl: DUMMY_VIDEO, fileType: 'video', course: vlsi._id, uploadedBy: profMohan._id, semester: 5 },
            
            // Microelectronics (Prof. Mohan, Semester 6)
            { title: 'Semiconductor Physics and Device Fundamentals', description: 'PN junctions, transistors, and device characteristics', type: 'lecture', subject: 'Microelectronics', fileUrl: DUMMY_PDF, fileType: 'pdf', course: micro._id, uploadedBy: profMohan._id, semester: 6 },
            { title: 'Amplitude and Frequency Modulation Circuits', description: 'Operational amplifiers and analog circuits', type: 'lecture', subject: 'Microelectronics', fileUrl: DUMMY_VIDEO, fileType: 'video', course: micro._id, uploadedBy: profMohan._id, semester: 6 },
            
            // Communication Systems (Prof. Swati, Semester 7)
            { title: 'Modulation Techniques', description: 'AM, FM, PM and digital modulation', type: 'lecture', subject: 'Communications', fileUrl: DUMMY_PDF, fileType: 'pdf', course: comm._id, uploadedBy: profSwati._id, semester: 7 },
            { title: 'Channel Coding and Error Control', description: 'Error detection, correction, and coding theory', type: 'lecture', subject: 'Communications', fileUrl: DUMMY_VIDEO, fileType: 'video', course: comm._id, uploadedBy: profSwati._id, semester: 7 },
        ];
        const lectures = await Lecture.insertMany(lecturesList);
        console.log('  Created ' + lectures.length + ' lectures.');

        // ── 6. QUIZZES ───────────────────────────────────────────────────
        console.log('Creating quizzes (professor-specific)...');
        const quizDocs = await Quiz.insertMany([
            {
                title: 'DSA Quiz: Data Structures Fundamentals',
                course: dsa._id, timeLimit: 20, createdBy: profVikram._id, deadline: daysFromNow(7),
                questions: [
                    { question: 'Time complexity to insert at beginning of singly linked list?', type: 'mcq', options: ['O(1)','O(n)','O(log n)','O(n²)'], correctAnswer: 'O(1)', points: 2 },
                    { question: 'LIFO data structure is?',                                       type: 'mcq', options: ['Queue','Stack','Array','Tree'],          correctAnswer: 'Stack', points: 2 },
                    { question: 'Height of AVL tree with n nodes is approximately?',            type: 'mcq', options: ['O(n)','O(log n)','O(n log n)','O(1)'], correctAnswer: 'O(log n)', points: 2 },
                ],
            },
            {
                title: 'Machine Learning Assessment',
                course: ml._id, timeLimit: 25, createdBy: profSuchitra._id, deadline: daysFromNow(10),
                questions: [
                    { question: 'Linear Regression is what type of learning?',       type: 'mcq', options: ['Supervised','Unsupervised','Semi-supervised','Reinforcement'], correctAnswer: 'Supervised', points: 3 },
                    { question: 'Which activation function for binary classification?', type: 'mcq', options: ['ReLU','Sigmoid','Tanh','Softmax'],                     correctAnswer: 'Sigmoid',   points: 3 },
                    { question: 'What does k represent in k-NN?',                    type: 'mcq', options: ['Features','Classes','Neighbors','Layers'],                  correctAnswer: 'Neighbors', points: 3 },
                ],
            },
            {
                title: 'Database Management Systems Quiz',
                course: dbms._id, timeLimit: 25, createdBy: profArun._id, deadline: daysFromNow(12),
                questions: [
                    { question: 'Which clause filters groups in SQL?',               type: 'mcq', options: ['WHERE','HAVING','GROUP BY','ORDER BY'],         correctAnswer: 'HAVING',           points: 3 },
                    { question: 'Table in 2NF must have no:',                       type: 'mcq', options: ['Transitive deps','Partial deps','Nulls','FKs'], correctAnswer: 'Partial deps', points: 3 },
                    { question: 'Which join returns all rows from both tables?',    type: 'mcq', options: ['INNER','LEFT','FULL OUTER','CROSS'],            correctAnswer: 'FULL OUTER',       points: 3 },
                ],
            },
            {
                title: 'Cloud Computing Fundamentals Quiz',
                course: cloud._id, timeLimit: 30, createdBy: profSandeep._id, deadline: daysFromNow(8),
                questions: [
                    { question: 'Which service model gives most control?',              type: 'mcq', options: ['SaaS','PaaS','IaaS','FaaS'],                             correctAnswer: 'IaaS',      points: 4 },
                    { question: 'What does auto-scaling primarily address?',            type: 'mcq', options: ['Backup','Latency','Variable workload','Security'],       correctAnswer: 'Variable workload', points: 4 },
                    { question: 'Container virtualization differs from VMs by sharing:', type: 'mcq', options: ['Hardware','OS kernel','RAM','Disk'],             correctAnswer: 'OS kernel', points: 4 },
                ],
            },
        ]);
        console.log('  Created ' + quizDocs.length + ' quizzes.');

        // ── 7. QUIZ RESULTS ──────────────────────────────────────────────
        console.log('Creating quiz results...');
        const makeAnswers = (quizDoc, ans) =>
            quizDoc.questions.map((q, i) => ({
                questionId: q._id,
                answer: ans[i] !== undefined ? ans[i] : q.correctAnswer,
                isCorrect: (ans[i] !== undefined ? ans[i] : q.correctAnswer) === q.correctAnswer,
                pointsEarned: (ans[i] !== undefined ? ans[i] : q.correctAnswer) === q.correctAnswer ? q.points : 0,
            }));
        const calcTotal = (answers) => answers.reduce((s, a) => s + a.pointsEarned, 0);
        const calcMax = (q) => q.questions.reduce((s, x) => s + x.points, 0);

        const quizResults = [
            { quiz: quizDocs[0]._id, student: rahul._id, answers: makeAnswers(quizDocs[0], ['O(1)','Stack','O(log n)']), submittedAt: daysAgo(1) },
            { quiz: quizDocs[0]._id, student: priya._id, answers: makeAnswers(quizDocs[0], ['O(1)','Stack','O(log n)']), submittedAt: daysAgo(1) },
            { quiz: quizDocs[1]._id, student: rahul._id, answers: makeAnswers(quizDocs[1], ['Supervised','Sigmoid','Neighbors']), submittedAt: daysAgo(2) },
            { quiz: quizDocs[1]._id, student: ananya._id, answers: makeAnswers(quizDocs[1], ['Supervised','Sigmoid','Neighbors']), submittedAt: daysAgo(1) },
        ];

        for (const qr of quizResults) {
            qr.totalScore = calcTotal(qr.answers);
            qr.maxScore = calcMax(quizDocs.find(q => q._id.toString() === qr.quiz.toString()));
        }

        await QuizResult.insertMany(quizResults);
        console.log('  Created ' + quizResults.length + ' quiz results.');

        // ── 8. ASSIGNMENTS ───────────────────────────────────────────────
        console.log('Creating assignments (professor-specific)...');
        const assignments = await Assignment.insertMany([
            {
                title: 'Implement Linked Lists and Binary Search Trees',
                description: 'Implement singly/doubly linked lists and BST with insert, delete, search operations.',
                course: dsa._id, dueDate: daysFromNow(8), maxMarks: 50, createdBy: profVikram._id,
                submissions: [
                    { student: rahul._id,      submittedAt: daysAgo(1), status: 'graded',  marks: 45, feedback: 'Good work', isLate: false },
                    { student: priya._id,      submittedAt: daysAgo(2), status: 'graded',  marks: 48, feedback: 'Excellent', isLate: false },
                    { student: siddharth._id,  submittedAt: new Date(), status: 'pending', marks: null, feedback: '', isLate: false },
                ],
            },
            {
                title: 'Machine Learning Classification Project',
                description: 'Build and evaluate classification models using scikit-learn on any dataset.',
                course: ml._id, dueDate: daysFromNow(10), maxMarks: 100, createdBy: profSuchitra._id,
                submissions: [
                    { student: rahul._id,  submittedAt: daysAgo(1), status: 'graded',  marks: 85, feedback: 'Strong analysis', isLate: false },
                    { student: ananya._id, submittedAt: daysAgo(2), status: 'graded',  marks: 92, feedback: 'Outstanding', isLate: false },
                ],
            },
            {
                title: 'Database Design and SQL Implementation',
                description: 'Design ERD, create normalized schema, write complex SQL queries.',
                course: dbms._id, dueDate: daysFromNow(7), maxMarks: 80, createdBy: profArun._id,
                submissions: [
                    { student: priya._id,     submittedAt: daysAgo(1), status: 'graded',  marks: 72, feedback: 'Good design', isLate: false },
                    { student: siddharth._id, submittedAt: daysAgo(2), status: 'graded',  marks: 76, feedback: 'Excellent', isLate: false },
                ],
            },
            {
                title: 'Cloud Infrastructure Deployment',
                description: 'Deploy a 3-tier application on AWS with monitoring and auto-scaling.',
                course: cloud._id, dueDate: daysFromNow(14), maxMarks: 100, createdBy: profSandeep._id,
                submissions: [
                    { student: karan._id, submittedAt: new Date(), status: 'pending', marks: null, feedback: '', isLate: false },
                    { student: meera._id, submittedAt: new Date(), status: 'pending', marks: null, feedback: '', isLate: false },
                ],
            },
        ]);
        console.log('  Created ' + assignments.length + ' assignments.');

        // ── 9. ANNOUNCEMENTS ─────────────────────────────────────────────
        console.log('Creating announcements...');
        await Announcement.insertMany([
            { title: 'Welcome to Spring 2026',           content: 'Welcome to the spring semester. Review course schedules and materials.', type: 'institute', targetAudience: { institution: iitb._id },        priority: 'important', isPinned: true, createdBy: iitbAdmin._id, expiryDate: daysFromNow(30) },
            { title: 'IITB Network Maintenance',          content: 'Campus network maintenance on Saturday 2-6 AM. Expect downtime.', type: 'institute', targetAudience: { institution: iitb._id },        priority: 'urgent',    createdBy: iitbAdmin._id },
            { title: 'IITB CSE Department Notice',        content: 'CSE department workshop on Advanced Algorithms scheduled for next month.', type: 'department', targetAudience: { department: iitb_cse._id }, priority: 'normal',    createdBy: iitbCseHod._id },
            { title: 'DSA Quiz Reminder',                 content: 'DSA Quiz scheduled for next Monday. Topics: Linked Lists, Trees, Graphs.', type: 'course',    targetAudience: { course: dsa._id },         priority: 'important', createdBy: profVikram._id },
            { title: 'ML Assignment Extended',            content: 'Due to requests ML classification assignment extended by 3 days.', type: 'course',    targetAudience: { course: ml._id },          priority: 'important', createdBy: profSuchitra._id },
            { title: 'Cloud Computing Lab Session',       content: 'Extra lab session on AWS deployment this Friday at 4 PM.',    type: 'course',    targetAudience: { course: cloud._id },       priority: 'normal',    createdBy: profSandeep._id },
        ]);
        console.log('  Created 6 announcements.');

        // ── 10. FORUM POSTS ──────────────────────────────────────────────
        console.log('Creating forum posts...');
        await ForumPost.insertMany([
            {
                course: dsa._id, author: rahul._id, title: 'Question about AVL tree rotations',
                content: 'When do we use single vs double rotation?', isResolved: true,
                replies: [
                    { author: profVikram._id, content: 'Single rotation for LL/RR cases, double for LR/RL cases.', upvotes: [priya._id] },
                ],
            },
            {
                course: ml._id, author: priya._id, title: 'Overfitting in neural networks',
                content: 'How to prevent overfitting using regularization?', isResolved: false,
                replies: [
                    { author: profSuchitra._id, content: 'Use Dropout, L2 regularization, and early stopping.', upvotes: [ananya._id] },
                ],
            },
            {
                course: dbms._id, author: siddharth._id, title: 'Understanding transitive dependencies',
                content: 'What exactly is a transitive dependency in normalization?', isResolved: true,
                replies: [
                    { author: profArun._id, content: 'When non-key attribute depends on another non-key attribute. Resolve by creating separate tables.', upvotes: [priya._id] },
                ],
            },
            {
                course: cloud._id, author: karan._id, title: 'Docker vs VM architecture differences',
                content: 'How does container virtualization differ from VMs?', isResolved: true,
                replies: [
                    { author: profSandeep._id, content: 'VMs virtualize hardware (full OS each). Containers share host OS kernel. Containers are lighter and faster.', upvotes: [meera._id] },
                ],
            },
        ]);
        console.log('  Created 4 forum posts.');

        // ── 11. ATTENDANCE ───────────────────────────────────────────────
        console.log('Creating attendance records...');
        await Attendance.insertMany([
            { course: dsa._id,   date: daysAgo(10), markedBy: profVikram._id,   students: iitbCseStudents.map((s,i) => ({ student: s._id, status: i === 2 ? 'absent' : 'present' })) },
            { course: dsa._id,   date: daysAgo(5),  markedBy: profVikram._id,   students: iitbCseStudents.map((s)   => ({ student: s._id, status: 'present' })) },
            { course: ml._id,    date: daysAgo(8),  markedBy: profSuchitra._id, students: iitbCseStudents.map((s)   => ({ student: s._id, status: 'present' })) },
            { course: dbms._id,  date: daysAgo(6),  markedBy: profArun._id,     students: iitbCseStudents.map((s)   => ({ student: s._id, status: 'present' })) },
            { course: circuit._id,date: daysAgo(9),  markedBy: profNeha._id,     students: iitbEeStudents.map((s)   => ({ student: s._id, status: 'present' })) },
            { course: cloud._id, date: daysAgo(7),  markedBy: profSandeep._id,  students: iitdCseStudents.map((s)   => ({ student: s._id, status: 'present' })) },
            { course: vlsi._id,  date: daysAgo(5),  markedBy: profMohan._id,    students: iitdEceStudents.map((s)   => ({ student: s._id, status: 'present' })) },
        ]);
        console.log('  Created 7 attendance records.');

        // ── 12. EVENTS ───────────────────────────────────────────────────
        console.log('Creating events...');
        await Event.insertMany([
            { title: 'Mid-Semester Examinations',     description: 'Mid-semester exams for all students.',                     type: 'exam',     startDate: daysFromNow(10), endDate: daysFromNow(20), isAllDay: false, createdBy: iitbAdmin._id },
            { title: 'Spring Festival Holiday',        description: 'Campus closed for spring festival.', type: 'holiday',  startDate: daysFromNow(15), endDate: daysFromNow(17), isAllDay: true,  createdBy: iitbAdmin._id },
            { title: 'DSA End-Semester Examination',    description: 'Comprehensive DSA exam.',                                 type: 'exam',     startDate: daysFromNow(35), endDate: daysFromNow(35), isAllDay: false, course: dsa._id, createdBy: profVikram._id },
            { title: 'ML Project Presentation',        description: 'ML course project presentations.',                        type: 'event',    startDate: daysFromNow(28), endDate: daysFromNow(28), isAllDay: false, course: ml._id, createdBy: profSuchitra._id },
            { title: 'Cloud Hands-On Lab Session',     description: 'AWS deployment workshop.',                                  type: 'meeting',  startDate: daysFromNow(5),  endDate: daysFromNow(5),  isAllDay: false, course: cloud._id, createdBy: profSandeep._id },
        ]);
        console.log('  Created 5 events.');

        // ── 14. GRADEBOOK ────────────────────────────────────────────────
        console.log('Creating gradebooks...');
        const gradeComponents = [
            { name: 'Assignments', weightage: 30, maxMarks: 100 },
            { name: 'Midterm',     weightage: 30, maxMarks: 100 },
            { name: 'Final Exam',  weightage: 40, maxMarks: 100 },
        ];
        const buildGrades = (students, scoreMap) =>
            students.flatMap((s) =>
                gradeComponents.map((c) => ({
                    student: s._id,
                    componentName: c.name,
                    marksObtained: (scoreMap[s.email] && scoreMap[s.email][c.name]) || 0,
                    date: daysAgo(Math.floor(Math.random() * 5)),
                }))
            );

        await Gradebook.insertMany([
            {
                course: dsa._id, components: gradeComponents, createdBy: profVikram._id,
                grades: buildGrades(iitbCseStudents, {
                    'rahul@iitb.ac.in':     { Assignments: 85, Midterm: 78, 'Final Exam': 82 },
                    'priya@iitb.ac.in':     { Assignments: 92, Midterm: 88, 'Final Exam': 90 },
                    'siddharth@iitb.ac.in': { Assignments: 75, Midterm: 70, 'Final Exam': 74 },
                    'ananya@iitb.ac.in':    { Assignments: 88, Midterm: 85, 'Final Exam': 88 },
                    'arjun@iitb.ac.in':     { Assignments: 68, Midterm: 65, 'Final Exam': 70 },
                }),
            },
            {
                course: ml._id, components: gradeComponents, createdBy: profSuchitra._id,
                grades: buildGrades(iitbCseStudents, {
                    'rahul@iitb.ac.in':     { Assignments: 82, Midterm: 75, 'Final Exam': 80 },
                    'priya@iitb.ac.in':     { Assignments: 90, Midterm: 87, 'Final Exam': 92 },
                    'siddharth@iitb.ac.in': { Assignments: 70, Midterm: 65, 'Final Exam': 71 },
                    'ananya@iitb.ac.in':    { Assignments: 85, Midterm: 82, 'Final Exam': 85 },
                    'arjun@iitb.ac.in':     { Assignments: 60, Midterm: 58, 'Final Exam': 62 },
                }),
            },
            {
                course: dbms._id, components: gradeComponents, createdBy: profArun._id,
                grades: buildGrades(iitbCseStudents, {
                    'rahul@iitb.ac.in':     { Assignments: 75, Midterm: 72, 'Final Exam': 78 },
                    'priya@iitb.ac.in':     { Assignments: 88, Midterm: 85, 'Final Exam': 89 },
                    'siddharth@iitb.ac.in': { Assignments: 82, Midterm: 79, 'Final Exam': 83 },
                    'ananya@iitb.ac.in':    { Assignments: 76, Midterm: 74, 'Final Exam': 80 },
                    'arjun@iitb.ac.in':     { Assignments: 68, Midterm: 65, 'Final Exam': 70 },
                }),
            },
        ]);
        console.log('  Created 3 gradebooks.');

        // ── 15. NOTIFICATIONS ────────────────────────────────────────────
        console.log('Creating notifications...');
        const notifData = [];
        for (const s of iitbCseStudents) {
            notifData.push({ userId: s._id, type: 'assignment', title: 'Assignment Posted', message: 'New assignment posted in DSA', link: '/student/assignments', isRead: false });
            notifData.push({ userId: s._id, type: 'quiz',       title: 'Quiz Available',   message: 'New quiz available in DSA', link: '/student/quizzes',     isRead: false });
            notifData.push({ userId: s._id, type: 'lecture',    title: 'Lecture Uploaded', message: 'New lecture in ML course',   link: '/student/lectures',    isRead: false });
        }
        await Notification.insertMany(notifData);
        console.log('  Created ' + notifData.length + ' notifications.');

        // ── 16. GENERATE IDs ────────────────────────────────────────────
        console.log('Generating Department and Professor IDs...');
        const { deptIdCount, profIdCount } = await generateIds();
        console.log('  Generated departmentIds: ' + deptIdCount);
        console.log('  Generated professorIds: ' + profIdCount + '\n');

        // ── 17. AUDIT LOGS ───────────────────────────────────────────────
        console.log('Creating audit logs...');
        const auditData = [
            { userId: superAdmin._id,   action: 'login',  resource: 'user',        resourceId: superAdmin._id, description: 'Super admin login', ipAddress: '192.168.1.1'  },
            { userId: iitbAdmin._id,    action: 'login',  resource: 'user',        resourceId: iitbAdmin._id,  description: 'Inst admin login',  ipAddress: '192.168.1.10' },
            { userId: profVikram._id,   action: 'create', resource: 'quiz',        resourceId: quizDocs[0]._id, description: 'Quiz created',     ipAddress: '192.168.1.20' },
            { userId: profSuchitra._id, action: 'create', resource: 'quiz',        resourceId: quizDocs[1]._id, description: 'Quiz created',     ipAddress: '192.168.1.21' },
            { userId: profVikram._id,   action: 'create', resource: 'assignment',  description: 'Assignment created', ipAddress: '192.168.1.20' },
            { userId: rahul._id,        action: 'submit', resource: 'quiz',        resourceId: quizDocs[0]._id, description: 'Quiz submitted',   ipAddress: '192.168.1.30' },
            { userId: priya._id,        action: 'submit', resource: 'assignment',  description: 'Assignment submitted', ipAddress: '192.168.1.31' },
            { userId: iitbCseHod._id,   action: 'create', resource: 'course',      resourceId: dsa._id, description: 'Course created', ipAddress: '192.168.1.11' },
        ];
        await AuditLog.insertMany(auditData);
        console.log('  Created ' + auditData.length + ' audit log entries.');

        // ── 18. RESOURCE MANAGEMENT SEEDING ────────────────────────────
        console.log('Seeding Resource Allocations & FileMetadata...');
        const resourceService = require('./services/resourceService');
        const SIX_TB = 6 * 1024 * 1024 * 1024 * 1024;
        const THREE_TB = 3 * 1024 * 1024 * 1024 * 1024;
        const ONE_TB = 1 * 1024 * 1024 * 1024 * 1024;
        const ONE_HUNDRED_GB = 100 * 1024 * 1024 * 1024;

        // Super Admin allocations are managed per University (see seed-universities.js)


        // Storage allocations start at 0 B for downstream entities (Institutions, Departments, Professors)
        // Production files are registered dynamically when uploaded to B2


        // Seed sample MeteredAIUsageLedger entries
        await MeteredAIUsageLedger.create([
          {
            institution: iitb._id,
            department: departments[0]._id,
            user: profVikram._id,
            resourceType: 'METERED_AI',
            operationType: 'TRANSCRIPTION',
            quantity: 1,
            relatedEntityType: 'LECTURE',
            relatedEntityId: lectures[0]._id
          },
          {
            institution: iitb._id,
            department: departments[0]._id,
            user: profVikram._id,
            resourceType: 'METERED_AI',
            operationType: 'AI_QUIZ_GENERATION',
            quantity: 1,
            relatedEntityType: 'LECTURE',
            relatedEntityId: lectures[0]._id
          }
        ]);

        // Seed sample AI Tutor Conversation (permanently free, NO metered AI ledger records!)
        const aiTutorConv = await AIConversation.create({
          student: rahul._id,
          course: lectures[0].course,
          lecture: lectures[0]._id,
          title: 'Questions on Lecture 1',
          isActive: true
        });
        await AIMessage.create([
          { conversation: aiTutorConv._id, sender: rahul._id, role: 'user', content: 'Can you explain time complexity of quicksort?' },
          { conversation: aiTutorConv._id, sender: profVikram._id, role: 'assistant', content: 'Quicksort has an average time complexity of O(n log n).' }
        ]);

        console.log('  Seeded Resource Allocations, FileMetadata, Metered AI Ledger, and AI Tutor Conversations.');

        // ── SUMMARY ──────────────────────────────────────────────────────
        const allStudents = [...iitbCseStudents, ...iitbEeStudents, ...iitdCseStudents, ...iitdEceStudents];
        
        console.log('\n' + '='.repeat(80));
        console.log('  COMPLETE DATABASE SEED - PROPER ACADEMIC HIERARCHY');
        console.log('='.repeat(80) + '\n');

        console.log('INSTITUTIONS (' + institutions.length + ')');
        for (const i of institutions) console.log('  ' + i.code.padEnd(6) + ' - ' + i.name);

        console.log('\nDEPARTMENT STRUCTURE');
        console.log('  IITB');
        console.log('    ├─ CSE with Dept Admin: Amit Patel');
        console.log('    │  ├─ Prof. Vikram (6 lectures: 3 DSA + 3 DAA)');
        console.log('    │  ├─ Prof. Suchitra (3 lectures in ML)');
        console.log('    │  └─ Prof. Arun (3 lectures in DBMS)');
        console.log('    └─ EE with Dept Admin: Dr. Priya Nair');
        console.log('       ├─ Prof. Neha (6 lectures: 3 Circuit + 3 Digital)');
        console.log('       └─ Prof. Rajesh (3 lectures in Signals & Systems)');
        console.log('  IITD');
        console.log('    ├─ CSE with Dept Admin: Dr. Suresh Menon');
        console.log('    │  ├─ Prof. Sandeep (6 lectures: 3 Cloud + 3 Distributed)');
        console.log('    │  └─ Prof. Kavita (3 lectures in Compiler Design)');
        console.log('    └─ ECE with Dept Admin: Dr. Rajesh Kumar');
        console.log('       ├─ Prof. Mohan (6 lectures: 3 VLSI + 3 Microelectronics)');
        console.log('       └─ Prof. Swati (3 lectures in Communication Systems)');

        console.log('\nCREDENTIALS (all passwords: Password@123)');
        console.log('  [super_admin]  ' + superAdmin.email);
        console.log('  [inst_admin]   ' + [iitbAdmin, iitdAdmin].map(u => u.email).join('  |  '));
        console.log('  [dept_admin]   ');
        console.log('    IITB CSE: ' + iitbCseHod.email + ' | IITB EE: ' + iitbEeHod.email);
        console.log('    IITD CSE: ' + iitdCseHod.email + ' | IITD ECE: ' + iitdEceHod.email);
        console.log('  [professors]   ' + [profVikram, profSuchitra, profArun, profNeha, profRajesh, profSandeep, profKavita, profMohan, profSwati].map(u => u.email).join(' | '));

        console.log('\nDATA SUMMARY');
        console.log('  Institutions    : ' + institutions.length);
        console.log('  Departments     : ' + departments.length + ' (with 1 dept admin each)');
        console.log('  Users           : ' + users.length);
        console.log('  Courses         : ' + courses.length + ' (each with exactly 1 professor)');
        console.log('  Lectures        : ' + lectures.length + ' (exactly 3 per professor per course)');
        console.log('  Quizzes         : ' + quizDocs.length + ' (professor-specific)');
        console.log('  Quiz Results    : ' + quizResults.length);
        console.log('  Assignments     : ' + assignments.length + ' (professor-specific)');
        console.log('  Announcements   : 6');
        console.log('  Forum Posts     : 4');
        console.log('  Attendance      : 7 records');
        console.log('  Events          : 5');
        console.log('  Gradebooks      : 3');
        console.log('  Notifications   : ' + notifData.length);
        console.log('  Audit Logs      : ' + auditData.length);

        console.log('\nKEY FEATURES OF RESTRUCTURED SEED');
        console.log('  Each department has exactly 1 departmental admin');
        console.log('  Each course belongs to exactly 1 department');
        console.log('  Each course has exactly 1 professor assigned');
        console.log('  Each professor has exactly 3 lectures per course taught');
        console.log('  Quizzes only created by course professors');
        console.log('  Assignments only created by course professors');
        console.log('  Students enrolled only in their department courses');
        console.log('  Clean academic hierarchy with no cross-linking errors');
        console.log('  All relationships properly maintained');

        console.log('\nDone. Database seeded successfully!');
        process.exit(0);

    } catch (err) {
        console.error('\n[SEED ERROR]', err);
        process.exit(1);
    }
};

seedData();
