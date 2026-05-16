# Pixel War - Real-Time Shared Grid Game

A multiplayer real-time grid game where players claim tiles on a shared board. Built with React, Nakama, and TypeScript.

## Features

- **Real-time multiplayer**: Multiple players can claim tiles simultaneously
- **Live synchronization**: See all player actions instantly
- **Player statistics**: Track claimed tiles and leaderboard
- **Cooldown system**: 3-second cooldown between tile claims
- **Zoom controls**: Adjust grid size for better viewing
- **Activity feed**: See recent player actions
- **Responsive design**: Works on desktop and mobile

## Game Mechanics

- 40×25 grid (1,000 total tiles)
- Click any unclaimed tile to claim it
- Each player gets a unique color
- 3-second cooldown between claims
- See live leaderboard showing top players
- Track your territory percentage

## Getting Started

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- npm or yarn

### Installation

1. Start the Nakama server:
```bash
docker-compose up -d
```

2. Install client dependencies:
```bash
cd client
npm install
```

3. Start the client:
```bash
npm run dev
```

The game will be available at `http://localhost:5173`

### Building Server Code

```bash
cd server
npm install
npm run build
```

## How to Play

1. Enter your username
2. Create a new game or join with a Match ID
3. Click tiles to claim them (3-second cooldown)
4. Watch the leaderboard to see your rank
5. Share the Match ID with friends to play together

## Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── Game.tsx       # Game orchestration
│   │   ├── GameBoard.tsx  # Grid rendering
│   │   ├── useGame.ts     # Game state hook
│   │   └── nakama-client.ts
│   └── package.json
│
├── server/                # Nakama match handler
│   └── src/match_handler.ts
│
└── docker-compose.yml     # Development setup
```

## License

MIT
