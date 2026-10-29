const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.query?.token;

    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const isMediaRoute = Boolean(
      req.originalUrl?.includes('/api/resources/storage/object/') ||
      req.path?.includes('/storage/object/') ||
      req.baseUrl?.includes('/storage/object/')
    );

    if (isMediaRoute) {
      // Media streaming route requires a token specifically generated for media streaming
      if (decoded.purpose !== 'media_stream') {
        return res.status(401).json({ message: 'Token is not valid for media streaming' });
      }
    } else {
      // Non-media API routes must NOT accept media streaming tokens
      if (decoded.purpose === 'media_stream') {
        return res.status(401).json({ message: 'Media stream token cannot be used for API access' });
      }
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = auth;

