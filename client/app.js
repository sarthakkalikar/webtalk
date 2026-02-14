const socket = io("https://webtalk-2.onrender.com");

let localStream;
let peerConnections = {};
let username;
let roomId;
let users = {};

const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

window.onload = async () => {

  // 🎤 MIC INIT
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  localStream.getAudioTracks()[0].enabled = false;

  // UI ELEMENTS
  const createBtn = document.getElementById("createBtn");
  const joinBtn = document.getElementById("joinBtn");
  const talkBtn = document.getElementById("talkBtn");

  // CREATE ROOM
  createBtn.onclick = () => {
    username = document.getElementById("nameInput").value;
    if (!username) return alert("Enter name");

    roomId = Math.random().toString(36).substring(2,7);
    enterRoom();
  };

  // JOIN ROOM
  joinBtn.onclick = () => {
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

  // COPY LINK
  document.getElementById("copyBtn").onclick = () => {
    const link = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(link);
    alert("Copied!");
  };

  // PUSH TO TALK
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

  // AUTO JOIN
  const params = new URLSearchParams(window.location.search);
  if (params.get("room")) {
    document.getElementById("roomInput").value = params.get("room");
  }

};

//////////////// USERS UI //////////////////

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

//////////////// SOCKET //////////////////

socket.on("existing-users", (ids) => {
  ids.forEach(id => createPeer(id, true));
});

socket.on("user-joined", (id, name) => {
  addUser(id, name);
  createPeer(id, false);
});

socket.on("offer", async (id, offer) => {
  const pc = createPeer(id, false);

  await pc.setRemoteDescription(offer);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit("answer", id, answer);
});

socket.on("answer", (id, answer) => {
  peerConnections[id].setRemoteDescription(answer);
});

socket.on("ice-candidate", (id, candidate) => {
  peerConnections[id].addIceCandidate(candidate);
});

socket.on("speaking", (id, status) => {
  highlightUser(id, status);
});

//////////////// WEBRTC //////////////////

function createPeer(id, initiator) {
  const pc = new RTCPeerConnection(config);
  peerConnections[id] = pc;

  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  pc.ontrack = (e) => {
    const audio = document.createElement("audio");
    audio.srcObject = e.streams[0];
    audio.autoplay = true;
    document.body.appendChild(audio);
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit("ice-candidate", id, e.candidate);
    }
  };

  if (initiator) {
    pc.createOffer()
      .then(o => pc.setLocalDescription(o))
      .then(() => socket.emit("offer", id, pc.localDescription));
  }

  return pc;
}
