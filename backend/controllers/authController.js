const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const { trackFailedLogin } = require('../services/auditService');

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// @desc    Register user
// @route   POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { email, password, name, role, institution, department, currentSemester } = req.body;

    // Only allow self-registration as student or professor
    const allowedSelfRegRoles = ['student', 'professor'];
    const userRole = role && allowedSelfRegRoles.includes(role) ? role : 'student';

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const userData = {
      email,
      password,
      name,
      role: userRole,
      institution,
      department
    };

    // Add currentSemester for students
    if (userRole === 'student' && currentSemester) {
      userData.currentSemester = Math.min(8, Math.max(1, parseInt(currentSemester)));
    }

    const user = await User.create(userData);

    // Populate institution, department, and university for the response
    await user.populate({
      path: 'institution',
      select: 'name code university',
      populate: { path: 'university', select: 'name code state' }
    });
    await user.populate({
      path: 'department',
      select: 'name code institution',
      populate: {
        path: 'institution',
        select: 'name code university',
        populate: { path: 'university', select: 'name code state' }
      }
    });

    const userObj = user.toObject();
    const resolvedUniversity = userObj.university ||
      userObj.institution?.university ||
      userObj.department?.institution?.university || null;
    const resolvedInstitution = userObj.institution ||
      userObj.department?.institution || null;

    if (resolvedUniversity && !user.university) {
      user.university = resolvedUniversity._id;
      await user.save().catch(() => {});
    }

    const token = generateToken(user._id);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        university: resolvedUniversity,
        institution: resolvedInstitution,
        department: user.department,
        currentSemester: user.currentSemester
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user and include password
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      trackFailedLogin(email, req.ip, req.headers['user-agent']).catch(() => {});
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      trackFailedLogin(email, req.ip, req.headers['user-agent'], user._id).catch(() => {});
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Populate university, institution, department, and courses with deep hierarchy
    const populatedUser = await User.findById(user._id)
      .populate('university', 'name code state')
      .populate({
        path: 'institution',
        select: 'name code university',
        populate: { path: 'university', select: 'name code state' }
      })
      .populate({
        path: 'department',
        select: 'name code institution',
        populate: {
          path: 'institution',
          select: 'name code university',
          populate: { path: 'university', select: 'name code state' }
        }
      })
      .populate('courses', '_id name code');

    const resolvedUniversity = populatedUser.university ||
      populatedUser.institution?.university ||
      populatedUser.department?.institution?.university || null;

    const resolvedInstitution = populatedUser.institution ||
      populatedUser.department?.institution || null;

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: populatedUser._id,
        name: populatedUser.name,
        email: populatedUser.email,
        personalEmail: populatedUser.personalEmail || '',
        enrollmentNumber: populatedUser.enrollmentNumber || '',
        role: populatedUser.role,
        university: resolvedUniversity,
        institution: resolvedInstitution,
        department: populatedUser.department,
        courses: populatedUser.courses || [],
        currentSemester: populatedUser.currentSemester,
        division: populatedUser.division || ''
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/profile
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('university', 'name code state')
      .populate({
        path: 'institution',
        select: 'name code university',
        populate: { path: 'university', select: 'name code state' }
      })
      .populate({
        path: 'department',
        select: 'name code institution',
        populate: {
          path: 'institution',
          select: 'name code university',
          populate: { path: 'university', select: 'name code state' }
        }
      })
      .populate('courses', '_id name code');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userObj = user.toObject();
    if (!userObj.university) {
      if (userObj.institution?.university) {
        userObj.university = userObj.institution.university;
      } else if (userObj.department?.institution?.university) {
        userObj.university = userObj.department.institution.university;
      }
    }
    if (!userObj.institution && userObj.department?.institution) {
      userObj.institution = userObj.department.institution;
    }

    res.json({ user: userObj });
  } catch (error) {
    next(error);
  }
};

// @desc    Update profile
// @route   PUT /api/auth/profile
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone, bio } = req.body;
    const updateData = {};
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (bio !== undefined) updateData.bio = bio;
    
    // NOTE: currentSemester can only be updated by departmental admins via /api/users/:id/update-semester route
    // Students cannot change their own semester

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('university', 'name code state')
      .populate({
        path: 'institution',
        select: 'name code university',
        populate: { path: 'university', select: 'name code state' }
      })
      .populate({
        path: 'department',
        select: 'name code institution',
        populate: {
          path: 'institution',
          select: 'name code university',
          populate: { path: 'university', select: 'name code state' }
        }
      })
      .populate('courses', '_id name code');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updatedUserObj = updatedUser.toObject();
    if (!updatedUserObj.university) {
      if (updatedUserObj.institution?.university) {
        updatedUserObj.university = updatedUserObj.institution.university;
      } else if (updatedUserObj.department?.institution?.university) {
        updatedUserObj.university = updatedUserObj.department.institution.university;
      }
    }
    if (!updatedUserObj.institution && updatedUserObj.department?.institution) {
      updatedUserObj.institution = updatedUserObj.department.institution;
    }

    res.json({ user: updatedUserObj });
  } catch (error) {
    next(error);
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
};
