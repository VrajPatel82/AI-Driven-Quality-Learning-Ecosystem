const mongoose = require('mongoose');
require('dotenv').config();

const University = require('./models/University');
const Institution = require('./models/Institution');
const Department = require('./models/Department');
const User = require('./models/User');
const ResourceAllocation = require('./models/ResourceAllocation');

async function seedUniversities() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lecture-system');
    console.log('Connected to MongoDB');

    // 1. Primary University: IIT Bombay
    let iitb = await University.findOne({ code: 'IITB' });
    if (!iitb) {
      iitb = await University.create({
        name: 'Indian Institute of Technology Bombay',
        code: 'IITB',
        state: 'Maharashtra',
        address: 'Powai, Mumbai, Maharashtra 400076',
        contactEmail: 'director@iitb.ac.in',
        contactPhone: '+91 22 2572 2545',
        status: 'active'
      });
      console.log('Created University: IITB');
    } else {
      console.log('Found University: IITB');
    }

    // 2. Secondary University for Scope Isolation Testing: DTU
    let dtu = await University.findOne({ code: 'DTU' });
    if (!dtu) {
      dtu = await University.create({
        name: 'Delhi Technological University',
        code: 'DTU',
        state: 'Delhi',
        address: 'Shahbad Daulatpur, Main Bawana Road, Delhi 110042',
        contactEmail: 'vice-chancellor@dtu.ac.in',
        contactPhone: '+91 11 2787 1018',
        status: 'active'
      });
      console.log('Created University: DTU');
    } else {
      console.log('Found University: DTU');
    }

    // 3. Associate existing institutions with IITB if unassigned
    const unassignedInstitutions = await Institution.find({
      $or: [{ university: null }, { university: { $exists: false } }]
    });

    for (const inst of unassignedInstitutions) {
      inst.university = iitb._id;
      await inst.save();
      console.log(`Linked institution "${inst.name}" (${inst.code}) -> IITB`);
    }

    // 4. Ensure DTU has its own institution, department, and student for multi-tenant isolation tests
    let dtuInst = await Institution.findOne({ code: 'DTU-MAIN' });
    if (!dtuInst) {
      dtuInst = await Institution.create({
        name: 'DTU Main Campus',
        code: 'DTU-MAIN',
        address: 'Main Bawana Road, Delhi',
        university: dtu._id
      });
      console.log('Created Institution for DTU');
    }

    let dtuDept = await Department.findOne({ code: 'IT', institution: dtuInst._id });
    if (!dtuDept) {
      dtuDept = await Department.create({
        name: 'Information Technology',
        code: 'IT',
        departmentId: 'DTU-IT-001',
        institution: dtuInst._id
      });
      console.log('Created Department for DTU');
    }

    let dtuStudent = await User.findOne({ email: 'student.dtu@dtu.ac.in' });
    if (!dtuStudent) {
      dtuStudent = await User.create({
        name: 'Rohan Sharma',
        email: 'student.dtu@dtu.ac.in',
        password: 'Password@123',
        role: 'student',
        university: dtu._id,
        institution: dtuInst._id,
        department: dtuDept._id,
        currentSemester: 3,
        division: 'A',
        enrollmentNumber: 'DTU-IT-001'
      });
      console.log('Created Student for DTU: Rohan Sharma');
    }

    // 5. Update demo users to link them to IITB
    const uniAdmin = await User.findOne({ email: 'uni.admin@iitb.ac.in' });
    if (uniAdmin) {
      uniAdmin.university = iitb._id;
      await uniAdmin.save();
      console.log('Linked uni.admin@iitb.ac.in to IITB');
    }

    const instAdmin = await User.findOne({ email: 'admin@iitb.ac.in' });
    if (instAdmin) {
      instAdmin.university = iitb._id;
      await instAdmin.save();
      console.log('Linked admin@iitb.ac.in to IITB');
    }

    const acadAdmin = await User.findOne({ email: 'acad.cse@iitb.ac.in' });
    if (acadAdmin) {
      acadAdmin.university = iitb._id;
      await acadAdmin.save();
      console.log('Linked acad.cse@iitb.ac.in to IITB');
    }

    // Link all students and professors with an IITB institution to IITB
    const iitbInstitutions = await Institution.find({ university: iitb._id }).select('_id');
    const iitbInstIds = iitbInstitutions.map(i => i._id);

    const updateResult = await User.updateMany(
      { institution: { $in: iitbInstIds }, university: { $ne: iitb._id } },
      { $set: { university: iitb._id } }
    );
    console.log(`Synchronized ${updateResult.modifiedCount} users to IITB university scope`);

    // 6. Seed Storage Allocation: Super Admin -> IITB (5 GB)
    const gbInBytes = 1024 * 1024 * 1024;
    let iitbAlloc = await ResourceAllocation.findOne({
      resourceType: 'STORAGE',
      parentLevel: 'SUPER_ADMIN',
      childLevel: 'UNIVERSITY',
      childId: iitb._id
    });
    if (!iitbAlloc) {
      await ResourceAllocation.create({
        resourceType: 'STORAGE',
        parentLevel: 'SUPER_ADMIN',
        parentId: null,
        childLevel: 'UNIVERSITY',
        childId: iitb._id,
        allocatedAmount: 5 * gbInBytes
      });
      console.log('Allocated 5 GB Storage from Super Admin to IITB');
    }

    console.log('\nDatabase migration and seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error in seedUniversities:', err);
    process.exit(1);
  }
}

seedUniversities();
