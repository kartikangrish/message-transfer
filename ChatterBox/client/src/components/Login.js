import React, { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  Container,
} from '@mui/material';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username.trim() && email.trim()) {
      onLogin({ username, email });
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Paper
          elevation={3}
          sx={{
            p: 4,
            width: '100%',
            maxWidth: 400,
            textAlign: 'center',
          }}
        >
          <Typography variant="h4" component="h1" gutterBottom>
            Welcome to ChatterBox
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            Enter your details to start chatting
          </Typography>
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Username"
              variant="outlined"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              margin="normal"
              required
            />
            <TextField
              fullWidth
              label="Email"
              type="email"
              variant="outlined"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              required
            />
            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
              size="large"
              sx={{ mt: 3 }}
              disabled={!username.trim() || !email.trim()}
            >
              Start Chatting
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default Login; 