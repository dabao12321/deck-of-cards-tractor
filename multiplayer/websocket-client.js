// import Deck from '../dist/deck.js';

class GameClient {
    constructor() {
      this.socket = null;
      this.playerName = '';
      this.roomCode = '';
      this.deck = null;
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
          
          // Apply initial card states from server
          data.cards.forEach((serverCard, i) => {
            const card = this.deck.cards[i];
            Object.assign(card, {
              i: serverCard.i,
              rank: serverCard.rank,
              suit: serverCard.suit,
              pos: serverCard.pos,
              x: serverCard.x,
              y: serverCard.y,
              rot: serverCard.rot
            });
            card.setSide(serverCard.side);
          });
  
          // Setup card interactions
          this.deck.cards.forEach(card => {
            card.enableDragging();
            card.enableFlipping();
            
            card.$el.addEventListener('mouseup', () => {
              this.onCardDragged(card);
            });
          });
  
          // Sort cards based on server positions
          this.deck.cards.sort((a, b) => a.pos - b.pos);
          
          // Perform shuffle animation without actually reshuffling
          this.deck.cards.forEach((card, i) => {
            card.animateTo({
              delay: i * 2,
              duration: 200,
              x: (Math.random() - 0.5) * 40,
              y: (Math.random() - 0.5) * 40,
              rot: 0
            });
          });
          break;
  
        case 'card-moved':
          console.log('card-moved', data.x, data.y, data.rot, data.side);
          if (this.deck) {
            const card = this.deck.cards[data.cardIndex];
            if (card) {
              card.animateTo({
                delay: 0,
                duration: 200,
                x: data.x,
                y: data.y,
                rot: data.rot || 0,
                onComplete: () => {
                  if (data.side) {
                    card.setSide(data.side);
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
      const container = document.getElementById('container');
      const containerRect = container.getBoundingClientRect();
      const cardRect = card.$el.getBoundingClientRect();
      
      // Calculate position relative to container
      const x = cardRect.left - containerRect.left;
      const y = cardRect.top - containerRect.top;
      
      this.socket.send(JSON.stringify({
        type: 'move-card',
        cardIndex: card.i,
        x: x,
        y: y,
        rot: card.rot,
        side: card.side
      }));
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