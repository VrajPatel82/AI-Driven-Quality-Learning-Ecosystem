const User = require('../models/User');
const path = require('path');
const { recordCriticalEvent } = require('../services/auditService');

// @desc    Bulk create users from JSON array
// @route   POST /api/bulk/users
exports.bulkCreateUsers = async (req, res, next) => {
  try {
    const { users } = req.body;

    if (!users || !users.length) {
      return res.status(400).json({ message: 'Users array is required' });
    }

    if (users.length > 500) {
      return res.status(400).json({ message: 'Maximum 500 users per batch' });
    }

    // Validate all entries first
    const errors = [];
    const validUsers = [];
    const existingEmails = new Set(
      (await User.find({ email: { $in: users.map(u => u.email) } }).select('email')).map(u => u.email)
    );

    users.forEach((user, index) => {
      const rowErrors = [];
      if (!user.email) rowErrors.push('Email is required');
      if (!user.name) rowErrors.push('Name is required');
      if (!user.password || user.password.length < 6) rowErrors.push('Password must be at least 6 characters');
      if (existingEmails.has(user.email)) rowErrors.push(`Email ${user.email} already exists`);

      if (rowErrors.length) {
        errors.push({ row: index + 1, email: user.email, errors: rowErrors });
      } else {
        validUsers.push({
          email: user.email.toLowerCase().trim(),
          name: user.name.trim(),
          password: user.password,
          role: user.role || 'student',
          institution: user.institution || undefined,
          department: user.department || undefined
        });
      }
    });

    if (errors.length && validUsers.length === 0) {
      return res.status(400).json({ message: 'All entries have errors', errors, created: 0 });
    }

    // Insert valid users
    const created = [];
    for (const userData of validUsers) {
      try {
        const user = await User.create(userData);
        created.push({ email: user.email, name: user.name, id: user._id });
      } catch (err) {
        errors.push({ email: userData.email, errors: [err.message] });
      }
    }

    if (created.length > 0) {
      recordCriticalEvent({
        actor: req.user,
        eventFamily: 'BULK',
        severity: 'HIGH',
        action: 'bulk_operation',
        resource: 'user',
        description: `Bulk user creation: ${created.length} users created (${errors.length} failed)`,
        changes: { createdCount: created.length, failedCount: errors.length, targetResource: 'user' },
        ipAddress: req.ip || '',
        userAgent: req.headers ? (req.headers['user-agent'] || '') : '',
        university: req.user.university,
        eventScope: req.user.role === 'super_admin' ? 'PLATFORM' : 'UNIVERSITY'
      }).catch(() => {});
    }

    res.status(201).json({
      message: `${created.length} users created, ${errors.length} errors`,
      created: created.length,
      failed: errors.length,
      errors: errors.length ? errors : undefined,
      users: created
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk delete users
// @route   DELETE /api/bulk/users
exports.bulkDeleteUsers = async (req, res, next) => {
  try {
    const { userIds } = req.body;

    if (!userIds || !userIds.length) {
      return res.status(400).json({ message: 'User IDs array is required' });
    }

    // Don't delete the requesting user
    const filteredIds = userIds.filter(id => id !== req.user._id.toString());

    const result = await User.deleteMany({ _id: { $in: filteredIds } });

    if (result.deletedCount > 0) {
      recordCriticalEvent({
        actor: req.user,
        eventFamily: 'DESTRUCTIVE',
        severity: 'CRITICAL',
        action: 'destructive_operation',
        resource: 'user',
        description: `Massive bulk user deletion: ${result.deletedCount} user accounts purged from system`,
        changes: { deletedCount: result.deletedCount, targetResource: 'user' },
        ipAddress: req.ip || '',
        userAgent: req.headers ? (req.headers['user-agent'] || '') : '',
        university: req.user.university,
        eventScope: req.user.role === 'super_admin' ? 'PLATFORM' : 'UNIVERSITY'
      }).catch(() => {});
    }

    res.json({
      message: `${result.deletedCount} users deleted`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Parse CSV text and return users array
// @route   POST /api/bulk/users/parse-csv
exports.parseCsvUsers = async (req, res, next) => {
  try {
    const { csvText } = req.body;

    if (!csvText) {
      return res.status(400).json({ message: 'CSV text is required' });
    }

    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    const requiredHeaders = ['name', 'email', 'password'];
    const missing = requiredHeaders.filter(h => !headers.includes(h));
    if (missing.length) {
      return res.status(400).json({ message: `Missing required columns: ${missing.join(', ')}` });
    }

    const users = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length < headers.length) continue;

      const user = {};
      headers.forEach((header, idx) => {
        user[header] = values[idx];
      });
      users.push(user);
    }

    res.json({ users, count: users.length });
  } catch (error) {
    next(error);
  }
};
