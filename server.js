const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);

    socket.to(roomId).emit("user-joined", socket.id);

    socket.on("offer", (data) => {
      io.to(data.target).emit("offer", data);
    });

    socket.on("answer", (data) => {
      io.to(data.target).emit("answer", data);
    });

    socket.on("ice-candidate", (data) => {
      io.to(data.target).emit("ice-candidate", data);
    });

    socket.on("disconnect", () => {
      socket.to(roomId).emit("user-left", socket.id);
    });
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
