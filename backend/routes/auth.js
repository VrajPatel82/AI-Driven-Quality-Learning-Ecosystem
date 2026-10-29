const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { register, login, getProfile, updateProfile, changePassword } = require('../controllers/authController');
const auth = require('../middleware/auth');

// @route   POST /api/auth/register
router.post('/register', [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').notEmpty().withMessage('Name is required')
], register);

// @route   POST /api/auth/login
router.post('/login', [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required')
], login);

// @route   GET /api/auth/profile
router.get('/profile', auth, getProfile);

// @route   PUT /api/auth/profile
router.put('/profile', auth, updateProfile);

// @route   PUT /api/auth/change-password
router.put('/change-password', auth, changePassword);

module.exports = router;
