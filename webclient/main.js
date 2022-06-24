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

const form = document.querySelector(".form");
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const formData = new FormData(form);
  peerId = formData.get("peer-id");

  rx = peerConnection.createDataChannel("pipe");
  rx.onmessage = (e) => {
    const msg = JSON.parse(e.data).m;
    console.log(msg);

    setTimeout(() => {
      tx.send(JSON.stringify({ m: `Ping ${rallyCounter++} from ${id}` }));
    }, 2000);
  };
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

          const desc = new RTCSessionDescription(msg.sdp);
          await peerConnection.setRemoteDescription(desc);
          await peerConnection.setLocalDescription(
            await peerConnection.createAnswer(),
          );

          peerId = msg.from;
          serverConnection.send(
            JSON.stringify({
              type: "connection-answer",
              to: peerId,
              sdp: peerConnection.localDescription,
            }),
          );

          ui.togglePeerConnectionStatusRedLed("on");
          ui.setConnectionStatusPeerId(peerId);
        })();
        break;

      case "connection-answer":
        (async () => {
          const desc = new RTCSessionDescription(msg.sdp);
          await peerConnection.setRemoteDescription(desc).catch((err) =>
            console.error("connection-answer: ", err)
          );
        })();
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

      ui.togglePeerConnectionStatusRedLed("on");
      ui.setConnectionStatusPeerId(peerId);
    } catch (err) {
      console.error("negotiation-needed: ", err);
    }
  };

  peerConnection.ondatachannel = (e) => {
    tx = e.channel;
    tx.onopen = () => {
      tx.send(JSON.stringify({ m: "Holy shit, hi!" }));
    };
  };
}
