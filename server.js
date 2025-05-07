const WebSocket = require('ws');

// Create WebSocket server on port 8080
const wss = new WebSocket.Server({ port: 8080 });

// Store active connections
const connections = new Map();
// Queue for users waiting to be paired
const waitingQueue = [];

console.log('Signaling server started on port 8080');

wss.on('connection', (ws) => {
    // Generate a unique ID for this connection
    const userId = generateUniqueId();
    console.log(`New connection: ${userId}`);

    // Store the connection
    connections.set(userId, {
        ws: ws,
        peerId: null  // Will store the ID of the paired peer
    });

    // Handle messages from clients
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(userId, data);
        } catch (error) {
            console.error('Error parsing message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
    });

    // Handle disconnection
    ws.on('close', () => {
        console.log(`Connection closed: ${userId}`);
        handleDisconnection(userId);
    });
});

// Handle incoming messages
function handleMessage(userId, data) {
    const connection = connections.get(userId);
    if (!connection) return;

    const { ws } = connection;

    switch (data.type) {
        case 'join':
            // Add to waiting queue or pair with another waiting user
            handleJoin(userId);
            break;

        case 'offer':
            // Forward offer to paired peer
            forwardToPeer(userId, {
                type: 'offer',
                offer: data.offer
            });
            break;

        case 'answer':
            // Forward answer to paired peer
            forwardToPeer(userId, {
                type: 'answer',
                answer: data.answer
            });
            break;

        case 'candidate':
            // Forward ICE candidate to paired peer
            forwardToPeer(userId, {
                type: 'candidate',
                candidate: data.candidate
            });
            break;

        case 'skip':
            // Handle user requesting to skip current peer
            handleSkip(userId);
            break;

        case 'exit':
            // Handle user exiting the chat
            handleExit(userId);
            break;

        default:
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Unknown message type'
            }));
    }
}

// Handle user joining
function handleJoin(userId) {
    const connection = connections.get(userId);
    if (!connection) return;

    // Remove from any previous pairing
    unpairUser(userId);

    // If someone is waiting, pair them
    if (waitingQueue.length > 0) {
        const waitingUserId = waitingQueue.shift();
        const waitingConnection = connections.get(waitingUserId);

        // Make sure waiting user is still connected
        if (waitingConnection && waitingConnection.ws.readyState === WebSocket.OPEN) {
            // Pair the users
            pairUsers(waitingUserId, userId);
        } else {
            // If waiting user disconnected, add this user to the queue
            connections.delete(waitingUserId);
            waitingQueue.push(userId);
            connection.ws.send(JSON.stringify({ type: 'waiting' }));
        }
    } else {
        // No one waiting, add to queue
        waitingQueue.push(userId);
        connection.ws.send(JSON.stringify({ type: 'waiting' }));
    }
}

// Pair two users together
function pairUsers(userId1, userId2) {
    const connection1 = connections.get(userId1);
    const connection2 = connections.get(userId2);

    if (!connection1 || !connection2) return;

    // Update peer references
    connection1.peerId = userId2;
    connection2.peerId = userId1;

    // Notify users they're paired - first user is the initiator
    connection1.ws.send(JSON.stringify({
        type: 'ready',
        isInitiator: true
    }));

    connection2.ws.send(JSON.stringify({
        type: 'ready',
        isInitiator: false
    }));

    console.log(`Paired users: ${userId1} and ${userId2}`);
}

// Handle user skipping current peer
function handleSkip(userId) {
    const connection = connections.get(userId);
    if (!connection) return;

    // Notify peer that user disconnected
    notifyPeerDisconnected(userId);

    // Put user back in the waiting queue
    handleJoin(userId);
}

// Handle user exiting
function handleExit(userId) {
    const connection = connections.get(userId);
    if (!connection) return;

    // Notify peer that user disconnected
    notifyPeerDisconnected(userId);

    // Remove from waiting queue if present
    const queueIndex = waitingQueue.indexOf(userId);
    if (queueIndex !== -1) {
        waitingQueue.splice(queueIndex, 1);
    }
}

// Handle user disconnection
function handleDisconnection(userId) {
    // Notify peer that user disconnected
    notifyPeerDisconnected(userId);

    // Remove from waiting queue if present
    const queueIndex = waitingQueue.indexOf(userId);
    if (queueIndex !== -1) {
        waitingQueue.splice(queueIndex, 1);
    }

    // Remove from connections
    connections.delete(userId);
}

// Notify peer that user disconnected
function notifyPeerDisconnected(userId) {
    const connection = connections.get(userId);
    if (!connection || !connection.peerId) return;

    const peerConnection = connections.get(connection.peerId);
    if (peerConnection && peerConnection.ws.readyState === WebSocket.OPEN) {
        peerConnection.ws.send(JSON.stringify({
            type: 'peer_disconnected'
        }));
        peerConnection.peerId = null;
    }

    connection.peerId = null;
}

// Unpair a user from their current peer
function unpairUser(userId) {
    const connection = connections.get(userId);
    if (!connection || !connection.peerId) return;

    // Notify peer about disconnection
    notifyPeerDisconnected(userId);
}

// Forward a message to the paired peer
function forwardToPeer(userId, message) {
    const connection = connections.get(userId);
    if (!connection || !connection.peerId) return;

    const peerConnection = connections.get(connection.peerId);
    if (peerConnection && peerConnection.ws.readyState === WebSocket.OPEN) {
        peerConnection.ws.send(JSON.stringify(message));
    }
}

// Generate a unique ID
function generateUniqueId() {
    return Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
}

// Handle server shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'error',
                message: 'Server shutting down'
            }));
            client.close();
        }
    });
    process.exit(0);
});