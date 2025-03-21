// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins (change in production)
    methods: ["GET", "POST"],
  },
});

let rooms = {};

function checkWinner(board) {
  const winningCombinations = [
    [0, 1, 2], // rows
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6], // columns
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8], // diagonals
    [2, 4, 6],
  ];
  for (let combo of winningCombinations) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return board[a]; // returns "X" or "O"
    }
  }
  return null;
}

io.on("connection", (socket) => {
  console.log("🔌 A user connected:", socket.id);

  socket.on("createRoom", (roomId, callback) => {
    console.log("ℹ️ Received createRoom event for room:", roomId);
    if (!roomId) {
      callback({ success: false, error: "Room ID cannot be empty" });
      return;
    }
    if (rooms[roomId]) {
      callback({ success: false, error: "Room already exists" });
      return;
    }

    rooms[roomId] = {
      players: [socket.id],
      board: Array(9).fill(null),
      turn: "X",
    };

    socket.join(roomId);
    console.log(`✅ Room ${roomId} created by ${socket.id}`);

    io.to(roomId).emit("roomUpdate", rooms[roomId]);
    io.to(roomId).emit("playerCount", rooms[roomId].players.length);

    callback({ success: true, room: rooms[roomId] });
  });

  socket.on("joinRoom", (roomId, callback) => {
    console.log("ℹ️ Received joinRoom event for room:", roomId);
    if (!roomId) {
      callback({ success: false, error: "Room ID cannot be empty" });
      return;
    }
    if (!rooms[roomId]) {
      callback({ success: false, error: "Room does not exist" });
      return;
    }
    if (rooms[roomId].players.length >= 2) {
      callback({ success: false, error: "Room is full" });
      return;
    }

    rooms[roomId].players.push(socket.id);
    socket.join(roomId);
    console.log(`✅ Player ${socket.id} joined room ${roomId}`);

    io.to(roomId).emit("roomUpdate", rooms[roomId]);
    io.to(roomId).emit("playerCount", rooms[roomId].players.length);

    if (rooms[roomId].players.length === 2) {
      io.to(roomId).emit("opponentJoined", {
        message: "Your opponent has joined!",
      });
    }

    callback({ success: true, room: rooms[roomId] });
  });

  socket.on("makeMove", ({ roomId, index }) => {
    console.log(
      `ℹ️ makeMove received from ${socket.id} in room ${roomId} at index ${index}`
    );
    if (rooms[roomId] && !rooms[roomId].gameOver) {
      let room = rooms[roomId];
      if (room.board[index] === null) {
        room.board[index] = room.turn;
        // Check for a winner
        const winner = checkWinner(room.board);
        if (winner) {
          room.gameOver = true;
          io.to(roomId).emit("gameOver", { winner, board: room.board });
          console.log(`🎉 Game over in room ${roomId}. Winner: ${winner}`);
        } else if (room.board.every((cell) => cell !== null)) {
          // No winner and no empty cell = draw
          room.gameOver = true;
          io.to(roomId).emit("gameOver", {
            winner: null,
            board: room.board,
            draw: true,
          });
          console.log(`🤝 Game over in room ${roomId}. It's a draw.`);
        } else {
          // Toggle turn if no win/draw
          room.turn = room.turn === "X" ? "O" : "X";
          io.to(roomId).emit("roomUpdate", room);
          console.log(
            `✅ Move accepted in room ${roomId}. New turn: ${room.turn}`
          );
        }
      } else {
        console.log("❌ Move rejected: Cell already occupied");
      }
    }
  });

  socket.on("leaveRoom", (roomId) => {
    if (rooms[roomId]) {
      rooms[roomId].players = rooms[roomId].players.filter(
        (p) => p !== socket.id
      );

      io.to(roomId).emit("playerCount", rooms[roomId].players.length);

      io.to(roomId).emit("opponentLeft", {
        message: "Your opponent has left!",
      });

      // **Delete room if no players remain**
      if (rooms[roomId].players.length === 0) {
        delete rooms[roomId];
        console.log(`Room ${roomId} deleted due to inactivity`);
      }
    }
  });

  socket.on("getRoomState", (roomId, callback) => {
    if (rooms[roomId]) {
      callback({ success: true, room: rooms[roomId] });
    } else {
      callback({ success: false, error: "Room not found" });
    }
  });

  socket.on("disconnect", () => {
    console.log("🔌 User disconnected:", socket.id);
    Object.keys(rooms).forEach((roomId) => {
      if (rooms[roomId].players.includes(socket.id)) {
        rooms[roomId].players = rooms[roomId].players.filter(
          (id) => id !== socket.id
        );
        io.to(roomId).emit("playerCount", rooms[roomId].players.length);
        // Notify the remaining player that the opponent left
        io.to(roomId).emit("opponentLeft", {
          message: "Your opponent has left!",
        });
        if (rooms[roomId].players.length === 0) {
          console.log(`🗑 Deleting empty room: ${roomId}`);
          delete rooms[roomId];
        }
      }
    });
  });
});
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => console.log("🚀 Server running on port 3000"));
