# NeonGambit - Chess Web Application

NeonGambit is a comprehensive online chess platform built with modern web technologies. The application provides players with multiple game modes, including competitive matches against artificial intelligence, friendly games with other players, puzzle training, educational courses, and tournament participation. The platform features real-time multiplayer functionality, rating systems, game analysis, and a community-driven learning environment.

## Application Overview

The platform is designed to serve chess players of all skill levels, from beginners seeking to improve their fundamentals through structured lessons to advanced players looking for competitive ranked matches. NeonGambit integrates several key features including time-controlled game formats (Bullet, Blitz, Rapid, and Classical), skill-based difficulty levels, player rating systems, and comprehensive game replay functionality for analysis and learning.

## Core Features

- Play against multiple difficulty levels of artificial opponents
- Real-time multiplayer matches with rating calculations
- Puzzle and training modules for skill development
- Structured learning courses covering openings, middlegame, and endgame
- Tournament organization and management
- Game history with full analysis capabilities
- Player profiles with rating progression tracking
- Community messaging and friend system
- Admin dashboard for platform management

## Technology Stack

### Frontend

- React 18.3.1 - User interface framework
- TypeScript 5.8.3 - Type-safe JavaScript development
- Vite 7.0.0 - Build tool and development server
- Tailwind CSS 3.4.17 - Utility-first CSS framework
- React Router DOM 6.30.1 - Client-side routing
- Zustand 4.4.7 - State management
- Framer Motion 11.0.8 - Animation library
- Recharts - Data visualization for rating analysis
- Chess.js - Chess move validation and board state management
- Stockfish Engine - Chess analysis and artificial intelligence

### Backend

- Express.js - Web server framework
- MongoDB - Document database
- Socket.IO - Real-time communication
- Mongoose - MongoDB object modeling

## Installation and Setup

Begin by installing the required dependencies for both client and server environments.

### Frontend Installation

```bash
npm install
```

### Backend Installation

```bash
cd server
npm install
```

## Configuration

Create a `.env` file in the root directory with the following variables:

```bash
VITE_API_URL=http://localhost:3001
MONGODB_URL=mongodb://localhost:27017/neongambit
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## Development

Start the development environment with one command:

```bash
npm run dev
```

This starts the backend first, waits for `http://localhost:3001/healthz` to respond, and then launches the Vite client.

### Start Frontend Only

```bash
npm run dev:client -- --host localhost --port 5173
```

### Start Backend Only

```bash
npm run dev:server
```

The application will be available at `http://localhost:5173` with the API backend running on `http://localhost:3001`.

## Project Structure

- `/src` - Frontend React application source code
- `/server` - Backend Express API server
- `/public` - Static assets including Stockfish chess engine
- `/src/pages` - Page components for routing
- `/src/components` - Reusable React components
- `/src/hooks` - Custom React hooks for game state and data
- `/src/store` - Zustand state management stores
- `/src/chess` - Chess game logic and Stockfish integration

## Build and Deployment

Generate a production build using the following command:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

The application is deployed on Vercel and can be accessed at the production URL.
