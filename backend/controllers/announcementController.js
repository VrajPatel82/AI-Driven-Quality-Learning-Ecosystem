const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { paginate } = require('../utils/pagination');

// @desc    Create announcement
// @route   POST /api/announcements
exports.createAnnouncement = async (req, res, next) => {
  try {
    const { title, content, type, targetAudience, priority, isPinned, expiryDate } = req.body;

    const announcement = await Announcement.create({
      title,
      content,
      type: type || 'institute',
      targetAudience: targetAudience || {},
      priority: priority || 'normal',
      isPinned: isPinned || false,
      expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      createdBy: req.user._id
    });

    // Auto-notify relevant users (both professors and students)
    try {
      let userFilter = {};
      if (type === 'department' && targetAudience?.department) {
        userFilter.department = targetAudience.department;
      } else if (type === 'course') {
        // Course-level announcements notify enrolled students (simplified)
      } else {
        // Institute-level: only notify users from the creator's institution
        if (req.user.institution) {
          userFilter.institution = req.user.institution;
        }
      }

      const users = await User.find(userFilter).select('_id');
      const userIds = new Set(users.map(u => u._id.toString()));
      if (req.user?._id) {
        userIds.add(req.user._id.toString());
      }

      const notifications = Array.from(userIds).map(userId => ({
        userId,
        type: 'announcement',
        title: title,
        message: content.substring(0, 200),
        link: '/announcements',
        relatedResource: announcement._id,
        createdByUser: req.user._id
      }));

      if (notifications.length) {
        await Notification.insertMany(notifications);
      }
    } catch (err) {
      console.error('Failed to send announcement notifications:', err.message);
    }

    await announcement.populate('createdBy', 'name email');
    res.status(201).json({ announcement, message: 'Announcement created successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get announcements relevant to user
// @route   GET /api/announcements/my
exports.getMyAnnouncements = async (req, res, next) => {
  try {
    const { page, limit, priority } = req.query;

    // Build filter based on user's context
    const filter = {
      $or: [
        { type: 'institute' },
        { type: 'department', 'targetAudience.department': req.user.department },
        { type: 'course' }
      ],
      $and: [
        { $or: [{ expiryDate: { $gte: new Date() } }, { expiryDate: null }, { expiryDate: { $exists: false } }] }
      ]
    };

    if (priority) filter.priority = priority;

    const result = await paginate(Announcement, filter, {
      page,
      limit,
      sort: { isPinned: -1, createdAt: -1 }
    }, [
      { path: 'createdBy', select: 'name' }
    ]);

    res.json({
      data: result.data,
      pagination: { total: result.pagination.totalItems, ...result.pagination }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all announcements (admin)
// @route   GET /api/announcements
exports.getAllAnnouncements = async (req, res, next) => {
  try {
    const { page, limit, type, priority } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (priority) filter.priority = priority;

    const result = await paginate(Announcement, filter, {
      page, limit, sort: { createdAt: -1 }
    }, [
      { path: 'createdBy', select: 'name email' }
    ]);

    res.json({
      data: result.data,
      pagination: { total: result.pagination.totalItems, ...result.pagination }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete announcement
// @route   DELETE /api/announcements/:id
exports.deleteAnnouncement = async (req, res, next) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ message: 'Not found' });

    if (announcement.createdBy.toString() !== req.user._id.toString() &&
        !['dept_admin', 'inst_admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await Announcement.findByIdAndDelete(req.params.id);

    // Cascade delete any notifications linked to this announcement
    await Notification.deleteMany({
      $or: [
        { relatedResource: req.params.id },
        { type: 'announcement', relatedResource: req.params.id },
        { type: 'announcement', title: announcement.title }
      ]
    });

    res.json({ message: 'Announcement deleted' });
  } catch (error) {
    next(error);
  }
};
