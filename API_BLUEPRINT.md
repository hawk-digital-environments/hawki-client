# HAWKI Chat Client API Blueprint

## Overview

The HAWKI Chat Client is an end-to-end encrypted chat library that provides secure messaging, room management, and user authentication for HAWKI server applications.

## Package Information

- **Name**: `hawki-chat-client`
- **Version**: 1.0.0
- **License**: MIT
- **Main Entry**: `dist/index.js`
- **Type Definitions**: `dist/index.d.ts`

## Installation

```bash
npm install hawki-chat-client
```

## Import and Initialization

```javascript
import HAWKIChat from 'hawki-chat-client';

const chat = new HAWKIChat('https://your-hawki-server.com/api', {
  key: 'your-pusher-key',
  wsHost: 'ws.your-hawki-server.com',
  wsPort: 6001,
  wssPort: 6001,
  forceTLS: true
});
```

## Backend Integration (Laravel)

This package is designed to work with a Laravel backend using the following models:
- `Room` - Chat room with encrypted content
- `Message` - Encrypted messages with AES-GCM
- `Member` - Room membership management  
- `User` - User authentication and public keys

---

# HAWKIChat Class Methods

## Constructor

```javascript
constructor(apiUrl, wsConfig)
```

**Input Parameters:**
- `apiUrl` (string, required): Base URL for the HAWKI API server
- `wsConfig` (object, optional): WebSocket configuration

**Returns:** HAWKIChat instance

**Throws:** Error if `apiUrl` is not provided

---

## Authentication & Initialization

### init()

```javascript
async init(userToken)
```

**Input Parameters:**
- `userToken` (string, required): JWT or authentication token for API requests

**Returns:** `Promise<boolean>` - Success status

**Throws:** Error if `userToken` is missing or initialization fails

---

## Room Management

### getRoomsList()

```javascript
async getRoomsList()
```

**Input Parameters:** None

**Returns:** `Promise<Array>` - List of room objects with properties:
- `id` (number): Room ID
- `slug` (string): Unique room identifier  
- `room_name` (string): Room name
- `room_icon` (string): Room icon URL
- `room_description` (string): Room description
- `system_prompt` (string): AI system prompt

### getRoomContent()

```javascript
async getRoomContent(roomSlug)
```

**Input Parameters:**
- `roomSlug` (string, required): Unique identifier for the room

**Returns:** `Promise<Object>` - Decrypted room data including messages and metadata

**Throws:** Error if room slug is missing or room key not found

### createRoom()

```javascript
async createRoom(requestData)
```

**Input Parameters:**
- `requestData` (object, required): Room creation configuration
  - `name` (string, required): Room name
  - `description` (string, optional): Room description
  - `systemPrompt` (string, optional): AI system prompt
  - `avatarUrl` (string, optional): Room avatar URL
  - `invitedMembers` (Array, optional): Users to invite

**Returns:** `Promise<Object>` - Newly created room data

### updateRoomInfo()

```javascript
async updateRoomInfo(slug, attributes)
```

**Input Parameters:**
- `slug` (string, required): Room identifier
- `attributes` (object, required): Attributes to update
  - `systemPrompt` (string, optional): Encrypted system prompt
  - `description` (string, optional): Encrypted room description
  - `name` (string, optional): Room name
  - `img` (string, optional): Room avatar URL

**Returns:** `Promise<Object>` - Updated room data

### deleteRoom()

```javascript
async deleteRoom(slug)
```

**Input Parameters:**
- `slug` (string, required): Room identifier

**Returns:** `Promise<boolean>` - Success status

### leaveRoom()

```javascript
async leaveRoom(slug)
```

**Input Parameters:**
- `slug` (string, required): Room identifier

**Returns:** `Promise<boolean>` - Success status

### kickMember()

```javascript
async kickMember(slug, username)
```

**Input Parameters:**
- `slug` (string, required): Room identifier
- `username` (string, required): Username of member to remove

**Returns:** `Promise<boolean>` - Success status

---

## Messaging

### submitMessage()

```javascript
async submitMessage(inputText, threadNumber, roomSlug)
```

**Input Parameters:**
- `inputText` (string, required): Message content (automatically sanitized)
- `threadNumber` (number, required): Thread ID for organizing conversations
- `roomSlug` (string, required): Target room identifier

**Returns:** `Promise<Object>` - Sent message data with decrypted content

---

## WebSocket Real-time Communication

### subscribeToRoom()

```javascript
subscribeToRoom(roomSlug, callback)
```

**Input Parameters:**
- `roomSlug` (string, required): Room identifier
- `callback` (Function, optional): Message handler function

**Returns:** void

### subscribeToRooms()

```javascript
subscribeToRooms(roomsList, onMessageCallback)
```

**Input Parameters:**
- `roomsList` (Array, required): List of rooms to subscribe to
- `onMessageCallback` (Function, required): Universal message handler

**Returns:** void

---

## User Management

### searchUser()

```javascript
async searchUser(query)
```

**Input Parameters:**
- `query` (string, required): Search term (minimum 4 characters)

**Returns:** `Promise<Array>` - List of matching users

### sendInvitations()

```javascript
async sendInvitations(listOfInvitees, slug)
```

**Input Parameters:**
- `listOfInvitees` (Array, required): Users to invite
- `slug` (string, required): Room identifier

**Returns:** `Promise<void>`

### getUserInvitations()

```javascript
async getUserInvitations(onBroadcasterCallback)
```

**Input Parameters:**
- `onBroadcasterCallback` (Function, required): WebSocket update handler

**Returns:** `Promise<Array>` - List of invitations or room data if accepted

---

## Security & Key Management

### verifyPasskey()

```javascript
async verifyPasskey(passkey, keychainData, onSuccess, onError)
```

**Input Parameters:**
- `passkey` (string, required): User's passkey
- `keychainData` (string, required): Encrypted keychain from server
- `onSuccess` (Function, optional): Success callback
- `onError` (Function, optional): Error callback

**Returns:** `Promise<Object>` - Verification result

### recoverPasskey()

```javascript
async recoverPasskey(backupHash, userInfo, onSuccess, onError)
```

**Input Parameters:**
- `backupHash` (string, required): Backup hash in format "xxxx-xxxx-xxxx-xxxx"
- `userInfo` (object, required): User information object
- `onSuccess` (Function, optional): Success callback with recovered passkey
- `onError` (Function, optional): Error callback

**Returns:** `Promise<Object>` - Recovery result

### uploadBackupFile()

```javascript
uploadBackupFile(onFileLoaded, onError)
```

**Input Parameters:**
- `onFileLoaded` (Function, required): Callback when file is successfully loaded
- `onError` (Function, optional): Error callback for invalid files

**Returns:** void

### resetProfile()

```javascript
async resetProfile()
```

**Input Parameters:** None

**Returns:** `Promise<string>` - Redirect URL for profile reset completion

### cleanup()

```javascript
async cleanup(username, callback)
```

**Input Parameters:**
- `username` (string, optional): Username to clean up (defaults to current user)
- `callback` (Function, optional): Completion callback

**Returns:** `Promise<void>`

---

## Error Handling

Common error types thrown by methods:
- Authentication errors: "User token is required", "Failed to initialize HAWKI_Chat"
- Room access errors: "Room slug is required", "Room key not found for room-abc-123"
- Message errors: "Message text and room slug are required", "Search query must be at least 4 characters"
- Encryption errors: "Failed to decrypt keychain", "Passkey verification failed"

---

## Encryption Specifications

### Symmetric Encryption
- **Algorithm**: AES-GCM 256-bit
- **Key Generation**: Web Crypto API
- **IV Length**: 12 bytes (96 bits)
- **Authentication**: Built-in AEAD

### Asymmetric Encryption
- **Algorithm**: RSA-OAEP 2048-bit
- **Hash Function**: SHA-256
- **Usage**: Room key distribution

### Key Derivation
- **Algorithm**: PBKDF2
- **Hash Function**: SHA-256
- **Iterations**: 100,000
- **Salt Source**: Server-provided

### Data Storage
- **Keychain**: IndexedDB with AES-GCM encryption
- **Passkey**: localStorage with encrypted storage
- **Session Keys**: Memory only (never persisted)

---

## WebSocket Configuration

### Default Configuration
```javascript
{
  broadcaster: 'reverb',
  key: 'hawki2',
  wsHost: window.location.hostname,
  wsPort: 80,
  wssPort: 443,
  forceTLS: true,
  enabledTransports: ['ws', 'wss']
}
```

---

## Browser Compatibility

### Minimum Requirements
- **Chrome**: 63+
- **Firefox**: 57+
- **Safari**: 11.1+
- **Edge**: 79+

### Required APIs
- Web Crypto API
- IndexedDB
- WebSockets
- Fetch API
- TextEncoder/TextDecoder