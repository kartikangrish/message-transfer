import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { Server } from 'socket.io';
import http from 'http';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const app = express();
const server = http.createServer(app);

// Configure CORS
app.use(cors({
  origin: "http://localhost:3000",
  methods: ["GET", "POST"],
  credentials: true
}));

// Middleware
app.use(bodyParser.json({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// In-memory storage
const users = new Map();
const messages = new Map();
const userSockets = new Map();
const typingUsers = new Map();
const groups = new Map();
const activeCalls = new Map();

// Routes
app.get('/', (req, res) => {
  res.send('Chat Server is running');
});

// File upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  res.json({
    filename: req.file.filename,
    path: `/uploads/${req.file.filename}`,
    type: req.file.mimetype
  });
});

// Register new user
app.post('/api/register', (req, res) => {
  const { username, email } = req.body;
  if (users.has(email)) {
    return res.status(400).json({ message: 'User already exists' });
  }
  users.set(email, { 
    username, 
    email,
    lastSeen: new Date().toISOString(),
    isOnline: false,
    groups: []
  });
  res.status(201).json({ username, email });
});

// Create new group
app.post('/api/groups', (req, res) => {
  const { name, creator, members } = req.body;
  const groupId = Date.now().toString();
  const group = {
    id: groupId,
    name,
    creator,
    members: [...members, creator],
    admins: [creator],
    createdAt: new Date().toISOString()
  };
  groups.set(groupId, group);
  
  // Add group to each member's groups list
  group.members.forEach(member => {
    const user = users.get(member);
    if (user) {
      user.groups.push(groupId);
      users.set(member, user);
    }
  });

  res.status(201).json(group);
});

// Get all users
app.get('/api/users', (req, res) => {
  const userList = Array.from(users.values()).map(({ username, email, isOnline, lastSeen }) => ({
    username,
    email,
    isOnline,
    lastSeen
  }));
  res.json(userList);
});

// Get user's groups
app.get('/api/groups/:email', (req, res) => {
  const { email } = req.params;
  const user = users.get(email);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  const userGroups = user.groups.map(groupId => groups.get(groupId));
  res.json(userGroups);
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('user_connected', (userData) => {
    const { username, email } = userData;
    // Add user if not exists
    if (!users.has(email)) {
      users.set(email, { 
        username, 
        email,
        lastSeen: new Date().toISOString(),
        isOnline: true,
        groups: []
      });
    } else {
      const user = users.get(email);
      user.isOnline = true;
      user.lastSeen = new Date().toISOString();
      users.set(email, user);
    }
    
    userSockets.set(email, socket.id);
    socket.userEmail = email;
    console.log(`User ${username} connected with socket ${socket.id}`);
    
    // Broadcast updated user list to all clients
    const userList = Array.from(users.values()).map(({ username, email, isOnline, lastSeen }) => ({
      username,
      email,
      isOnline,
      lastSeen
    }));
    io.emit('user_list_updated', userList);
  });

  socket.on('typing_start', ({ sender, receiver, isGroup }) => {
    if (isGroup) {
      const group = groups.get(receiver);
      if (group) {
        group.members.forEach(member => {
          if (member !== sender) {
            const memberSocketId = userSockets.get(member);
            if (memberSocketId) {
              io.to(memberSocketId).emit('user_typing', { sender, group: receiver });
            }
          }
        });
      }
    } else {
      const receiverSocketId = userSockets.get(receiver);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('user_typing', { sender });
      }
    }
  });

  socket.on('typing_stop', ({ sender, receiver, isGroup }) => {
    if (isGroup) {
      const group = groups.get(receiver);
      if (group) {
        group.members.forEach(member => {
          if (member !== sender) {
            const memberSocketId = userSockets.get(member);
            if (memberSocketId) {
              io.to(memberSocketId).emit('user_stopped_typing', { sender, group: receiver });
            }
          }
        });
      }
    } else {
      const receiverSocketId = userSockets.get(receiver);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('user_stopped_typing', { sender });
      }
    }
  });

  socket.on('message_read', ({ messageId, sender, receiver, isGroup }) => {
    if (!isGroup) {
      const senderSocketId = userSockets.get(sender);
      if (senderSocketId) {
        io.to(senderSocketId).emit('message_read_confirmation', { messageId, receiver });
      }
    }
  });

  socket.on('send_message', (data) => {
    const { message, sender, receiver, type = 'text', fileUrl, fileName, fileType, isGroup } = data;
    
    if (isGroup) {
      const group = groups.get(receiver);
      if (!group) return;

      const messageWithTimestamp = {
        id: Date.now().toString(),
        message,
        timestamp: new Date().toISOString(),
        sender,
        receiver,
        type,
        fileUrl,
        fileName,
        fileType,
        isGroup: true,
        status: 'sent'
      };

      // Store message in group's message history
      if (!messages.has(receiver)) {
        messages.set(receiver, []);
      }
      messages.get(receiver).push(messageWithTimestamp);

      // Send to all group members
      group.members.forEach(member => {
        if (member !== sender) {
          const memberSocketId = userSockets.get(member);
          if (memberSocketId) {
            io.to(memberSocketId).emit('receive_message', messageWithTimestamp);
          }
        }
      });
      socket.emit('receive_message', messageWithTimestamp);
    } else {
      const roomKey = [sender, receiver].sort().join('_');
      
      if (!messages.has(roomKey)) {
        messages.set(roomKey, []);
      }

      const messageWithTimestamp = {
        id: Date.now().toString(),
        message,
        timestamp: new Date().toISOString(),
        sender,
        receiver,
        status: 'sent',
        type,
        fileUrl,
        fileName,
        fileType
      };

      messages.get(roomKey).push(messageWithTimestamp);

      // Send to both sender and receiver
      const receiverSocketId = userSockets.get(receiver);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('receive_message', messageWithTimestamp);
        // Mark as delivered
        messageWithTimestamp.status = 'delivered';
        io.to(receiverSocketId).emit('message_status_update', {
          messageId: messageWithTimestamp.id,
          status: 'delivered'
        });
      }
      socket.emit('receive_message', messageWithTimestamp);
    }
  });

  socket.on('get_messages', ({ sender, receiver, isGroup }) => {
    if (isGroup) {
      const groupMessages = messages.get(receiver) || [];
      socket.emit('message_history', groupMessages);
    } else {
      const roomKey = [sender, receiver].sort().join('_');
      const roomMessages = messages.get(roomKey) || [];
      socket.emit('message_history', roomMessages);
    }
  });

  // WebRTC Signaling
  socket.on('call_user', ({ userToCall, signalData, from, name, isVideo }) => {
    const userToCallSocketId = userSockets.get(userToCall);
    if (userToCallSocketId) {
      io.to(userToCallSocketId).emit('call_user', {
        signal: signalData,
        from,
        name,
        isVideo
      });
    }
  });

  socket.on('answer_call', ({ to, signal }) => {
    const toSocketId = userSockets.get(to);
    if (toSocketId) {
      io.to(toSocketId).emit('call_accepted', signal);
    }
  });

  socket.on('end_call', ({ to }) => {
    const toSocketId = userSockets.get(to);
    if (toSocketId) {
      io.to(toSocketId).emit('call_ended');
    }
  });

  socket.on('disconnect', () => {
    if (socket.userEmail) {
      const user = users.get(socket.userEmail);
      if (user) {
        user.isOnline = false;
        user.lastSeen = new Date().toISOString();
        users.set(socket.userEmail, user);
      }
      userSockets.delete(socket.userEmail);
      // Broadcast updated user list to all clients
      const userList = Array.from(users.values()).map(({ username, email, isOnline, lastSeen }) => ({
        username,
        email,
        isOnline,
        lastSeen
      }));
      io.emit('user_list_updated', userList);
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = 8000;
server.listen(PORT, () => {
  console.log(`Server is running successfully on PORT ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to check server status`);
});