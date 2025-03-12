const WebSocket = require("ws");
const fs = require("fs");

const server = new WebSocket.Server({ port: 3000 });
// const PORT = process.env.PORT || 3000;
// const server = new WebSocket.Server({ port: PORT });

let rooms = {}; // Store rooms with players, progress, and game state

server.on("connection", (socket) => {
  console.log("New player connected!");

  socket.playerRoom = null;
  socket.playerId = null;

  socket.on("message", (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case "createRoom":
        if (socket.playerRoom) {
          socket.send(
            JSON.stringify({
              type: "error",
              message: "You are already in a room.",
            })
          );
          return;
        }
        const roomId = generateRoomId();
        const quote = getRandomQuote(); // Fetch a random quote

        rooms[roomId] = {
          players: {},
          maxPlayers: data.maxPlayers,
          text: quote,
          creator: null,
          gameStarted: false, // Track game start state
        };
        socket.send(JSON.stringify({ type: "roomCreated", roomId }));
        break;

      case "joinRoom":
        if (socket.playerRoom) {
          socket.send(
            JSON.stringify({
              type: "error",
              message: "You are already in a room.",
            })
          );
          return;
        }
        const room = rooms[data.roomId];

        if (!room) {
          socket.send(
            JSON.stringify({ type: "error", message: "Room does not exist." })
          );
          return;
        }

        if (room.gameStarted) {
          socket.send(
            JSON.stringify({
              type: "error",
              message: "Game has already started.",
            })
          );
          return;
        }

        if (Object.keys(room.players).length >= room.maxPlayers) {
          socket.send(
            JSON.stringify({ type: "error", message: "Room is full." })
          );
          return;
        }

        const playerId = getAvailablePlayerId(room.players);
        room.players[playerId] = { progress: 0, finished: false, socket };

        socket.playerId = playerId;
        socket.playerRoom = data.roomId;

        if (!room.creator) {
          room.creator = playerId;
        }

        socket.send(
          JSON.stringify({
            type: "joinedRoom",
            playerId,
            roomId: socket.playerRoom,
            text: room.text,
            creatorId: room.creator,
          })
        );

        broadcast(room, { type: "updatePlayers", players: room.players });
        broadcast(room, { type: "updateCreator", creatorId: room.creator });

        if (Object.keys(room.players).length === room.maxPlayers) {
          startGame(room);
        }
        break;

      case "leaveRoom":
        leaveRoom(socket);
        break;

      case "progress":
        const progressRoom = rooms[data.roomId];
        if (!progressRoom) return;

        progressRoom.players[data.playerId].progress = data.progress;
        broadcast(progressRoom, {
          type: "updatePlayers",
          players: progressRoom.players,
        });
        break;

      case "finish":
        const finishRoom = rooms[data.roomId];
        if (!finishRoom) return;

        // Ensure the player is marked as finished
        finishRoom.players[data.playerId].finished = true;

        // Call handleFinish to check if all players are done
        handleFinish(socket, data);
        break;

      case "startGame":
        const startRoom = rooms[data.roomId];
        if (startRoom && startRoom.creator === data.playerId) {
          startGame(startRoom);
        }
        break;
    }
  });

  // socket.on("close", () => {
  //     console.log(`Player ${socket.playerId || "Unknown"} disconnected`);

  //     if (socket.playerRoom && rooms[socket.playerRoom]) {
  //         delete rooms[socket.playerRoom].players[socket.playerId];

  //         if (rooms[socket.playerRoom].creator === socket.playerId) {
  //             const remainingPlayers = Object.keys(rooms[socket.playerRoom].players);
  //             rooms[socket.playerRoom].creator = remainingPlayers.length > 0 ? remainingPlayers[0] : null;
  //             broadcast(rooms[socket.playerRoom], { type: "updateCreator", creatorId: rooms[socket.playerRoom].creator });
  //         }

  //         if (Object.keys(rooms[socket.playerRoom].players).length === 0) {
  //             delete rooms[socket.playerRoom];
  //             console.log(`Room ${socket.playerRoom} deleted`);
  //         } else {
  //             broadcast(rooms[socket.playerRoom], { type: "updatePlayers", players: rooms[socket.playerRoom].players });
  //         }
  //     }
  // });

  socket.on("close", () => {
    console.log(`Player ${socket.playerId || "Unknown"} disconnected`);
    leaveRoom(socket);
  });
});

// ✅ **Modified getRandomQuote to use JSON file**
function getRandomQuote() {
  try {
    const quotes = JSON.parse(fs.readFileSync("quotes.json", "utf8"));
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    return randomQuote.quote;
  } catch (error) {
    console.error("Error loading quotes:", error);
    return "Default quote in case of error.";
  }
}

let rankings = {}; // Store rankings for each room

function handleFinish(socket, data) {
  const { roomId, playerId } = data;
  if (!rooms[roomId]) return;

  if (!rankings[roomId]) {
    rankings[roomId] = [];
  }

  // Prevent duplicate ranking assignments
  if (!rankings[roomId].includes(playerId)) {
    rankings[roomId].push(playerId);
  }

  const rank = rankings[roomId].length; // Get the player's rank

  // Send updated rank to all players
  broadcast(rooms[roomId], {
    type: "playerFinished",
    playerId,
    rank,
  });

  // Check if at least 3 players have finished to determine top 3 winners
  if (rankings[roomId].length === 3) {
    broadcast(rooms[roomId], {
      type: "topWinners",
      winners: rankings[roomId].slice(0, 3), // Send the top 3 winners
    });
  }

  // If all players are done, stop the timer
  const allPlayersFinished = Object.values(rooms[roomId].players).every(
    (player) => player.finished
  );

  if (allPlayersFinished) {
    console.log(`All players in room ${roomId} have finished. Stopping timer.`);
    broadcast(rooms[roomId], { type: "stopTimer" });

    // If fewer than 3 players finished, send available winners
    if (rankings[roomId].length < 3) {
      broadcast(rooms[roomId], {
        type: "topWinners",
        winners: rankings[roomId], // Send as many winners as available
      });
    }
  }
}

function leaveRoom(socket) {
  if (socket.playerRoom && rooms[socket.playerRoom]) {
    const room = rooms[socket.playerRoom];

    // Remove player from the room
    delete room.players[socket.playerId];

    // If the leaving player was the creator, assign a new creator
    if (room.creator === socket.playerId) {
      const remainingPlayers = Object.keys(room.players);
      room.creator =
        remainingPlayers.length > 0 ? parseInt(remainingPlayers[0]) : null; // Assign first available player

      // Broadcast new creator only if there is one
      if (room.creator !== null) {
        broadcast(room, { type: "updateCreator", creatorId: room.creator });
      }
    }

    // If the room is empty, delete it
    if (Object.keys(room.players).length === 0) {
      delete rooms[socket.playerRoom];
      console.log(`Room ${socket.playerRoom} deleted`);
    } else {
      broadcast(room, { type: "updatePlayers", players: room.players });
    }

    // Reset player state BEFORE sending confirmation
    socket.playerRoom = null;
    socket.playerId = null;

    // Inform the player that they have left
    socket.send(JSON.stringify({ type: "leftRoom" }));
  }
}

// function broadcast(room, message) {
//   Object.values(room.players).forEach((player) => {
//     if (player.socket) {
//       player.socket.send(JSON.stringify(message));
//     }
//   });
// }

// function broadcast(room, message) {
//   room.players.forEach(player => {
//       try {
//           // Only send the needed message, NOT the entire player object
//           player.socket.send(JSON.stringify(message));
//       } catch (error) {
//           console.error("Error sending message to player:", error);
//       }
//   });
// }

// function broadcast(room, message) {
//   room.players.forEach((player) => {
//     try {
//       // Exclude the WebSocket object before sending
//       const sanitizedPlayer = { ...player };
//       delete sanitizedPlayer.socket; // Prevent circular JSON error

//       player.socket.send(
//         JSON.stringify({ ...message, player: sanitizedPlayer })
//       );
//     } catch (error) {
//       console.error("Error sending message to player:", error);
//     }
//   });
// }

function broadcast(room, message) {
  Object.values(room.players).forEach((player) => {
    const safeMessage = JSON.stringify(
      Object.fromEntries(
        Object.entries(message).filter(([key]) => key !== "socket")
      )
    );
    player.socket.send(safeMessage);
  });
}

function generateRoomId() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function getAvailablePlayerId(players) {
  const existingIds = Object.keys(players).map(Number);
  let playerId = 1;
  while (existingIds.includes(playerId)) {
    playerId++;
  }
  return playerId;
}

function startGame(room) {
  room.gameStarted = true;
  broadcast(room, { type: "gameStart" });
}

console.log("WebSocket server running on ws://localhost:3000");
