import React, { useState, useEffect, useCallback } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import { io } from 'socket.io-client';
import Login from './components/Login';
import Chat from './components/Chat';
import axios from 'axios';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#2196f3',
    },
    secondary: {
      main: '#f50057',
    },
    background: {
      default: '#f5f5f5',
    },
  },
});

const socket = io('http://localhost:8000');

function App() {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState({});

  const fetchUsers = useCallback(async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/users');
      setUsers(response.data.filter(u => u.email !== user?.email));
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      socket.emit('user_connected', user);
      fetchUsers();
    }
  }, [user, fetchUsers]);

  useEffect(() => {
    socket.on('receive_message', (message) => {
      const chatKey = message.isGroup 
        ? message.receiver 
        : [message.sender, message.receiver].sort().join('_');
      
      setMessages(prev => ({
        ...prev,
        [chatKey]: [...(prev[chatKey] || []), message]
      }));

      // Mark message as read if it's from the selected chat
      if (!message.isGroup && selectedChat?.email === message.sender) {
        socket.emit('message_read', {
          messageId: message.id,
          sender: message.sender,
          receiver: user.email
        });
      }
    });

    socket.on('message_history', (history) => {
      if (selectedChat) {
        const chatKey = selectedChat.isGroup 
          ? selectedChat.id 
          : [selectedChat.email, user.email].sort().join('_');
        
        setMessages(prev => ({
          ...prev,
          [chatKey]: history
        }));

        // Mark all messages as read for individual chats
        if (!selectedChat.isGroup) {
          history.forEach(msg => {
            if (msg.sender === selectedChat.email && msg.status !== 'read') {
              socket.emit('message_read', {
                messageId: msg.id,
                sender: msg.sender,
                receiver: user.email
              });
            }
          });
        }
      }
    });

    socket.on('user_list_updated', (userList) => {
      setUsers(userList.filter(u => u.email !== user?.email));
    });

    socket.on('message_status_update', ({ messageId, status }) => {
      if (selectedChat) {
        const chatKey = selectedChat.isGroup 
          ? selectedChat.id 
          : [selectedChat.email, user.email].sort().join('_');
        setMessages(prev => ({
          ...prev,
          [chatKey]: prev[chatKey]?.map(msg => 
            msg.id === messageId ? { ...msg, status } : msg
          ) || []
        }));
      }
    });

    return () => {
      socket.off('receive_message');
      socket.off('message_history');
      socket.off('user_list_updated');
      socket.off('message_status_update');
    };
  }, [selectedChat, user]);

  const handleLogin = async (userData) => {
    try {
      // Register the user
      await axios.post('http://localhost:8000/api/register', userData);
      setUser(userData);
    } catch (error) {
      if (error.response?.status === 400) {
        // User already exists, just set the user
        setUser(userData);
      } else {
        console.error('Error registering user:', error);
      }
    }
  };

  const handleSelectChat = (selectedUser) => {
    setSelectedChat(selectedUser);
    const chatKey = [selectedUser.email, user.email].sort().join('_');
    socket.emit('get_messages', {
      sender: user.email,
      receiver: selectedUser.email
    });
  };

  const handleSendMessage = (message) => {
    if (!selectedChat) return;

    const messageData = {
      message,
      sender: user.email,
      receiver: selectedChat.email,
    };

    socket.emit('send_message', messageData);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="lg" sx={{ height: '100vh', py: 2 }}>
        <Paper 
          elevation={3} 
          sx={{ 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column',
            borderRadius: 2,
            overflow: 'hidden'
          }}
        >
          {!user ? (
            <Login onLogin={handleLogin} />
          ) : (
            <Chat 
              user={user}
              users={users}
              selectedChat={selectedChat}
              messages={messages}
              onSelectChat={handleSelectChat}
              onSendMessage={handleSendMessage}
            />
          )}
        </Paper>
      </Container>
    </ThemeProvider>
  );
}

export default App;
