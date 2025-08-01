import express from "express";
import { createServer } from "http";
import { Server } from "colyseus";
import { monitor } from "@colyseus/monitor";
import cors from "cors";

import { GameRoom } from "./rooms/GameRoom";

const port = Number(process.env.PORT || 3000);
const app = express();

// Enable CORS for client connections
app.use(cors());
app.use(express.json());

// Create Colyseus server
const gameServer = new Server({
  server: createServer(app),
});

// Register room handlers
gameServer.define("game_room", GameRoom);

// Register Colyseus monitor for debugging
app.use("/colyseus", monitor());

// Health check
app.get("/", (req, res) => {
  res.send("Colyseus Head Soccer Server is running!");
});

gameServer.listen(port);
console.log(`🎮 Colyseus server is running on http://localhost:${port}`);
console.log(`📊 Monitor available at http://localhost:${port}/colyseus`);