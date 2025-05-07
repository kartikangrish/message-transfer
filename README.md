# ChatterBox - Real-time Chat Application

A modern real-time chat application with features like group messaging, video/audio calling, file sharing, and more.

## Features

- Real-time messaging
- Group chat functionality
- Video and audio calling
- File sharing (images, videos, documents)
- Voice messages
- Message status (sent, delivered, read)
- Typing indicators
- Online/offline status
- Last seen timestamps

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- MongoDB (running locally or a cloud instance)

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/kartikangrish/message-transfer.git
cd message-transfer
```

### 2. Server Setup

```bash
cd ChatterBox/server
npm install
```

Create a `.env` file in the server directory with the following variables:
```
PORT=8000
MONGODB_URI=your_mongodb_connection_string
```

### 3. Client Setup

```bash
cd ../client
npm install
```

### 4. Install Additional Dependencies

For the server:
```bash
cd ../server
npm install multer simple-peer
```

For the client:
```bash
cd ../client
npm install simple-peer
```

### 5. Running the Application

1. Start the server:
```bash
cd ../server
npm start
```

2. In a new terminal, start the client:
```bash
cd ../client
npm start
```

The application will be available at:
- Client: http://localhost:3000
- Server: http://localhost:8000

## Usage

1. Open the application in your browser
2. Register with your email and username
3. Start chatting with other users
4. Create groups by clicking the "+" button in the chat list
5. Use the attachment buttons to share files or record voice messages
6. Initiate video/audio calls using the call buttons in individual chats

## Troubleshooting

If you encounter any issues:

1. Make sure MongoDB is running
2. Check if ports 3000 and 8000 are available
3. Ensure all dependencies are installed correctly
4. Clear browser cache if UI issues persist
5. Check browser console for any error messages

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 