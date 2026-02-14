const socket=io("https://webtalk-2.onrender.com/");

let localStream;
let peerConnections = {};
let username;
let roomId;
let users = {};

const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    }
  ]
};

// 🎤 INIT MIC
async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  localStream.getAudioTracks()[0].enabled = false;

  startSpeakingDetection();
}
init();

// ================= UI =================

// CREATE ROOM
document.getElementById("createBtn").onclick = () => {
  username = document.getElementById("nameInput").value;

  if (!username) return alert("Enter name");

  roomId = Math.random().toString(36).substring(2, 7);

  enterRoom();
};

// JOIN ROOM
document.getElementById("joinBtn").onclick = () => {
  username = document.getElementById("nameInput").value;
  roomId = document.getElementById("roomInput").value;

  if (!username || !roomId) return alert("Enter all details");

  enterRoom();
};

// ENTER ROOM
function enterRoom() {
  document.getElementById("home").style.display = "none";
  document.getElementById("roomScreen").style.display = "flex";

  document.getElementById("roomCode").innerText = "Room: " + roomId;

  socket.emit("join-room", roomId);

  users[socket.id] = username;
  addUser(socket.id, username);
}

// COPY LINK
document.getElementById("copyBtn").onclick = () => {
  const link = `${window.location.origin}?room=${roomId}`;
  navigator.clipboard.writeText(link);

  const btn = document.getElementById("copyBtn");
  btn.innerText = "Copied!";
  setTimeout(() => (btn.innerText = "Copy Link"), 1000);
};

// AUTO JOIN VIA LINK
const params = new URLSearchParams(window.location.search);
if (params.get("room")) {
  document.getElementById("roomInput").value = params.get("room");
}

// ================= USERS UI =================

function addUser(id, name) {
  const div = document.createElement("div");
  div.className = "user";
  div.id = id;
  div.innerText = name;

  document.getElementById("users").appendChild(div);
}

// ================= WEBRTC =================

// EXISTING USERS
socket.on("existing-users", async (ids) => {
  for (let id of ids) {
    createConnection(id, true);
  }
});

// NEW USER
socket.on("user-joined", (id) => {
  users[id] = "User";
  addUser(id, "User");
  createConnection(id, true);
});

// OFFER
socket.on("offer", async ({ sdp, sender }) => {
  createConnection(sender, false);

  await peerConnections[sender].setRemoteDescription(
    new RTCSessionDescription(sdp)
  );

  const answer = await peerConnections[sender].createAnswer();
  await peerConnections[sender].setLocalDescription(answer);

  socket.emit("answer", {
    target: sender,
    sdp: answer
  });
});

// ANSWER
socket.on("answer", async ({ sdp, sender }) => {
  await peerConnections[sender].setRemoteDescription(
    new RTCSessionDescription(sdp)
  );
});

// ICE
socket.on("ice-candidate", async ({ candidate, sender }) => {
  try {
    await peerConnections[sender].addIceCandidate(
      new RTCIceCandidate(candidate)
    );
  } catch (e) {}
});

// CREATE CONNECTION
function createConnection(id, isInitiator) {
  const pc = new RTCPeerConnection(config);

  peerConnections[id] = pc;

  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit("ice-candidate", {
        target: id,
        candidate: e.candidate
      });
    }
  };

  pc.ontrack = (e) => {
    const audio = document.createElement("audio");
    audio.srcObject = e.streams[0];
    audio.autoplay = true;
  };

  if (isInitiator) {
    pc.createOffer().then(offer => {
      pc.setLocalDescription(offer);

      socket.emit("offer", {
        target: id,
        sdp: offer
      });
    });
  }
}

// ================= PUSH TO TALK =================

const talkBtn = document.getElementById("talk");

talkBtn.onmousedown = () => {
  talkBtn.innerText = "Talking...";
  localStream.getAudioTracks()[0].enabled = true;

  highlightUser(socket.id);
};

talkBtn.onmouseup = () => {
  talkBtn.innerText = "Hold to Talk";
  localStream.getAudioTracks()[0].enabled = false;
};

// ================= SPEAKING DETECTION =================

function startSpeakingDetection() {
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();

  const source = audioContext.createMediaStreamSource(localStream);
  source.connect(analyser);

  analyser.fftSize = 512;
  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  setInterval(() => {
    analyser.getByteFrequencyData(dataArray);

    let volume =
      dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

    if (volume > 20 && roomId) {
      socket.emit("speaking", {
        roomId,
        userId: socket.id
      });
    }
  }, 200);
}

// RECEIVE SPEAKING
socket.on("speaking", (id) => {
  highlightUser(id);
});

// HIGHLIGHT USER
function highlightUser(id) {
  const el = document.getElementById(id);
  if (!el) return;

  el.classList.add("active");

  setTimeout(() => {
    el.classList.remove("active");
  }, 300);
}
