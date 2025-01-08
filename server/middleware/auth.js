const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Access token required' });

    jwt.verify(token, 'secret_key', (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid token' });

        console.log('Decoded user from token:', user); // Debugging line
        req.user = user; // Attach user payload (includes `id` and `role`)
        next();
    });
};

module.exports = authenticateToken;