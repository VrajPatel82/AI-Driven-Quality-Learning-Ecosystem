const express = require('express');
const router = express.Router();
const {
  createPost,
  getPosts,
  getPost,
  replyToPost,
  toggleResolve,
  upvoteReply,
  deletePost
} = require('../controllers/forumController');
const auth = require('../middleware/auth');

router.use(auth);

// Get all posts (with filters)
router.get('/posts', getPosts);

// Get single post
router.get('/posts/:id', getPost);

// Create post
router.post('/posts', createPost);

// Reply to post
router.post('/posts/:id/reply', replyToPost);

// Toggle resolve status
router.put('/posts/:id/resolve', toggleResolve);

// Upvote a reply
router.put('/posts/:postId/replies/:replyId/upvote', upvoteReply);

// Delete post
router.delete('/posts/:id', deletePost);

module.exports = router;
