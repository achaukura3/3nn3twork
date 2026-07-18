const http = require('http');
const express = require('express');
const authenticateToken = require('./middleware/auth'); // Import middleware

const { Server } = require('socket.io');
const mongoose = require('mongoose');



const cors = require('cors');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5000'], // Allow the client served from either dev origin
    methods: ['GET', 'POST'],
  },
});


const diaryRoutes = require('./routes/diary');
const userRoutes = require('./routes/userRoutes')(io);
const friendRoutes = require('./routes/friendRoutes');
const messageRoutes = require('./routes/messageRoutes')(io);
const profileRoutes = require('./routes/profileRoutes');
const prodbyenneRoutes = require('./routes/prodbyenneRoutes')(io);

const path = require('path');
const fs = require('fs');
const clientPath = path.join(__dirname, '..', 'client');

async function emitUsersSnapshot() {
  const users = await User.find({}, 'username fullName profileImageUrl role isOnline');
  io.emit('users_updated', users);
}


app.use(express.json());
app.use(cors()); 

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
mongoose.connect('mongodb://localhost:27017/3nn3twork', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});




// Routes
app.use('/', userRoutes); // User-related routes, e.g., /login, /signup
app.use('/messages', messageRoutes); // Message routes, e.g., /messages
app.use('/friends', friendRoutes); // Friend-related routes, e.g., /friends/request
app.use('/profiles', profileRoutes); // Profile routes, e.g., /profiles
app.use('/prodbyenne', prodbyenneRoutes);



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
server.listen(5000, () => {
  console.log('Server running on http://localhost:5000');
});


