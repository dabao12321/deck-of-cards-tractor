const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8081 });

class GameRoom {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = [];
    this.currentTurn = 0;
    this.gameStarted = false;
    
    // Track full card state matching deck.js format
    this.deck = Array(54).fill().map((_, i) => ({
      i: i,                    // card index
      suit: Math.floor(i/13),  // 0-3 for suits, 4 for jokers
      rank: (i % 13) + 1,      // 1-13 for ranks
      x: 0,                    // x coordinate
      y: 0,                    // y coordinate
      rot: 0,                  // rotation
      side: 'back'             // card face
    }));
  }

  initializeDeck() {
    // Create a copy of the deck to shuffle
    const shuffledDeck = [...this.deck];
    
    // Fisher-Yates shuffle
    for (let i = shuffledDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledDeck[i], shuffledDeck[j]] = [shuffledDeck[j], shuffledDeck[i]];
    }

    // Update the deck with shuffled cards
    this.deck = shuffledDeck;

    // Send full card state to clients
    this.players.forEach(player => {
      player.socket.send(JSON.stringify({
        type: 'init-deck',
        cards: this.deck
      }));
    });
  }

  startGame() {
    this.gameStarted = true;
    this.initializeDeck();
  }

  addPlayer(player) {
    this.players.push(player);
    
    // Notify all players about the new player count
    this.players.forEach(p => {
      p.socket.send(JSON.stringify({
        type: 'player-joined',
        playerCount: this.players.length,
        players: this.players.map(player => player.name)
      }));
    });
  }

  broadcastGameState() {
    const gameState = {
      type: 'game-state',
      playerCount: this.players.length,
      players: this.players.map(player => player.name)
    };

    // Only send to players with valid socket connections
    this.players.forEach(p => {
      if (p.socket && p.socket.readyState === WebSocket.OPEN) {
        p.socket.send(JSON.stringify(gameState));
      }
    });
  }

  broadcastToAll(message) {
    this.players.forEach(p => {
      if (p.socket && p.socket.readyState === WebSocket.OPEN) {
        p.socket.send(JSON.stringify(message));
      }
    });
  }
}

const rooms = new Map();

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Debug logging helper
function logRoomStatus(action) {
  console.log(`\n=== ${action} ===`);
  console.log('Active Rooms:');
  if (rooms.size === 0) {
    console.log('No active rooms');
  } else {
    rooms.forEach((room, code) => {
      console.log(`Room ${code}: ${room.players.length} players [${room.players.map(p => p.name).join(', ')}]`);
    });
  }
  console.log('================\n');
}

server.on('connection', (socket) => {
  console.log('Client connected');
  logRoomStatus('New Connection');

  let currentRoom = null;
  let playerIndex = -1;
  let playerName = null;

  socket.on('close', () => {
    if (currentRoom) {
      // Just mark the socket as disconnected, but keep the player in the room
      const player = currentRoom.players.find(p => p.socket === socket);
      if (player) {
        player.socket = null;
        console.log(`Player ${player.name} disconnected from room ${currentRoom.roomCode} (but still in room)`);
      }
      currentRoom.broadcastGameState();
      logRoomStatus('After Disconnect');
    }
  });

  socket.on('message', (message) => {
    const data = JSON.parse(message);
    console.log('Received message:', data);

    switch(data.type) {
      case 'create-room':
        const roomCode = generateRoomCode();
        const newRoom = new GameRoom(roomCode);
        rooms.set(roomCode, newRoom);
        currentRoom = newRoom;
        playerIndex = 0;
        playerName = data.playerName;

        // Add the player to the room
        currentRoom.addPlayer({
          name: data.playerName,
          socket: socket,
          cards: []
        });

        // Send confirmation to client
        socket.send(JSON.stringify({
          type: 'room-created',
          roomCode: roomCode
        }));

        console.log(`Room ${roomCode} created by ${data.playerName}`);
        logRoomStatus('After Room Creation');
        break;

      case 'join-room':
        const joinRoomCode = data.roomCode.toUpperCase();
        const roomToJoin = rooms.get(joinRoomCode);
        
        if (roomToJoin && roomToJoin.players.length < 4) {
          currentRoom = roomToJoin;
          playerIndex = roomToJoin.players.length;
          playerName = data.playerName;

          currentRoom.addPlayer({
            name: data.playerName,
            socket: socket,
            cards: []
          });

          socket.send(JSON.stringify({
            type: 'room-joined',
            roomCode: joinRoomCode
          }));

          console.log(`Player ${data.playerName} joined room ${joinRoomCode}`);
          logRoomStatus('After Join');
        } else {
          socket.send(JSON.stringify({
            type: 'error',
            message: roomToJoin ? 'Room is full' : 'Room not found'
          }));
        }
        break;

      case 'start-game':
        if (currentRoom) {
          currentRoom.startGame();
        }
        break;

      case 'move-card':
        if (currentRoom) {
          const card = currentRoom.deck[data.cardIndex];
          if (card) {
            // Simply update card state
            Object.assign(card, {
              x: data.x,
              y: data.y,
              rot: data.rot,
              side: data.side
            });
            
            // Broadcast to other players
            currentRoom.players.forEach(p => {
              if (p.socket && p.socket !== socket && p.socket.readyState === WebSocket.OPEN) {
                p.socket.send(JSON.stringify({
                  type: 'card-moved',
                  cardIndex: data.cardIndex,
                  x: data.x,
                  y: data.y,
                  rot: data.rot,
                  side: data.side
                }));
              }
            });
          }
        }
        break;

      case 'rejoin-room':
        const rejoinRoom = rooms.get(data.roomCode?.toUpperCase());
        console.log('Rejoin attempt:', {
          roomCode: data.roomCode,
          playerName: data.playerName,
          roomExists: !!rejoinRoom,
          existingPlayers: rejoinRoom?.players.map(p => p.name) || []
        });

        if (rejoinRoom) {
          // Find the player's existing entry
          const existingPlayer = rejoinRoom.players.find(p => p.name === data.playerName);
          
          if (existingPlayer) {
            // Update player's connection
            existingPlayer.socket = socket;
            currentRoom = rejoinRoom;
            playerIndex = rejoinRoom.players.indexOf(existingPlayer);
            playerName = data.playerName;
            
            socket.send(JSON.stringify({
              type: 'room-joined',
              roomCode: data.roomCode
            }));
            
            rejoinRoom.broadcastGameState();
            logRoomStatus('After Rejoin');
          } else {
            socket.send(JSON.stringify({
              type: 'error',
              message: 'Not a member of this room'
            }));
          }
        } else {
          socket.send(JSON.stringify({
            type: 'error',
            message: 'Room not found'
          }));
        }
        break;
    }
  });
});