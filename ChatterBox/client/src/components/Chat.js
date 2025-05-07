import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Typography,
  Paper,
  Avatar,
  AppBar,
  Toolbar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Divider,
  Drawer,
  Badge,
  Tooltip,
  CircularProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ListItemIcon,
  Menu,
  MenuItem,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import MicIcon from '@mui/icons-material/Mic';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ImageIcon from '@mui/icons-material/Image';
import VideocamIcon from '@mui/icons-material/Videocam';
import GroupIcon from '@mui/icons-material/Group';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CallIcon from '@mui/icons-material/Call';
import VideoCallIcon from '@mui/icons-material/VideoCall';
import { io } from 'socket.io-client';
import axios from 'axios';
import Peer from 'simple-peer';

const socket = io('http://localhost:8000');

const Chat = ({ user, users, selectedChat, messages, onSelectChat, onSendMessage }) => {
  const [message, setMessage] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [call, setCall] = useState(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [stream, setStream] = useState(null);
  const [isVideo, setIsVideo] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [showCallControls, setShowCallControls] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioChunks = useRef([]);
  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedChat]);

  useEffect(() => {
    // Fetch user's groups
    const fetchGroups = async () => {
      try {
        const response = await axios.get(`http://localhost:8000/api/groups/${user.email}`);
        setGroups(response.data);
      } catch (error) {
        console.error('Error fetching groups:', error);
      }
    };
    fetchGroups();
  }, [user.email]);

  useEffect(() => {
    socket.on('user_typing', ({ sender, group }) => {
      if (selectedChat?.email === sender || selectedChat?.id === group) {
        setIsTyping(true);
      }
    });

    socket.on('user_stopped_typing', ({ sender, group }) => {
      if (selectedChat?.email === sender || selectedChat?.id === group) {
        setIsTyping(false);
      }
    });

    socket.on('message_status_update', ({ messageId, status }) => {
      // Update message status in the messages state
      const chatKey = selectedChat?.isGroup 
        ? selectedChat.id 
        : [selectedChat?.email, user.email].sort().join('_');
      if (messages[chatKey]) {
        const updatedMessages = messages[chatKey].map(msg => 
          msg.id === messageId ? { ...msg, status } : msg
        );
        onSendMessage(updatedMessages);
      }
    });

    // WebRTC event listeners
    socket.on('call_user', ({ signal, from, name, isVideo }) => {
      setCall({ isReceivingCall: true, from, name, signal, isVideo });
    });

    socket.on('call_accepted', (signal) => {
      setCallAccepted(true);
      connectionRef.current.signal(signal);
    });

    socket.on('call_ended', () => {
      leaveCall();
    });

    return () => {
      socket.off('user_typing');
      socket.off('user_stopped_typing');
      socket.off('message_status_update');
      socket.off('call_user');
      socket.off('call_accepted');
      socket.off('call_ended');
    };
  }, [selectedChat, user, messages]);

  useEffect(() => {
    if (selectedChat) {
      socket.emit('get_messages', {
        sender: user.email,
        receiver: selectedChat.email,
        isGroup: selectedChat.isGroup
      });
    }
  }, [selectedChat, user.email, socket]);

  useEffect(() => {
    socket.on('receive_message', (message) => {
      if (selectedChat && 
          ((message.sender === selectedChat.email && message.receiver === user.email) ||
           (message.sender === user.email && message.receiver === selectedChat.email) ||
           (message.isGroup && message.receiver === selectedChat.id))) {
        setMessages(prev => [...prev, message]);
      }
    });

    return () => {
      socket.off('receive_message');
    };
  }, [selectedChat, user.email, socket]);

  const handleTyping = () => {
    if (selectedChat) {
      socket.emit('typing_start', {
        sender: user.email,
        receiver: selectedChat.isGroup ? selectedChat.id : selectedChat.email,
        isGroup: selectedChat.isGroup
      });

      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }

      const timeout = setTimeout(() => {
        socket.emit('typing_stop', {
          sender: user.email,
          receiver: selectedChat.isGroup ? selectedChat.id : selectedChat.email,
          isGroup: selectedChat.isGroup
        });
      }, 2000);

      setTypingTimeout(timeout);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if ((message.trim() || uploading) && selectedChat) {
      onSendMessage(message, null, selectedChat.isGroup);
      setMessage('');
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }
      socket.emit('typing_stop', {
        sender: user.email,
        receiver: selectedChat.isGroup ? selectedChat.id : selectedChat.email,
        isGroup: selectedChat.isGroup
      });
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('http://localhost:8000/api/upload', formData);
      const { path, type } = response.data;
      
      onSendMessage('', {
        type: type.startsWith('image/') ? 'image' : 'video',
        fileUrl: `http://localhost:8000${path}`,
        fileName: file.name,
        fileType: type
      }, selectedChat.isGroup);
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunks.current = [];

      recorder.ondataavailable = (e) => {
        audioChunks.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', audioBlob, 'voice-message.webm');

        setUploading(true);
        try {
          const response = await axios.post('http://localhost:8000/api/upload', formData);
          const { path } = response.data;
          
          onSendMessage('', {
            type: 'voice',
            fileUrl: `http://localhost:8000${path}`,
            fileName: 'Voice Message',
            fileType: 'audio/webm'
          }, selectedChat.isGroup);
        } catch (error) {
          console.error('Error uploading voice message:', error);
        } finally {
          setUploading(false);
        }
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleCreateGroup = async () => {
    try {
      const response = await axios.post('http://localhost:8000/api/groups', {
        name: newGroupName,
        creator: user.email,
        members: selectedUsers
      });
      setGroups([...groups, response.data]);
      setCreateGroupOpen(false);
      setNewGroupName('');
      setSelectedUsers([]);
    } catch (error) {
      console.error('Error creating group:', error);
    }
  };

  const callUser = async (isVideoCall = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: isVideoCall,
        audio: true 
      });
      setStream(stream);
      setIsVideo(isVideoCall);
      setShowCallControls(true);

      const peer = new Peer({
        initiator: true,
        trickle: false,
        stream
      });

      peer.on('signal', (data) => {
        socket.emit('call_user', {
          userToCall: selectedChat.email,
          signalData: data,
          from: user.email,
          name: user.username,
          isVideo: isVideoCall
        });
      });

      peer.on('stream', (currentStream) => {
        userVideo.current.srcObject = currentStream;
      });

      socket.on('call_accepted', (signal) => {
        setCallAccepted(true);
        peer.signal(signal);
      });

      connectionRef.current = peer;
    } catch (error) {
      console.error('Error starting call:', error);
    }
  };

  const answerCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: call.isVideo,
        audio: true 
      });
      setStream(stream);
      setIsVideo(call.isVideo);
      setShowCallControls(true);

      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream
      });

      peer.on('signal', (data) => {
        socket.emit('answer_call', {
          to: call.from,
          signal: data
        });
      });

      peer.on('stream', (currentStream) => {
        userVideo.current.srcObject = currentStream;
      });

      peer.signal(call.signal);
      connectionRef.current = peer;
      setCallAccepted(true);
    } catch (error) {
      console.error('Error answering call:', error);
    }
  };

  const leaveCall = () => {
    setCallEnded(true);
    if (connectionRef.current) {
      connectionRef.current.destroy();
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    setStream(null);
    setCall(null);
    setCallAccepted(false);
    setShowCallControls(false);
  };

  const getCurrentChatMessages = () => {
    if (!selectedChat) return [];
    const chatKey = selectedChat.isGroup 
      ? selectedChat.id 
      : [selectedChat.email, user.email].sort().join('_');
    return messages[chatKey] || [];
  };

  const getMessageStatus = (status) => {
    switch (status) {
      case 'sent':
        return <DoneIcon fontSize="small" />;
      case 'delivered':
        return <DoneAllIcon fontSize="small" />;
      case 'read':
        return <DoneAllIcon fontSize="small" color="primary" />;
      default:
        return null;
    }
  };

  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return '';
    const date = new Date(lastSeen);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const renderMessageContent = (msg) => {
    switch (msg.type) {
      case 'image':
        return (
          <img 
            src={msg.fileUrl} 
            alt={msg.fileName} 
            style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px' }} 
          />
        );
      case 'video':
        return (
          <video 
            controls 
            style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px' }}
          >
            <source src={msg.fileUrl} type={msg.fileType} />
            Your browser does not support the video tag.
          </video>
        );
      case 'voice':
        return (
          <audio controls style={{ width: '100%' }}>
            <source src={msg.fileUrl} type={msg.fileType} />
            Your browser does not support the audio element.
          </audio>
        );
      default:
        return <Typography variant="body1">{msg.message}</Typography>;
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex' }}>
      {/* User List Drawer */}
      <Drawer
        variant="temporary"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{
          width: 320,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: 320,
            boxSizing: 'border-box',
          },
        }}
      >
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" component="div">
            Chats
          </Typography>
          <IconButton onClick={() => setCreateGroupOpen(true)}>
            <AddIcon />
          </IconButton>
        </Box>
        <Divider />
        <List>
          {groups.map((group) => (
            <ListItem
              button
              key={group.id}
              onClick={() => {
                onSelectChat({ ...group, isGroup: true });
                setDrawerOpen(false);
              }}
              selected={selectedChat?.id === group.id}
            >
              <ListItemAvatar>
                <Avatar>
                  <GroupIcon />
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={group.name}
                secondary={`${group.members.length} members`}
              />
            </ListItem>
          ))}
          {users.map((chatUser) => (
            <ListItem
              button
              key={chatUser.email}
              onClick={() => {
                onSelectChat(chatUser);
                setDrawerOpen(false);
              }}
              selected={selectedChat?.email === chatUser.email}
            >
              <ListItemAvatar>
                <Badge
                  overlap="circular"
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  variant="dot"
                  color={chatUser.isOnline ? "success" : "default"}
                >
                  <Avatar>{chatUser.username[0].toUpperCase()}</Avatar>
                </Badge>
              </ListItemAvatar>
              <ListItemText
                primary={chatUser.username}
                secondary={
                  chatUser.isOnline 
                    ? "Online" 
                    : `Last seen ${formatLastSeen(chatUser.lastSeen)}`
                }
              />
            </ListItem>
          ))}
        </List>
      </Drawer>

      {/* Main Chat Area */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="static" color="primary">
          <Toolbar>
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setDrawerOpen(true)}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
            {selectedChat ? (
              <>
                <Badge
                  overlap="circular"
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  variant="dot"
                  color={selectedChat.isOnline ? "success" : "default"}
                >
                  <Avatar sx={{ mr: 2 }}>
                    {selectedChat.isGroup ? (
                      <GroupIcon />
                    ) : (
                      selectedChat.username[0].toUpperCase()
                    )}
                  </Avatar>
                </Badge>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="h6" component="div">
                    {selectedChat.isGroup ? selectedChat.name : selectedChat.username}
                  </Typography>
                  {!selectedChat.isGroup && (
                    <Typography variant="body2" component="div">
                      {selectedChat.isOnline 
                        ? "Online" 
                        : `Last seen ${formatLastSeen(selectedChat.lastSeen)}`}
                    </Typography>
                  )}
                </Box>
                {!selectedChat.isGroup && (
                  <Box>
                    <IconButton color="inherit" onClick={() => callUser(false)}>
                      <CallIcon />
                    </IconButton>
                    <IconButton color="inherit" onClick={() => callUser(true)}>
                      <VideoCallIcon />
                    </IconButton>
                  </Box>
                )}
                <IconButton
                  color="inherit"
                  onClick={(e) => setMenuAnchorEl(e.currentTarget)}
                >
                  <MoreVertIcon />
                </IconButton>
              </>
            ) : (
              <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                Select a chat
              </Typography>
            )}
            <IconButton color="inherit" onClick={() => window.location.reload()}>
              <LogoutIcon />
            </IconButton>
          </Toolbar>
        </AppBar>

        <Box
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            p: 2,
            backgroundColor: '#f5f5f5',
          }}
        >
          {selectedChat ? (
            <>
              {getCurrentChatMessages().map((msg, index) => (
                <Box
                  key={index}
                  sx={{
                    display: 'flex',
                    justifyContent: msg.sender === user.email ? 'flex-end' : 'flex-start',
                    mb: 2,
                  }}
                >
                  <Paper
                    elevation={1}
                    sx={{
                      p: 2,
                      maxWidth: '70%',
                      backgroundColor: msg.sender === user.email ? '#2196f3' : 'white',
                      color: msg.sender === user.email ? 'white' : 'black',
                      borderRadius: 2,
                    }}
                  >
                    {!selectedChat.isGroup && msg.sender !== user.email && (
                      <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>
                        {users.find(u => u.email === msg.sender)?.username}
                      </Typography>
                    )}
                    {renderMessageContent(msg)}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                      <Typography variant="caption" sx={{ opacity: 0.7 }}>
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </Typography>
                      {msg.sender === user.email && (
                        <Tooltip title={msg.status}>
                          {getMessageStatus(msg.status)}
                        </Tooltip>
                      )}
                    </Box>
                  </Paper>
                </Box>
              ))}
              {isTyping && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 2 }}>
                  <CircularProgress size={16} />
                  <Typography variant="body2" color="text.secondary">
                    {selectedChat.isGroup 
                      ? 'Someone is typing...'
                      : `${selectedChat.username} is typing...`}
                  </Typography>
                </Box>
              )}
            </>
          ) : (
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography variant="h6" color="text.secondary">
                Select a chat to start messaging
              </Typography>
            </Box>
          )}
          <div ref={messagesEndRef} />
        </Box>

        {selectedChat && (
          <Box
            component="form"
            onSubmit={handleSend}
            sx={{
              p: 2,
              backgroundColor: 'background.paper',
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            <Box sx={{ display: 'flex', gap: 1 }}>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileUpload}
                accept="image/*,video/*"
              />
              <IconButton
                color="primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <AttachFileIcon />
              </IconButton>
              <IconButton
                color="primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <ImageIcon />
              </IconButton>
              <IconButton
                color="primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <VideocamIcon />
              </IconButton>
              <IconButton
                color={isRecording ? "error" : "primary"}
                onClick={isRecording ? stopRecording : startRecording}
                disabled={uploading}
              >
                <MicIcon />
              </IconButton>
              <TextField
                fullWidth
                variant="outlined"
                placeholder="Type a message..."
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  handleTyping();
                }}
                size="small"
                disabled={uploading}
              />
              <IconButton
                color="primary"
                type="submit"
                disabled={!message.trim() && !uploading}
              >
                {uploading ? <CircularProgress size={24} /> : <SendIcon />}
              </IconButton>
            </Box>
          </Box>
        )}
      </Box>

      {/* Create Group Dialog */}
      <Dialog open={createGroupOpen} onClose={() => setCreateGroupOpen(false)}>
        <DialogTitle>Create New Group</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Group Name"
            fullWidth
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
          />
          <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
            Select Members
          </Typography>
          <List>
            {users.map((chatUser) => (
              <ListItem
                key={chatUser.email}
                button
                onClick={() => {
                  if (selectedUsers.includes(chatUser.email)) {
                    setSelectedUsers(selectedUsers.filter(email => email !== chatUser.email));
                  } else {
                    setSelectedUsers([...selectedUsers, chatUser.email]);
                  }
                }}
              >
                <ListItemIcon>
                  <Avatar>{chatUser.username[0].toUpperCase()}</Avatar>
                </ListItemIcon>
                <ListItemText primary={chatUser.username} />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateGroupOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleCreateGroup}
            disabled={!newGroupName.trim() || selectedUsers.length === 0}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Call Menu */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={() => setMenuAnchorEl(null)}
      >
        {!selectedChat?.isGroup && (
          <>
            <MenuItem onClick={() => {
              callUser(false);
              setMenuAnchorEl(null);
            }}>
              <ListItemIcon>
                <CallIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Voice Call</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => {
              callUser(true);
              setMenuAnchorEl(null);
            }}>
              <ListItemIcon>
                <VideoCallIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Video Call</ListItemText>
            </MenuItem>
          </>
        )}
      </Menu>

      {/* Call Interface */}
      {showCallControls && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box sx={{ flexGrow: 1, display: 'flex', position: 'relative' }}>
            <video
              ref={userVideo}
              autoPlay
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
            {stream && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 20,
                  right: 20,
                  width: '200px',
                  height: '150px',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <video
                  ref={myVideo}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              </Box>
            )}
          </Box>
          <Box
            sx={{
              p: 2,
              display: 'flex',
              justifyContent: 'center',
              gap: 2,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
            }}
          >
            <IconButton
              color="error"
              onClick={leaveCall}
              sx={{ backgroundColor: 'white' }}
            >
              <CallIcon />
            </IconButton>
          </Box>
        </Box>
      )}

      {/* Incoming Call Dialog */}
      {call?.isReceivingCall && !callAccepted && (
        <Dialog open={true} onClose={() => setCall(null)}>
          <DialogTitle>
            Incoming {call.isVideo ? 'Video' : 'Voice'} Call
          </DialogTitle>
          <DialogContent>
            <Typography>
              {call.name} is calling...
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCall(null)} color="error">
              Decline
            </Button>
            <Button onClick={answerCall} color="primary">
              Accept
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};

export default Chat; 