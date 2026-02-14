const socket = io("https://webtalk-2.onrender.com"); // your backend URL

let localStream;
let peerConnections = {};
let username;
let roomId;
let users = {};

const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

//////////////////// INIT MIC ////////////////////

async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // start muted (push-to-talk)
  localStream.getAudioTracks()[0].enabled = false;

  startSpeakingDetection();
}

init();

//////////////////// UI ////////////////////

document.getElementById("createBtn").onclick = () => {
  username = document.getElementById("nameInput").value;
  if (!username) return alert("Enter name");

  roomId = Math.random().toString(36).substring(2, 7);

  enterRoom();
};

document.getElementById("joinBtn").onclick = () => {
  username = document.getElementById("nameInput").value;
  roomId = document.getElementById("roomInput").value;

  if (!username || !roomId) return alert("Enter all fields");

  enterRoom();
};

function enterRoom() {
  document.getElementById("home").style.display = "none";
  document.getElementById("room").style.display = "block";

  document.getElementById("roomCode").innerText = roomId;

  socket.emit("join-room", roomId, username);

  users[socket.id] = username;
  addUser(socket.id, username);
}

//////////////////// COPY LINK ////////////////////

document.getElementById("copyBtn").onclick = () => {
  const link = `${window.location.origin}?room=${roomId}`;
  navigator.clipboard.writeText(link);

  const btn = document.getElementById("copyBtn");
  btn.innerText = "Copied!";
  setTimeout(() => (btn.innerText = "Copy Link"), 1000);
};

//////////////////// AUTO JOIN ////////////////////

const params = new URLSearchParams(window.location.search);
if (params.get("room")) {
  document.getElementById("roomInput").value = params.get("room");
}

//////////////////// USERS UI ////////////////////

function addUser(id, name) {
  const div = document.createElement("div");
  div.className = "user";
  div.id = id;
  div.innerText = name;

  document.getElementById("users").appendChild(div);
}

function highlightUser(id, active) {
  const el = document.getElementById(id);
  if (!el) return;

  el.style.background = active ? "rgba(0,255,150,0.3)" : "transparent";
}

//////////////////// PUSH TO TALK ////////////////////

const talkBtn = document.getElementById("talkBtn");

talkBtn.onmousedown = () => {
  localStream.getAudioTracks()[0].enabled = true;
};

talkBtn.onmouseup = () => {
  localStream.getAudioTracks()[0].enabled = false;
};

talkBtn.ontouchstart = () => {
  localStream.getAudioTracks()[0].enabled = true;
};

talkBtn.ontouchend = () => {
  localStream.getAudioTracks()[0].enabled = false;
};

//////////////////// SPEAK DETECTION ////////////////////

function startSpeakingDetection() {
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  const mic = audioContext.createMediaStreamSource(localStream);

  mic.connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);

  function check() {
    analyser.getByteFrequencyData(data);

    const volume = data.reduce((a, b) => a + b) / data.length;

    socket.emit("speaking", volume > 20);

    requestAnimationFrame(check);
  }

  check();
}

//////////////////// SOCKET EVENTS ////////////////////

socket.on("existing-users", async (ids) => {
  for (let id of ids) {
    createPeerConnection(id, true);
  }
});

socket.on("user-joined", (id, name) => {
  users[id] = name;
  addUser(id, name);
  createPeerConnection(id, false);
});

socket.on("offer", async (id, offer) => {
  const pc = createPeerConnection(id, false);

  await pc.setRemoteDescription(offer);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit("answer", id, answer);
});

socket.on("answer", async (id, answer) => {
  await peerConnections[id].setRemoteDescription(answer);
});

socket.on("ice-candidate", (id, candidate) => {
  peerConnections[id].addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on("user-left", (id) => {
  if (peerConnections[id]) peerConnections[id].close();
  delete peerConnections[id];

  const el = document.getElementById(id);
  if (el) el.remove();
});

socket.on("speaking", (id, status) => {
  highlightUser(id, status);
});

//////////////////// WEBRTC ////////////////////

function createPeerConnection(id, initiator) {
  const pc = new RTCPeerConnection(config);

  peerConnections[id] = pc;

  // send audio
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  // receive audio
  pc.ontrack = (event) => {
    const audio = document.createElement("audio");
    audio.srcObject = event.streams[0];
    audio.autoplay = true;
    document.body.appendChild(audio);
  };

  pc.onicecandidate = (event) => {  
    if (event.candidate) {
      socket.emit("ice-candidate", id, event.candidate);
    }
  };

  if (initiator) {
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        socket.emit("offer", id, pc.localDescription);
      });
  }

  return pc;
}
