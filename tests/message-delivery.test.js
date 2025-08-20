// Basic integration test for message delivery and receipts
// Run with: npm run test:messages

const axios = require("axios");
const { io } = require("socket.io-client");

const BASE_URL = "http://localhost:8080";

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function main() {
  const stamp = Date.now();
  const userA = {
    name: "Alice",
    email: `alice_${stamp}@test.local`,
    password: "password1",
  };
  const userB = {
    name: "Bob",
    email: `bob_${stamp}@test.local`,
    password: "password1",
  };

  // Register users
  const regA = await axios
    .post(`${BASE_URL}/api/auth/register`, userA)
    .then((r) => r.data.data);
  const regB = await axios
    .post(`${BASE_URL}/api/auth/register`, userB)
    .then((r) => r.data.data);

  const tokenA = regA.token;
  const tokenB = regB.token;

  // Create public room with A
  const room = await axios
    .post(
      `${BASE_URL}/api/rooms`,
      { name: `room_${stamp}`, isPrivate: false },
      {
        headers: { Authorization: `Bearer ${tokenA}` },
      }
    )
    .then((r) => r.data.data);

  // B joins by roomId
  await axios.post(
    `${BASE_URL}/api/rooms/join`,
    { roomId: room.id },
    {
      headers: { Authorization: `Bearer ${tokenB}` },
    }
  );

  // Connect sockets
  const sockA = io(BASE_URL, { auth: { token: tokenA } });
  const sockB = io(BASE_URL, { auth: { token: tokenB } });

  await new Promise((res, rej) => {
    let count = 0;
    const done = () => ++count === 2 && res();
    sockA.on("connect", done);
    sockB.on("connect", done);
    setTimeout(() => rej(new Error("Socket connect timeout")), 8000);
  });

  // Join room
  sockA.emit("join_room", { roomId: room.id });
  sockB.emit("join_room", { roomId: room.id });

  // Track events
  let receivedByB = null;
  let deliveredSeenByA = false;
  let readSeenByA = false;

  sockB.on("receive_message", (msg) => {
    receivedByB = msg;
    // Immediately ack delivery and read
    sockB.emit("ack_delivery", { roomId: room.id, messageId: msg.id });
    sockB.emit("ack_read", { roomId: room.id, messageId: msg.id });
  });

  sockA.on("message_delivery", ({ messageId }) => {
    if (receivedByB && receivedByB.id === messageId) deliveredSeenByA = true;
  });

  sockA.on("message_read", ({ messageId }) => {
    if (receivedByB && receivedByB.id === messageId) readSeenByA = true;
  });

  // Send message from A
  const content = `Hello ${stamp}`;
  sockA.emit("send_message", {
    roomId: room.id,
    content,
    clientId: `c_${stamp}`,
  });

  // Wait for flow
  await delay(2000);

  // Assertions
  if (!receivedByB) throw new Error("B did not receive the message");
  if (!deliveredSeenByA) throw new Error("A did not see delivery receipt");
  if (!readSeenByA) throw new Error("A did not see read receipt");

  console.log("OK: message delivered and read receipts observed");
  sockA.disconnect();
  sockB.disconnect();
}

main().catch((err) => {
  console.error("Test failed:", err.message);
  process.exit(1);
});
