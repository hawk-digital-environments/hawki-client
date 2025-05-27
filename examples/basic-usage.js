/**
 * Basic usage example for HAWKI Chat Client
 */

// Import the HAWKIChat class
import HAWKIChat from 'hawki-chat-client';

// Example usage in an async function
async function initializeChat() {
  try {
    // Create a new chat client instance with API URL
    const apiUrl = 'https://your-hawki-server.com/api';
    const chat = new HAWKIChat(apiUrl);
    
    // Initialize with user token
    const userToken = 'your-user-token';
    await chat.init(userToken);
    console.log('Chat client initialized successfully');
    
    // Get the list of rooms
    const rooms = await chat.getRoomsList();
    console.log(`Found ${rooms.length} rooms`);
    
    // Subscribe to room updates
    if (rooms.length > 0) {
      chat.subscribeToRoom(rooms[0].slug, (message) => {
        console.log('New message received:', message);
      });
      console.log(`Subscribed to room: ${rooms[0].name}`);
      
      // Get room content
      const roomContent = await chat.getRoomContent(rooms[0].slug);
      console.log(`Room ${rooms[0].name} has ${roomContent.messagesData.length} messages`);
      
      // Send a message
      const messageData = await chat.submitMessage('Hello from HAWKI Client!', 1, rooms[0].slug);
      console.log('Message sent:', messageData);
    }
    
    // Search for users
    const searchResults = await chat.searchUser('john');
    console.log(`Found ${searchResults.length} users matching "john"`);
    
    // Create a new room
    const newRoom = await chat.createRoom({
      name: 'New Project Discussion',
      description: 'A room for discussing our new project',
      systemPrompt: 'This is a system prompt for AI',
      invitedMembers: searchResults
    });
    console.log('New room created:', newRoom);
    
    // Update room information
    await chat.updateRoomInfo(newRoom.slug, {
      name: 'Updated Project Discussion'
    });
    console.log('Room updated successfully');
    
    // Handle invitations
    const invitations = await chat.getUserInvitations((roomData) => {
      console.log('Invitation accepted, joined room:', roomData);
    });
    
    return chat;
  } catch (error) {
    console.error('Error initializing chat:', error);
  }
}

// Example usage for authentication and recovery
async function handleAuthentication() {
  try {
    const apiUrl = 'https://your-hawki-server.com/api';
    const chat = new HAWKIChat(apiUrl);
    
    // Verify a passkey
    const serverKeychainData = '{"keychain":"encrypted-data","KCIV":"iv-data","KCTAG":"tag-data"}';
    const verificationResult = await chat.verifyPasskey(
      'your-passkey', 
      serverKeychainData,
      () => console.log('Passkey verified successfully'),
      (error) => console.error('Passkey verification failed:', error)
    );
    
    // Upload backup file
    chat.uploadBackupFile(
      (content) => {
        console.log('Backup file loaded:', content);
        // Recover passkey with backup hash
        chat.recoverPasskey(
          content,
          { username: 'your-username', email: 'your-email@example.com' },
          (passkey) => console.log('Passkey recovered:', passkey),
          (error) => console.error('Passkey recovery failed:', error)
        );
      },
      (error) => console.error('Error loading backup file:', error)
    );
    
    return verificationResult;
  } catch (error) {
    console.error('Error in authentication:', error);
  }
}

// Call our examples
initializeChat().then(chat => {
  console.log('Chat example completed');
});

handleAuthentication().then(result => {
  console.log('Authentication example completed');
});