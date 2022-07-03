/**
 * Copyright © 2022 Mike Zakharov
 *
 * Licensed under the GNU AGPLv3 (https://www.gnu.org/licenses/agpl-3.0.html)
 */

import * as ui from "./ui.js";

const hostname = "localhost:8000";

let serverConnection = null;
let peerConnection = null;
let peerConnectionOccupied = false;
let rx = null;
let tx = null;
let rallyCounter = 0;

const id = document.getElementById("id").innerText;
let peerId;
let file;
let fileLoaded = false;
let transferSheetSubmitted = false;
let amSender = false;
let amReceiver = false;
let offerIntervalId;

// A safe assumption of 16 KiB
// https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels#understanding_message_size_limits
const CHUNK_SIZE = 16384;

let receivingBuffer = [];
let receivingFileSize;
let receivingFileName;
let receivingProgress = 0;

const form = document.querySelector(".form");
form.addEventListener("submit", (e) => {
  e.preventDefault();

  // Can only submit once per session
  if (transferSheetSubmitted) return;
  transferSheetSubmitted = true;

  ui.scrollToPackageTracking();

  const formData = new FormData(form);
  peerId = formData.get("peer-id").toUpperCase();
  file = formData.get("file");

  if (file.size !== 0 && file.name !== "") fileLoaded = true;

  if (fileLoaded) {
    const fileSizeAndName = `(${ui.formatFileSize(file.size)}) ${file.name}`;
    ui.addSendingTrackingSheet(fileSizeAndName);
    amSender = true;
  } else if (peerId !== "") {
    if (peerId.toUpperCase() === id) return;
    amReceiver = true;

    ui.addReceivingTrackingSheet(peerId);
    ui.setConnectionStatusPeerId(peerId);

    rx = peerConnection.createDataChannel("pipe");
    rx.binaryType = "arraybuffer";
    rx.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        receivingBuffer.push(e.data);

        receivingProgress += CHUNK_SIZE / receivingFileSize * 100;
        ui.setPackageStatus(
          "Receiving",
          Math.min(receivingProgress.toFixed(0), 100),
        );
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
          break;
      }

      setTimeout(() => {
        tx.send(JSON.stringify({ m: `Ping ${rallyCounter++} from ${id}` }));
      }, 2000);
    };
  } else if (peerId === "") {
    return;
  }
});

connectToServer();

function connectToServer() {
  const scheme = document.location.protocol === "https:" ? "wss://" : "ws://";
  const url = scheme + hostname;

  serverConnection = new WebSocket(url);

  // Handle a WebSocket timeout from axe-happy browsers (ehm, Firefox) by reconnecting again
  serverConnection.onclose = () => {
    console.log("Disconnected from signaling server.");
    ui.toggleServerConnectionStatusOff();

    connectToServer();
  };

  serverConnection.onopen = () => {
    console.log("Connected to signaling server.");
    ui.toggleServerConnectionStatusOn();

    serverConnection.send(
      JSON.stringify({ type: "register-connection", id: id }),
    );

    createPeerConnection();
  };

  serverConnection.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    switch (msg.type) {
      case "new-ice-candidate":
        (async () => {
          try {
            if (msg.candidate !== null) {
              const candidate = new RTCIceCandidate(msg.candidate);
              await peerConnection.addIceCandidate(candidate);
            }
          } catch (err) {
            console.error("new-ice-candidate: ", err);
          }
        })();
        break;

      case "connection-offer":
        (async () => {
          // Prevent peer connection hijacking if a peer connection is already in progress
          if (peerConnectionOccupied === true) return;

          // Ignore connection offers until the sender/receiver is ready
          if (transferSheetSubmitted === false) return;

          // Receivers reject all connection offers
          if (amReceiver) return;

          const desc = new RTCSessionDescription(msg.sdp);
          await peerConnection.setRemoteDescription(desc);
          await peerConnection.setLocalDescription(
            await peerConnection.createAnswer(),
          );

          if (document.querySelector(".confirmation-prompt") !== null) {
            document.querySelector(".confirmation-prompt").remove();
          }
          ui.addConfirmationPrompt(msg.from);
          const buttonReject = document.querySelector(
            ".confirmation-prompt .button-reject",
          );
          buttonReject.addEventListener("click", () => {
            document.querySelector(".confirmation-prompt").remove();
            serverConnection.send(
              JSON.stringify({
                type: "reject-offer",
                to: msg.from,
                from: id,
              }),
            );
          });
          const buttonAccept = document.querySelector(
            ".confirmation-prompt .button-accept",
          );
          buttonAccept.addEventListener("click", () => {
            document.querySelector(".confirmation-prompt").remove();
            ui.setTrackingSheetPeer(msg.from);
            ui.togglePeerConnectionStatusRedLed("on");
            ui.setConnectionStatusPeerId(msg.from);

            rx = peerConnection.createDataChannel("pipe");
            rx.onmessage = (e) => {
              const msg = JSON.parse(e.data).m;
              console.log(msg);

              setTimeout(() => {
                tx.send(
                  JSON.stringify({ m: `Pong ${rallyCounter++} from ${id}` }),
                );
              }, 2000);
            };

            peerId = msg.from;
            serverConnection.send(
              JSON.stringify({
                type: "connection-answer",
                to: peerId,
                from: id,
                sdp: peerConnection.localDescription,
              }),
            );
          });
        })();
        break;

      case "connection-answer":
        (async () => {
          if (msg.from !== peerId) return;

          const desc = new RTCSessionDescription(msg.sdp);
          await peerConnection.setRemoteDescription(desc).catch((err) =>
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
  };
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
        console.log("Peer connection closed/failed/disconnected :(");
        break;

      case "connected":
        ui.togglePeerConnectionStatusRedLed("off");
        ui.togglePeerConnectionStatusGreenLed("on");
        peerConnectionOccupied = true;
        break;
    }
  };

  peerConnection.onnegotiationneeded = async () => {
    try {
      const offer = await peerConnection.createOffer();
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
    } catch (err) {
      console.error("negotiation-needed: ", err);
    }
  };

  peerConnection.ondatachannel = (e) => {
    tx = e.channel;
    tx.onopen = async () => {
      if (amSender) {
        tx.send(
          JSON.stringify({
            type: "file-info",
            filename: file.name,
            filesize: file.size,
          }),
        );
        tx.send(await file.arrayBuffer());
        ui.setPackageStatus("Sending", 100);
        tx.send(JSON.stringify({ type: "end-of-file" }));
      }
    };
  };
}
