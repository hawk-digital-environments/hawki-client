# HAWKI Chat Client

A secure, end-to-end encrypted chat client for the HAWKI server system.

## Features

- End-to-end encrypted messaging
- Room management and invitation system
- User authentication and search
- Secure passkey management
- WebSocket integration for real-time updates

## Installation

```bash
npm install hawki-chat-client
```

## Basic Usage

```javascript
import HAWKIChat from 'hawki-chat-client';

// Initialize the client
const apiUrl = 'https://your-hawki-server.com/api';
const chat = new HAWKIChat(apiUrl);

// Authenticate with token
await chat.init('your-user-token');

// Get rooms list
const rooms = await chat.getRoomsList();

// Subscribe to room updates
chat.subscribeToRoom(rooms[0].slug, (message) => {
  console.log('New message:', message);
});

// Send a message
await chat.submitMessage('Hello, world!', 1, rooms[0].slug);
```

## Advanced Usage

### Room Management

```javascript
// Create a new room
const newRoom = await chat.createRoom({
  name: 'Project Discussion',
  description: 'Room for discussing the new project',
  invitedMembers: [
    { username: 'john', publicKey: 'base64-public-key' },
    { username: 'sarah', publicKey: 'base64-public-key' }
  ]
});

// Update room info
await chat.updateRoomInfo(newRoom.slug, {
  name: 'Updated Project Discussion',
  description: 'Updated description'
});

// Delete a room
await chat.deleteRoom(newRoom.slug);

// Leave a room
await chat.leaveRoom(roomSlug);

// Remove a member from a room
await chat.kickMember(roomSlug, 'username');
```

### User Management

```javascript
// Search for users
const users = await chat.searchUser('john');

// Send invitations
await chat.sendInvitations(users, roomSlug);

// Get user invitations
const invitations = await chat.getUserInvitations((roomData) => {
  console.log('Joined room:', roomData);
});

// Verify a passkey
const result = await chat.verifyPasskey(passkey, keychainData,
  () => console.log('Passkey verified'),
  (error) => console.error('Verification failed:', error)
);

// Recover a passkey using backup hash
const recovery = await chat.recoverPasskey(backupHash, userInfo,
  (passkey) => console.log('Recovered passkey:', passkey),
  (error) => console.error('Recovery failed:', error)
);

// Upload a backup file
chat.uploadBackupFile(
  (content) => console.log('Backup loaded:', content),
  (error) => console.error('Upload failed:', error)
);

// Reset user profile
const redirectUrl = await chat.resetProfile();

// Clean up user data
await chat.cleanup(username, () => console.log('Cleanup complete'));
```

## WebSocket Configuration

You can configure the WebSocket connection by passing options to the constructor:

```javascript
const chat = new HAWKIChat('https://your-hawki-server.com/api', {
  key: 'your-pusher-key',
  wsHost: 'ws.your-hawki-server.com',
  wsPort: 6001,
  wssPort: 6001,
  forceTLS: true,
  encrypted: true
});
```

## Security

This library implements end-to-end encryption using:

- AES-GCM 256-bit for symmetric encryption
- RSA-OAEP 2048-bit for asymmetric encryption
- PBKDF2 for key derivation
- Secure local storage of keys using IndexedDB

## License

MIT