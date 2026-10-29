const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const connectDB = require('./config/db');
const { initRedis } = require('./services/cache');

// Import routes
const authRoutes = require('./routes/auth');
const lectureRoutes = require('./routes/lectures');
const quizRoutes = require('./routes/quizzes');
const quizResultsRoutes = require('./routes/quizResults');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const courseRoutes = require('./routes/courses');
const attendanceRoutes = require('./routes/attendance');
const assignmentRoutes = require('./routes/assignments');
const gradebookRoutes = require('./routes/gradebook');
const notificationRoutes = require('./routes/notifications');
const announcementRoutes = require('./routes/announcements');
const forumRoutes = require('./routes/forum');
const eventRoutes = require('./routes/events');
const analyticsRoutes = require('./routes/analytics');
const bulkRoutes = require('./routes/bulk');
const exportRoutes = require('./routes/export');
const auditLogRoutes = require('./routes/auditLogs');
const transcriptRoutes = require('./routes/transcripts');
const aiAssistantRoutes = require('./routes/aiAssistantRoutes');
const resourceRoutes = require('./routes/resources');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const { performanceMonitor, getMetrics } = require('./middleware/performanceMonitor');
const userRateLimit = require('./middleware/userRateLimit');

const app = express();

// Connect to MongoDB
connectDB();

// Try to connect to Redis (non-blocking, graceful fallback)
initRedis().catch(() => console.log('Running without Redis cache'));

// HTTP request logging
const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat));

// Security middleware
app.use(helmet());
app.use(mongoSanitize());

// Performance monitoring
app.use(performanceMonitor);

// CORS - MUST BE BEFORE rate limiting to allow preflight OPTIONS requests
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
}));

// Global rate limiting - AFTER CORS
// More lenient in development to allow UI testing
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 200 : 1000, // 200 in prod, 1000 in dev
  message: { message: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running', timestamp: new Date().toISOString() });
});

// Performance metrics endpoint (admin - protected)
const auth = require('./middleware/auth');
const roleCheck = require('./middleware/roleCheck');
app.get('/api/metrics/performance', auth, roleCheck('inst_admin', 'super_admin'), getMetrics);

// API Routes - Core
app.use('/api/auth', authRoutes);
app.use('/api/lectures', lectureRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/quiz-results', quizResultsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/courses', courseRoutes);

const academicLifecycleRoutes = require('./routes/academicLifecycle');
const enrollmentRoutes = require('./routes/enrollments');

app.use('/api/attendance', attendanceRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/gradebook', gradebookRoutes);
app.use('/api/academic-lifecycle', academicLifecycleRoutes);
app.use('/api/enrollments', enrollmentRoutes);

// API Routes - Phase 3: Communication
app.use('/api/notifications', notificationRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/forum', forumRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/transcripts', transcriptRoutes);

// API Routes - Phase 4: Admin & Operations
app.use('/api/analytics', analyticsRoutes);
app.use('/api/bulk', bulkRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/ai-assistant', aiAssistantRoutes);
app.use('/api/resources', resourceRoutes);

// Handle 404
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  try {
    const { recoverStaleAudioGenerations } = require('./services/audioSynthesisService');
    recoverStaleAudioGenerations().catch(err => console.error('[Server Startup Recovery] Error:', err.message));
  } catch (e) {}
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the existing process or change PORT in backend/.env.`);
    process.exit(1);
  }

  console.error('Server failed to start:', error.message);
  process.exit(1);
});

module.exports = app;
