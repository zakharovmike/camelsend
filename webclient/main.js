/**
 * Copyright © 2022 Mike Zakharov
 *
 * Licensed under the GNU AGPLv3 (https://www.gnu.org/licenses/agpl-3.0.html)
 */

import * as ui from "./ui.js";

const hostname = "localhost:8000";

let id = null;

let serverConnection = null;

let form = null;
let formSubmitted = false;
let peerId = null;
let file = null;
let fileLoaded = false;
let amReceivingPeer = false;
let offerIntervalId = null;

let peerConnection = null;
// Bidirectional, peer-to-peer channel to transfer data and control messages.
// The peer requesting (and receiving) the file creates the data channel.
// The peer sending the file receives the data channel from the other peer.
let dataChannel = null;
let peerConnectionOccupied = false;
let rallyCounter = 0;

// A safe assumption of 16 KiB per message
// https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels#understanding_message_size_limits
const CHUNK_SIZE = 16384;
let receivingFileName;
let receivingFileSize;
let receivingBuffer = [];
let receivingProgress = 0;

function onFormSubmit(e) {
  e.preventDefault();

  // Can only submit once per session
  if (formSubmitted) return;

  const formData = new FormData(form);
  peerId = formData.get("peer-id").toUpperCase().trim();
  file = formData.get("file");

  if (file.size !== 0 && file.name !== "") fileLoaded = true;

  if (fileLoaded) {
    // When a file is loaded you become the sending peer, overriding any peer ID input
    // amReceivingPeer = false;

    const fileSizeAndName = `(${ui.formatFileSize(file.size)}) ${file.name}`;
    ui.addSendingTrackingSheet(fileSizeAndName);

    formSubmitted = true;
    ui.scrollToPackageTracking();
  } else if (peerId !== "") {
    // Ignore attempts to send to yourself
    if (peerId === id) return;

    // When a peer ID is entered, but no file, you become the receiving peer
    amReceivingPeer = true;

    ui.addReceivingTrackingSheet(peerId);
    ui.setConnectionStatusPeerId(peerId);

    dataChannel = peerConnection.createDataChannel("pipe");
    dataChannel.binaryType = "arraybuffer";
    dataChannel.onmessage = onReceivingPeerMessage;
    dataChannel.onopen = () => {
      dataChannel.send(
        JSON.stringify({ m: `Ping ${rallyCounter++} from ${id}` }),
      );
    };

    formSubmitted = true;
    ui.scrollToPackageTracking();
  } else if (peerId === "") {
    // No file, no peer ID, pretend the form wasn't even submitted
    return;
  }
}

function onReceivingPeerMessage(e) {
  if (e.data instanceof ArrayBuffer) {
    receivingBuffer.push(e.data);

    receivingProgress += CHUNK_SIZE / receivingFileSize * 100;
    ui.setPackageStatus("Receiving", receivingProgress);
    return;
  }

  const msg = JSON.parse(e.data);
  switch (msg.type) {
    case "file-info":
      ui.setTrackingSheetFilename(msg.filename, msg.filesize);
      receivingFileName = msg.filename;
      receivingFileSize = msg.filesize;
      break;

    case "end-of-file":
      {
        const file = new Blob(receivingBuffer);
        receivingBuffer = [];

        ui.showDownloadButton();
        const downloadAnchor = document.getElementById("download-anchor");
        downloadAnchor.href = URL.createObjectURL(file);
        downloadAnchor.download = receivingFileName;
      }
      break;

    default:
      console.log(msg.m);

      setTimeout(() => {
        dataChannel.send(
          JSON.stringify({ m: `Ping ${rallyCounter++} from ${id}` }),
        );
      }, 2000);
      break;
  }
}

function connectToServer() {
  const scheme = document.location.protocol === "https:" ? "wss://" : "ws://";
  const url = scheme + hostname;
  serverConnection = new WebSocket(url);

  // Handle a WebSocket timeout from axe-happy browsers (ehm, Firefox) by reconnecting again
  serverConnection.onclose = () => {
    ui.toggleServerConnectionStatusOff();
    connectToServer();
  };

  serverConnection.onopen = () => {
    ui.toggleServerConnectionStatusOn();
    serverConnection.send(
      JSON.stringify({ type: "register-connection", id: id }),
    );
  };

  serverConnection.onmessage = onServerMessage;
}

function onServerMessage(e) {
  const msg = JSON.parse(e.data);
  switch (msg.type) {
    case "new-ice-candidate":
      (async () => {
        if (msg.candidate === null) return;

        const candidate = new RTCIceCandidate(msg.candidate);
        await peerConnection.addIceCandidate(candidate).catch((err) =>
          console.error("new-ice-candidate: ", err)
        );
      })();
      break;

    case "connection-offer":
      (async () => {
        // Prevent peer connection hijacking if a peer connection is already in progress
        if (peerConnectionOccupied === true) return;

        // Ignore connection offers until the sender/receiver is ready
        if (formSubmitted === false) return;

        // Receivers reject all connection offers
        if (amReceivingPeer) return;

        // Whether the connection offer ends up being accepted or not,
        // the remote description must be set to prevent the ICE candidates
        // that are received in parallel from going into the void.
        // ICE candidates going into the void prevents the connection from
        // being established even if the offer is ultimately accepted.
        await peerConnection.setRemoteDescription(msg.sdp).catch((err) =>
          console.error("connection-offer, setRemoteDescription: ", err)
        );

        if (document.querySelector(".confirmation-prompt") !== null) {
          document.querySelector(".confirmation-prompt").remove();
        }
        ui.addConfirmationPrompt(msg.from);
        const buttonReject = document.querySelector(
          ".confirmation-prompt .button-reject",
        );
        buttonReject.onclick = () => {
          document.querySelector(".confirmation-prompt").remove();

          serverConnection.send(
            JSON.stringify({
              type: "reject-offer",
              to: msg.from,
              from: id,
            }),
          );
        };
        const buttonAccept = document.querySelector(
          ".confirmation-prompt .button-accept",
        );
        buttonAccept.onclick = async () => {
          document.querySelector(".confirmation-prompt").remove();
          ui.setTrackingSheetPeer(msg.from);
          ui.togglePeerConnectionStatusRedLed("on");
          ui.setConnectionStatusPeerId(msg.from);

          const answer = await peerConnection.createAnswer().catch((err) =>
            console.error("connection-offer, createAnswer: ", err)
          );
          await peerConnection.setLocalDescription(answer);

          peerId = msg.from;
          serverConnection.send(
            JSON.stringify({
              type: "connection-answer",
              to: peerId,
              from: id,
              sdp: peerConnection.localDescription,
            }),
          );
        };
      })();
      break;

    case "connection-answer":
      (async () => {
        if (msg.from !== peerId) return;

        // const desc = new RTCSessionDescription(msg.sdp);
        await peerConnection.setRemoteDescription(msg.sdp).catch((err) =>
          console.error("connection-answer: ", err)
        );
      })();
      break;

    case "reject-offer":
      clearInterval(offerIntervalId);
      break;

    case "id-already-taken":
      location.reload();
      break;

    default:
      console.error("Unknown message: ", msg);
  }
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection({
    iceServers: [{
      urls: ["stun:stun.stunprotocol.org"],
    }],
  });

  peerConnection.onicecandidate = (e) => {
    serverConnection.send(
      JSON.stringify({
        type: "new-ice-candidate",
        to: peerId,
        candidate: e.candidate,
      }),
    );
  };

  peerConnection.oniceconnectionstatechange = () => {
    switch (peerConnection.iceConnectionState) {
      case "closed":
      case "failed":
      case "disconnected":
        ui.togglePeerConnectionStatusGreenLed("off");
        ui.togglePeerConnectionStatusRedLed("on");
        break;

      case "connected":
        ui.togglePeerConnectionStatusRedLed("off");
        ui.togglePeerConnectionStatusGreenLed("on");
        peerConnectionOccupied = true;
        break;
    }
  };

  // Triggered once a data channel is created by the receiving peer
  peerConnection.onnegotiationneeded = async () => {
    const offer = await peerConnection.createOffer().catch((err) =>
      console.error("onnegotiationneeded, createOffer: ", err)
    );
    await peerConnection.setLocalDescription(offer);

    serverConnection.send(
      JSON.stringify({
        type: "connection-offer",
        to: peerId,
        from: id,
        sdp: peerConnection.localDescription,
      }),
    );

    // If a connection answer is not sent within ~10 seconds (lower bound; set by Firefox)
    // after receiving a connection offer, the offer becomes stale and a connection cannot
    // be established. This periodically refreshes the offer until a rejection is received.
    offerIntervalId = setInterval(() => {
      serverConnection.send(
        JSON.stringify({
          type: "connection-offer",
          to: peerId,
          from: id,
          sdp: peerConnection.localDescription,
        }),
      );
    }, 10000);

    ui.togglePeerConnectionStatusRedLed("on");
  };

  // Triggered once the sending peer receives the data channel from the other peer
  peerConnection.ondatachannel = (e) => {
    dataChannel = e.channel;

    dataChannel.onopen = async () => {
      dataChannel.send(
        JSON.stringify({
          type: "file-info",
          filename: file.name,
          filesize: file.size,
        }),
      );

      await sendFile(dataChannel);
    };

    dataChannel.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      console.log(msg.m);

      setTimeout(() => {
        dataChannel.send(
          JSON.stringify({ m: `Pong ${rallyCounter++} from ${id}` }),
        );
      }, 2000);
    };
  };
}

// Sending is limited to a single file less than 16 KiB in size (sent in one go)
async function sendFile(channel) {
  channel.send(await file.arrayBuffer());
  ui.setPackageStatus("Sending", 100);
  channel.send(JSON.stringify({ type: "end-of-file" }));
}

function main() {
  id = document.getElementById("id").innerText;

  form = document.querySelector(".form");
  form.onsubmit = onFormSubmit;

  ui.prepareFileInput();

  connectToServer();
  createPeerConnection();
}

main();
