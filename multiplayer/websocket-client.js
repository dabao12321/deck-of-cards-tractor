// import Deck from '../dist/deck.js';

class GameClient {
    constructor() {
      this.socket = null;
      this.playerName = '';
      this.roomCode = '';
      this.deck = null;
      this._lastUpdate = null;
      this.initializing = true;
    }
  
    connect() {
      // Clear UI first
      document.getElementById('room-code').textContent = 'Room: ';
      document.getElementById('player-name').textContent = 'Player: ';
      
      this.socket = new WebSocket('ws://localhost:8081');
      
      this.socket.onopen = () => {
        console.log('Connected to server');
      };
  
      this.socket.onmessage = (event) => {
        console.log('Received message:', event.data);
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      };
  
      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
  
      this.socket.onclose = () => {
        console.log('Connection closed');
      };
    }
  
    handleMessage(data) {
      switch(data.type) {
        case 'room-created':
        case 'room-joined':
          this.roomCode = data.roomCode;
          this.updateUI();
          break;
  
        case 'init-deck':
          // Initialize deck with jokers
          this.deck = Deck(true);
          const container = document.getElementById('container');
          container.innerHTML = ''; // Clear existing content
          this.deck.mount(container);
          
          // First apply server's card data
          data.cards.forEach((serverCard, position) => {
            const card = this.deck.cards[position];
            if (card) {
              card.position = position;
              card.i = serverCard.i;
              card.suit = serverCard.suit;
              card.rank = serverCard.rank;
              card.side = serverCard.side;
              card.setSide(card.side);
              
              card.x = serverCard.x;
              card.y = serverCard.y;
              card.rot = serverCard.rot;
            }
          });
  
          // Setup card interactions
          console.log('Setting up card interactions...');
          this.deck.cards.forEach((card, index) => {
            console.log(`Setting up card ${index}`);
            
            card.enableDragging();
            card.enableFlipping();
            
            // Combine flip and drag handling
            card.$el.addEventListener('mousedown', () => {
              // If it's just a click (not a drag), handle as flip
              const startX = card.x;
              const startY = card.y;
              
              const checkForFlip = setTimeout(() => {
                if (card.x === startX && card.y === startY) {
                  // It was a click, not a drag - send flip
                  this.socket.send(JSON.stringify({
                    type: 'move-card',
                    cardIndex: card.position,
                    x: card.x,
                    y: card.y,
                    rot: card.rot,
                    side: card.side === 'front' ? 'back' : 'front'
                  }));
                }
              }, 100);

              card.$el.addEventListener('mousemove', () => {
                if (card.isDragging) {
                  clearTimeout(checkForFlip);  // Cancel flip check if dragging
                }
              }, { passive: true, once: true });
            }, { passive: true });

            card.$el.addEventListener('mouseup', () => {
              console.log(`Card ${card.position} drag ended:`, {
                x: card.x,
                y: card.y,
                rot: card.rot,
                transform: card.$el.style.transform
              });
              this.onCardDragged(card);
            }, { passive: true });
          });
          console.log('Card interactions setup complete');
  
          // Add a flag to prevent sending position updates during initial setup
          this.initializing = true;
  
          // Update the shuffle animation to use server positions
          this.deck.cards.forEach((card, i) => {
            card.animateTo({
              delay: i * 2,
              duration: 200,
              x: card.x,
              y: card.y,
              rot: card.rot,
              onComplete: () => {
                if (i === this.deck.cards.length - 1) {
                  // Last card animation completed
                  this.initializing = false;
                }
              }
            });
          });
          break;
  
        case 'card-moved':
          if (this.deck) {
            const movedCard = this.deck.cards.find(card => card.position === data.cardIndex);
            if (movedCard) {
              // Update the card's actual properties first
              movedCard.x = data.x;
              movedCard.y = data.y;
              movedCard.rot = data.rot;
              
              // Then animate to those positions
              movedCard.animateTo({
                delay: 0,
                duration: 100,
                x: data.x,
                y: data.y,
                rot: data.rot,
                onComplete: () => {
                  if (data.side) {
                    movedCard.setSide(data.side);
                  }
                }
              });
            }
          }
          break;
  
        case 'player-joined':
        case 'game-state':
          this.updateGameState(data);
          break;
      }
    }
  
    updateGameState(state) {
      const gameInfo = document.getElementById('game-info');
      if (!gameInfo) return;
  
      gameInfo.innerHTML = `
        <div class="players-list">
          <div class="players-header">Players (${state.playerCount}/4):</div>
          <div class="players-names">
            ${state.players.map(player => `
              <div class="player-entry">${player}</div>
            `).join('')}
          </div>
        </div>
      `;
    }
  
    updateUI() {
      document.getElementById('room-code').textContent = `Room: ${this.roomCode}`;
      document.getElementById('player-name').textContent = `Player: ${this.playerName}`;
      
      // Add start game button if room creator and it doesn't already exist
      if (this.roomCode) {
        let startButton = document.getElementById('start-game');
        if (!startButton) {
          startButton = document.createElement('button');
          startButton.id = 'start-game';
          startButton.textContent = 'Start Game';
          startButton.onclick = () => this.startGame();
          document.getElementById('game-controls').appendChild(startButton);
        }
      }
    }
  
    createGame() {
      const username = document.getElementById('username').value;
      if (!username) {
        alert('Please enter a username');
        return;
      }
      
      this.playerName = username;
      this.socket.send(JSON.stringify({
        type: 'create-room',
        playerName: username
      }));
    }
  
    joinGame() {
      const username = document.getElementById('username').value;
      const roomCode = document.getElementById('join-code').value;
      if (!username || !roomCode) {
        alert('Please enter both username and room code');
        return;
      }
      
      this.playerName = username;
      this.roomCode = roomCode;
      this.socket.send(JSON.stringify({
        type: 'join-room',
        roomCode: roomCode,
        playerName: username
      }));
    }
  
    startGame() {
      this.socket.send(JSON.stringify({
        type: 'start-game'
      }));
    }
  
    onCardDragged(card) {
      // Don't send updates during initialization
      if (this.initializing) return;

      const transform = card.$el.style.transform;
      const matches = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
      
      if (matches) {
        const x = parseInt(matches[1], 10);
        const y = parseInt(matches[2], 10);
        
        this.socket.send(JSON.stringify({
          type: 'move-card',
          cardIndex: card.position,
          x: x,
          y: y,
          rot: card.rot,
          side: card.side
        }));
      }
    }
  }
  
  // Initialize client and add event listeners after DOM is fully loaded
  document.addEventListener('DOMContentLoaded', () => {
    const gameClient = new GameClient();
    gameClient.connect();
  
    document.getElementById('create-game').addEventListener('click', () => {
      gameClient.createGame();
    });
  
    document.getElementById('join-game').addEventListener('click', () => {
      gameClient.joinGame();
    });
  });