const socket = new WebSocket(
  "wss://type-racer-multiplayer-production.up.railway.app"
); // Change when deployed

let playerId,
  roomId,
  raceText = "";
const progressContainer = document.getElementById("progressContainer");
const startButton = document.getElementById("startButton");
let timerInterval; // Declare timer globally
let raceOngoing = false; // Global flag

function createRoom() {
  const maxPlayers = document.getElementById("maxPlayers").value;
  console.log("Sending createRoom request...");
  socket.send(JSON.stringify({ type: "createRoom", maxPlayers }));
}

function joinRoom() {
  const enteredRoomId = document.getElementById("roomIdInput").value;
  socket.send(JSON.stringify({ type: "joinRoom", roomId: enteredRoomId }));
}

function leaveRoom() {
  socket.send(JSON.stringify({ type: "leaveRoom" }));
}

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case "roomCreated":
      console.log("Room created! Data received:", data);
      roomId = data.roomId;
      if (!roomId) {
        console.error("No roomId received from server!");
        return;
      }
      document.getElementById("roomIdDisplay").innerText = `Room ID: ${roomId}`;
      document.getElementById("roomIdDisplay").style.display = "block";
      break;

    case "joinedRoom":
      console.log("Joined room data:", data); // Debugging
      roomId = data.roomId;
      playerId = data.playerId;
      raceText = data.text;

      // Show the room ID for all players
      document.getElementById("roomIdDisplay").innerText = `Room ID: ${roomId}`;
      document.getElementById("roomIdDisplay").style.display = "block";

      document.getElementById("raceText").innerText = raceText;
      document.getElementById("createJoinContainer").style.display = "none";
      document.getElementById("leaveButton").style.display = "block";

      const typingInput = document.getElementById("typingInput");
      typingInput.style.display = "block";
      typingInput.disabled = true;

      const username = document.getElementById("usernameDisplay");
      username.innerText = `You are: Player ${playerId}`;

      const creatorText = document.getElementById("creatorDisplay");
      if (creatorText) {
        creatorText.innerText = `Room Creator: Player ${data.creatorId}`;
      }

      if (startButton) {
        startButton.style.display =
          playerId == data.creatorId ? "block" : "none";
      }
      break;

    case "leftRoom":
      playerId = null;
      roomId = null;

      // Hide the room ID when a player leaves
      document.getElementById("roomIdDisplay").style.display = "none";

      // Show create/join options
      document.getElementById("createJoinContainer").style.display = "block";
      document.getElementById("leaveButton").style.display = "none";

      // Clear race text and input box
      document.getElementById("raceText").innerText = "";
      document.getElementById("countdownDisplay").style.display = "none"; // Hide countdown
      document.getElementById("raceStatusDisplay").style.display = "none"; // Hide "Race!" text
      document.getElementById("typingInput").value = "";
      document.getElementById("typingInput").style.display = "none";
      document.getElementById("typingInput").disabled = true;

      document.getElementById("finishDisplay").style.display = "none"; // Hide finish text
      document.getElementById("winnerDisplay").style.display = "none"; // Hide winner text
      document.getElementById("raceTimer").style.display = "none"; // Hide timer
      document.getElementById("raceTimer").innerText = ""; // Clear timer text
      document.getElementById("usernameDisplay").innerText = ""; // Clear timer text

      // Hide the progress section
      progressContainer.innerHTML = "";
      //   progressContainer.style.display = "none";

      // Hide start button if they were the creator
      // Reset start button visibility and state
      startButton.style.display = "none";
      startButton.disabled = false; // Re-enable button when leaving room
      document.getElementById("creatorDisplay").innerText = "";

      if (startButton) startButton.style.display = "none"; // Hide start button

      break;

    case "updatePlayers":
      progressContainer.innerHTML = "";
      Object.entries(data.players).forEach(([id, player]) => {
        const p = document.createElement("p");
        p.innerText = `Player ${id}: ${player.progress ?? 0}%`;
        progressContainer.appendChild(p);
      });
      break;

    case "updateCreator":
      updateCreatorDisplay(data.creatorId);
      break;

    case "gameStart":
      startCountdown();
      // Hide start button once race starts
      //   const startButton = document.getElementById("startButton");
      if (startButton) {
        startButton.style.display = "none"; // Hide button
        startButton.disabled = true; // Disable button
      }
      break;

    case "error":
      alert(data.message);
      break;

    case "playerFinished":
      if (data.playerId === playerId) {
        // Display rank when player finishes
        const finishText = document.getElementById("finishDisplay");
        finishText.innerText = `You finished ${data.rank}!`;
        finishText.style.display = "block";

        // document.getElementById("raceTimer").style.display = "none"; // Hide timer

        const typingInput = document.getElementById("typingInput");
        typingInput.blur(); // Focus input
        typingInput.disabled = true;
      }
      break;

    case "topWinners":
      const winners = data.winners;
      const winnerDisplay = document.getElementById("winnerDisplay");

      if (winners.length === 1) {
        winnerDisplay.innerText = `🏆 Player ${winners[0]} wins the race! 🏆`;
      } else if (winners.length === 2) {
        winnerDisplay.innerText = `🥇 Player ${winners[0]} 🥈 Player ${winners[1]}`;
      } else if (winners.length === 3) {
        winnerDisplay.innerText = `🥇 Player ${winners[0]} 🥈 Player ${winners[1]} 🥉 Player ${winners[2]}`;
      }

      winnerDisplay.style.display = "block";
      break;

    case "raceTimeout":
      document.getElementById("raceTimer").innerText = "Time's up!";
      break;

    case "stopTimer":
      clearInterval(timerInterval); // Stop the countdown
      console.log("⏳ Timer stopped. All players finished!");
      //   document.getElementById("raceTimer").style.display = "none"; // Hide timer

      raceOngoing = false; // Reset race status

      // Show start button only if player is the creator
      if (playerId === data.creatorId) {
        // const startButton = document.getElementById("startButton");
        if (startButton) {
          startButton.style.display = "block";
          startButton.disabled = false;
        }
      }
      break;
  }
};

function startCountdown() {
  const countdownText = document.getElementById("countdownDisplay");
  const raceText = document.getElementById("raceStatusDisplay"); // New element for "Race!"
  const typingInput = document.getElementById("typingInput");

  const countdownWords = ["Ready", "Set", "Go!"];
  let counter = 0;

  countdownText.style.display = "block"; // Show the countdown

  const interval = setInterval(() => {
    countdownText.innerText = countdownWords[counter];
    counter++;

    if (counter >= countdownWords.length) {
      clearInterval(interval);
      countdownText.style.display = "none"; // Hide countdown
      typingInput.disabled = false; // Enable typing input
      typingInput.focus(); // Focus input

      // Show "Race!" text
      raceText.style.display = "block";
      raceText.innerText = "Race!";

      // Start 2-minute timer
      startRaceTimer(120); // 120 seconds
    }
  }, 1000); // Update every second
}

// Function to start the race timer
function startRaceTimer(duration) {
  const raceTimerDisplay = document.getElementById("raceTimer");
  raceTimerDisplay.style.display = "block";

  let remainingTime = duration;
  // raceTimerDisplay.innerText = `Time Left: ${remainingTime}s`;
  updateTimerDisplay(remainingTime);

  timerInterval = setInterval(() => {
    remainingTime--;
    // raceTimerDisplay.innerText = `Time Left: ${remainingTime}s`;
    updateTimerDisplay(remainingTime);

    if (remainingTime <= 0) {
      clearInterval(timerInterval);
      raceTimerDisplay.innerText = "Time's up!";
      socket.send(JSON.stringify({ type: "raceTimeout", roomId }));
    }
  }, 1000);
}

function updateTimerDisplay(seconds) {
  const raceTimerDisplay = document.getElementById("raceTimer");
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  raceTimerDisplay.innerText = `Time Left: ${minutes}:${secs
    .toString()
    .padStart(2, "0")}`;
}

function updateCreatorDisplay(creatorId) {
  const creatorText = document.getElementById("creatorDisplay");
  if (!creatorText) return;

  creatorText.innerText = `Room Creator: Player ${creatorId}`;

  // Only the creator sees the start button
  //   const startButton = document.getElementById("startButton");
  if (startButton) {
    startButton.style.display = playerId == creatorId ? "block" : "none";
  }
}

function startRace() {
  if (raceOngoing) {
    console.log("Race is already ongoing. Start button disabled.");
    return; // Prevent multiple race starts
  }

  if (playerId && roomId) {
    raceOngoing = true; // Mark race as ongoing
    socket.send(JSON.stringify({ type: "startGame", roomId, playerId }));

    // Hide and disable start button
    // const startButton = document.getElementById("startButton");
    if (startButton) {
      startButton.style.display = "none";
      startButton.disabled = true;
    }
  }
}

document.getElementById("typingInput").addEventListener("input", (event) => {
  const inputField = event.target;
  const typedText = inputField.value;

  // Normalize text for comparison (fixes apostrophe issues)
  const normalizeText = (text) => text.normalize("NFKD").replace(/’/g, "'");

  const normalizedTyped = normalizeText(typedText);
  const normalizedRaceText = normalizeText(raceText);

  let correctChars = 0;
  let lastCorrectIndex = -1;

  for (let i = 0; i < normalizedTyped.length; i++) {
    if (normalizedTyped[i] === normalizedRaceText[i]) {
      correctChars++;
      lastCorrectIndex = i;
    } else {
      break;
    }
  }

  if (typedText.length > correctChars) {
    inputField.value = typedText.substring(0, correctChars);
    inputField.setSelectionRange(correctChars, correctChars);
  }

  const progress = Math.round((correctChars / raceText.length) * 100);
  socket.send(JSON.stringify({ type: "progress", roomId, playerId, progress }));

  if (normalizedTyped === normalizedRaceText) {
    socket.send(JSON.stringify({ type: "finish", roomId, playerId }));
  }
});
