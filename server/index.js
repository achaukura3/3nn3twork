const http = require('http');
const express = require('express');
const authenticateToken = require('./middleware/auth'); // Import middleware

const { Server } = require('socket.io');
const mongoose = require('mongoose');



const cors = require('cors');
const User = require('./models/User');
const Message = require('./models/Message');
const path = require('path');
const fs = require('fs');

const clientPath = path.join(__dirname, '..', 'client');
const port = Number(process.env.PORT) || 5000;
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/3nn3twork';

const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOriginValidator = (origin, callback) => {
  if (!origin) {
    callback(null, true);
    return;
  }

  if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error('CORS blocked for this origin'));
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOriginValidator,
    methods: ['GET', 'POST'],
  },
});


const diaryRoutes = require('./routes/diary');
const userRoutes = require('./routes/userRoutes')(io);
const friendRoutes = require('./routes/friendRoutes');
const messageRoutes = require('./routes/messageRoutes')(io);
const profileRoutes = require('./routes/profileRoutes');
const prodbyenneRoutes = require('./routes/prodbyenneRoutes')(io);

async function emitUsersSnapshot() {
  const users = await User.find({}, 'username fullName profileImageUrl role isOnline');
  io.emit('users_updated', users);
}


app.use(express.json());
app.use(cors({ origin: corsOriginValidator }));

app.get('/', (req, res) => {
  const indexPath = path.join(clientPath, 'index.html');
  
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ 
      message: '3NN3TWORK API is running!',
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  }
});
app.use(express.static(clientPath));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/diary', diaryRoutes);




// MongoDB Connection
if (process.env.NODE_ENV === 'production' && !process.env.MONGODB_URI && !process.env.MONGO_URI) {
  console.error('Missing MongoDB environment variable. Set MONGODB_URI (or MONGO_URI) in Render.');
  process.exit(1);
}

mongoose.connect(mongoUri)
  .then(() => {
    console.log('MongoDB connected');
    console.log(`MongoDB target host: ${mongoose.connection.host || 'unknown'}`);
    console.log(`MongoDB target database: ${mongoose.connection.name || 'unknown'}`);

    User.countDocuments({})
      .then((count) => {
        console.log(`MongoDB users collection document count: ${count}`);
      })
      .catch((countError) => {
        console.warn(`Unable to count users collection: ${countError.message}`);
      });
  })
  .catch((error) => {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  });




// Routes
app.use('/', userRoutes); // User-related routes, e.g., /login, /signup
app.use('/messages', messageRoutes); // Message routes, e.g., /messages
app.use('/friends', friendRoutes); // Friend-related routes, e.g., /friends/request
app.use('/profiles', profileRoutes); // Profile routes, e.g., /profiles
app.use('/prodbyenne', prodbyenneRoutes);

app.get('*', (req, res) => {
  const indexPath = path.join(clientPath, 'index.html');

  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
    return;
  }

  res.status(404).json({ message: 'Frontend bundle not found' });
});



// Real-time messaging with WebSocket
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle user joining a room
  socket.on('join_room', async (userId) => {
      if (userId) {
          // Store the socketId with the user in the database
          const user = await User.findByIdAndUpdate(userId, { socketId: socket.id, isOnline: true }, { new: true });
          socket.join(userId); // User joins their room
          if (user && user.role === 'admin') {
            socket.join('admins');
          }
          console.log(`User ${userId} joined room ${userId}`);
        await emitUsersSnapshot();
      }
  });

  // Handle sending messages
  socket.on('send_message', async ({ senderId, receiverId, content }) => {
    try {
        const message = new Message({
            sender: senderId,
            receiver: receiverId,
            content,
        });

        await message.save();

        // Emit the message to the receiver's room
        io.to(receiverId).emit('receive_message', {
            senderId: message.sender,
            senderUsername: socket.username, // Use sender's username if available
            content: message.content,
            timestamp: message.timestamp,
        });

        console.log(`Message sent to ${receiverId}`);
    } catch (error) {
        console.error('Error saving message:', error);
        socket.emit('error', { message: 'Failed to send message', error });
    }
});


  // Handle user disconnection
  socket.on('disconnect', async () => {
      try {
          // Find the user by their socketId and mark them as offline
          const user = await User.findOneAndUpdate(
              { socketId: socket.id },
              { isOnline: false, socketId: null }
          );

          if (user) {
              // Notify all connected clients that the user logged out
              io.emit('user_logged_out', { userId: user._id });
              await emitUsersSnapshot();
              console.log(`User ${user.username} marked as offline`);
          }
      } catch (error) {
          console.error('Error during disconnect:', error);
      }

      console.log(`User disconnected: ${socket.id}`);
  });
});


// Export authenticateToken
module.exports = {
  authenticateToken,
};


// Start Server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});


