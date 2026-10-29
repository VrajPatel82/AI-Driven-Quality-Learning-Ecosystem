const ForumPost = require('../models/ForumPost');
const { paginate } = require('../utils/pagination');

// @desc    Create forum post
// @route   POST /api/forum/posts
exports.createPost = async (req, res, next) => {
  try {
    const { course, title, content } = req.body;

    const post = await ForumPost.create({
      course,
      author: req.user._id,
      title,
      content
    });

    await post.populate('author', 'name email role');
    await post.populate('course', 'name code');

    res.status(201).json({ post, message: 'Discussion post created' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get posts for a course
// @route   GET /api/forum/posts?course=id&search=keyword&filter=resolved|unresolved|mine
exports.getPosts = async (req, res, next) => {
  try {
    const { course, search, filter: postFilter, page, limit, technical, escalated } = req.query;
    const queryFilter = {};

    if (course) {
      const courseIds = course.split(',').map(id => id.trim());
      queryFilter.course = courseIds.length === 1 ? courseIds[0] : { $in: courseIds };
    }
    if (search) {
      queryFilter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }
    if (postFilter === 'resolved') queryFilter.isResolved = true;
    if (postFilter === 'unresolved') queryFilter.isResolved = false;
    if (postFilter === 'mine') queryFilter.author = req.user._id;
    
    // Filter by technical issues (for departmental admin)
    if (technical === 'true') queryFilter.isTechnical = true;
    
    // Filter by escalated issues (for institutional admin)
    if (escalated === 'true') queryFilter.isEscalated = true;

    const result = await paginate(ForumPost, queryFilter, { page, limit }, [
      { path: 'author', select: 'name email role' },
      { path: 'course', select: 'name code' },
      { path: 'escalatedBy', select: 'name' }
    ]);

    // Add reply count without returning all reply data
    const posts = result.data.map(p => {
      const obj = p.toObject();
      obj.replyCount = obj.replies?.length || 0;
      delete obj.replies; // Don't return replies in list view
      return obj;
    });

    res.json({
      data: posts,
      pagination: { total: result.pagination.totalItems, ...result.pagination }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single post with replies
// @route   GET /api/forum/posts/:id
exports.getPost = async (req, res, next) => {
  try {
    const post = await ForumPost.findById(req.params.id)
      .populate('author', 'name email role')
      .populate('course', 'name code')
      .populate('replies.author', 'name email role');

    if (!post) return res.status(404).json({ message: 'Post not found' });

    res.json({ post });
  } catch (error) {
    next(error);
  }
};

// @desc    Reply to a post
// @route   POST /api/forum/posts/:id/reply
exports.replyToPost = async (req, res, next) => {
  try {
    const { content } = req.body;
    const post = await ForumPost.findById(req.params.id);

    if (!post) return res.status(404).json({ message: 'Post not found' });

    post.replies.push({
      author: req.user._id,
      content
    });

    await post.save();
    await post.populate('replies.author', 'name email role');

    res.status(201).json({
      reply: post.replies[post.replies.length - 1],
      message: 'Reply added'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle resolve post
// @route   PUT /api/forum/posts/:id/resolve
exports.toggleResolve = async (req, res, next) => {
  try {
    const post = await ForumPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    // Only author or professor/admin can resolve
    if (post.author.toString() !== req.user._id.toString() &&
        !['professor', 'dept_admin', 'inst_admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    post.isResolved = !post.isResolved;
    await post.save();

    res.json({ isResolved: post.isResolved, message: post.isResolved ? 'Marked as resolved' : 'Marked as unresolved' });
  } catch (error) {
    next(error);
  }
};

// @desc    Upvote a reply
// @route   PUT /api/forum/posts/:postId/replies/:replyId/upvote
exports.upvoteReply = async (req, res, next) => {
  try {
    const post = await ForumPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const reply = post.replies.id(req.params.replyId);
    if (!reply) return res.status(404).json({ message: 'Reply not found' });

    const userIdx = reply.upvotes.findIndex(id => id.toString() === req.user._id.toString());
    if (userIdx >= 0) {
      reply.upvotes.splice(userIdx, 1); // Remove upvote
    } else {
      reply.upvotes.push(req.user._id); // Add upvote
    }

    await post.save();
    res.json({ upvoteCount: reply.upvotes.length });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete forum post
// @route   DELETE /api/forum/posts/:id
exports.deletePost = async (req, res, next) => {
  try {
    const post = await ForumPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    if (post.author.toString() !== req.user._id.toString() &&
        !['dept_admin', 'inst_admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await ForumPost.findByIdAndDelete(req.params.id);
    res.json({ message: 'Post deleted' });
  } catch (error) {
    next(error);
  }
};
