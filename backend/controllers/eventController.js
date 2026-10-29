const Event = require('../models/Event');

// @desc    Create event
// @route   POST /api/events
exports.createEvent = async (req, res, next) => {
  try {
    const event = await Event.create({
      ...req.body,
      createdBy: req.user._id
    });

    res.status(201).json({ event, message: 'Event created successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get events in date range
// @route   GET /api/events?from=date&to=date&type=exam&course=id
exports.getEvents = async (req, res, next) => {
  try {
    const { from, to, type, course, department } = req.query;
    const filter = {};

    if (from || to) {
      filter.startDate = {};
      if (from) filter.startDate.$gte = new Date(from);
      if (to) filter.startDate.$lte = new Date(to);
    }
    if (type) filter.type = type;
    if (course) {
      const courseIds = course.split(',').map(id => id.trim());
      filter.course = courseIds.length === 1 ? courseIds[0] : { $in: courseIds };
    }
    if (department) filter.department = department;

    const events = await Event.find(filter)
      .populate('course', 'name code')
      .populate('department', 'name code')
      .populate('createdBy', 'name')
      .sort({ startDate: 1 });

    res.json({ data: events });
  } catch (error) {
    next(error);
  }
};

// @desc    Update event
// @route   PUT /api/events/:id
exports.updateEvent = async (req, res, next) => {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json({ event, message: 'Event updated successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete event
// @route   DELETE /api/events/:id
exports.deleteEvent = async (req, res, next) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    next(error);
  }
};
