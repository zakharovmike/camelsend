const fileName = document.getElementById("file-name");

const fileInput = document.getElementById("file-input");
fileInput.addEventListener("change", () => {
  fileName.innerText = `(${formatFileSize(fileInput.files[0].size)}) ${
    fileInput.files[0].name
  }`;
});

export function formatFileSize(bytes) {
  let size = bytes;
  let unit = " B";
  if (bytes > 1000) {
    size /= 1000;
    unit = " kB";
  }
  if (bytes > 1000000) {
    size /= 1000;
    unit = " MB";
  }
  if (bytes > 1000000000) {
    size /= 1000;
    unit = " GB";
  }
  size = unit === " B" ? size : size.toFixed(1);

  return size + unit;
}

export function toggleServerConnectionStatusOff() {
  const connectionMonitor = document.getElementById("connection-monitor");
  const statusServer =
    connectionMonitor.querySelectorAll(".connection-status")[0];
  const redLed = statusServer.querySelectorAll(".status-led")[0];
  const greenLed = statusServer.querySelectorAll(".status-led")[1];

  greenLed.classList.remove("green-led-on");
  redLed.classList.add("red-led-on");
}

export function toggleServerConnectionStatusOn() {
  const connectionMonitor = document.getElementById("connection-monitor");
  const statusServer =
    connectionMonitor.querySelectorAll(".connection-status")[0];
  const redLed = statusServer.querySelectorAll(".status-led")[0];
  const greenLed = statusServer.querySelectorAll(".status-led")[1];

  redLed.classList.remove("red-led-on");
  greenLed.classList.add("green-led-on");
}

export function togglePeerConnectionStatusRedLed(newState) {
  const connectionMonitor = document.getElementById("connection-monitor");
  const statusPeer =
    connectionMonitor.querySelectorAll(".connection-status")[1];
  const redLed = statusPeer.querySelectorAll(".status-led")[0];

  newState === "on"
    ? redLed.classList.add("red-led-on")
    : redLed.classList.remove("red-led-on");
}

export function togglePeerConnectionStatusGreenLed(newState) {
  const connectionMonitor = document.getElementById("connection-monitor");
  const statusPeer =
    connectionMonitor.querySelectorAll(".connection-status")[1];
  const greenLed = statusPeer.querySelectorAll(".status-led")[1];

  newState === "on"
    ? greenLed.classList.add("green-led-on")
    : greenLed.classList.remove("green-led-on");
}

export function setConnectionStatusPeerId(peerId) {
  const statusPeerId = document.getElementById("peer-id-connection-status");
  statusPeerId.innerText = peerId.toUpperCase();
}

function addSendingTrackingSheet(filename, peerId) {
  // <div class="tracking-sheet-wrapper">
  //   <div class="sheet tracking-sheet">
  //     <div class="file-name">
  //       {{filename}}
  //     </div>
  //     <div class="tracking-to-arrow">→</div>
  //     <div id="tracking-peed-id">{{peerId}}</div>
  //     <div class="package-status">
  //       <div>Packing</div>
  //       <div><span>0</span>%</div>
  //     </div>
  //     <div class="sheet-shadow"></div>
  //   </div>
  // </div>

  const trackingSheetWrapper = document.createElement("div");
  trackingSheetWrapper.setAttribute("class", "tracking-sheet-wrapper");

  const trackingSheet = document.createElement("div");
  trackingSheet.setAttribute("class", "sheet tracking-sheet");

  const file = document.createElement("div");
  file.setAttribute("class", "file-name");
  file.innerText = filename;

  const arrow = document.createElement("div");
  arrow.setAttribute("class", "tracking-to-arrow");
  arrow.innerText = "→";

  const peer = document.createElement("div");
  peer.setAttribute("id", "tracking-peer-id");
  peer.innerText = peerId;

  const status = document.createElement("div");
  status.setAttribute("class", "package-status");

  const statusText = document.createElement("div");
  statusText.innerText = "Sending";

  const statusNumberWrap = document.createElement("div");
  const statusNumber = document.createElement("span");
  statusNumber.innerText = 0;
  const percent = new DocumentFragment();
  percent.append("%");

  statusNumberWrap.appendChild(statusNumber);
  statusNumberWrap.appendChild(percent);

  status.appendChild(statusText);
  status.appendChild(statusNumberWrap);

  const sheetShadow = document.createElement("div");
  sheetShadow.setAttribute("class", "sheet-shadow");

  trackingSheet.appendChild(file);
  trackingSheet.appendChild(arrow);
  trackingSheet.appendChild(peer);
  trackingSheet.appendChild(status);
  trackingSheet.appendChild(sheetShadow);

  trackingSheetWrapper.appendChild(trackingSheet);

  const packageTracker = document.getElementById("package-tracking");
  packageTracker.appendChild(trackingSheetWrapper);
}

function addReceivingTrackingSheet(peerId, filename) {
  // <div class="tracking-sheet-wrapper">
  //   <div class="sheet tracking-sheet">
  //     <div id="tracking-peed-id">{{peerId}}</div>
  //     <div class="tracking-to-arrow">→</div>
  //     <div class="file-name">{{filename}}</div>
  //     <div class="package-status">
  //       <div>Receiving</div>
  //       <div><span>0</span>%</div>
  //     </div>
  //     <div class="sheet-shadow"></div>
  //   </div>
  // </div>

  const trackingSheetWrapper = document.createElement("div");
  trackingSheetWrapper.setAttribute("class", "tracking-sheet-wrapper");

  const trackingSheet = document.createElement("div");
  trackingSheet.setAttribute("class", "sheet tracking-sheet");

  const peer = document.createElement("div");
  peer.setAttribute("id", "tracking-peer-id");
  peer.innerText = peerId;

  const arrow = document.createElement("div");
  arrow.setAttribute("class", "tracking-to-arrow");
  arrow.innerText = "→";

  const file = document.createElement("div");
  file.setAttribute("class", "file-name");
  file.innerText = filename;

  const status = document.createElement("div");
  status.setAttribute("class", "package-status");

  const statusText = document.createElement("div");
  statusText.innerText = "Receiving";

  const statusNumberWrap = document.createElement("div");
  const statusNumber = document.createElement("span");
  statusNumber.innerText = 0;
  const percent = new DocumentFragment();
  percent.append("%");

  statusNumberWrap.appendChild(statusNumber);
  statusNumberWrap.appendChild(percent);

  status.appendChild(statusText);
  status.appendChild(statusNumberWrap);

  const sheetShadow = document.createElement("div");
  sheetShadow.setAttribute("class", "sheet-shadow");

  trackingSheet.appendChild(peer);
  trackingSheet.appendChild(arrow);
  trackingSheet.appendChild(file);
  trackingSheet.appendChild(status);
  trackingSheet.appendChild(sheetShadow);

  trackingSheetWrapper.appendChild(trackingSheet);

  const packageTracker = document.getElementById("package-tracking");
  packageTracker.appendChild(trackingSheetWrapper);
}

function setPackageStatus(statusText, statusPercentage) {
  const packageStatus = document.querySelector(
    "#package-tracking > .tracking-sheet-wrapper > .tracking-sheet > .package-status",
  );
  const packageStatusText = packageStatus.children[0];
  const packageStatusNumber = packageStatus.children[1].children[0];

  packageStatusText.innerText = statusText;
  packageStatusNumber.innerText = statusPercentage;
}

function showDownloadButton() {
  const buttonContainer = document.createElement("div");
  buttonContainer.setAttribute("class", "tracking-sheet-button");

  const downloadButton = document.createElement("button");
  downloadButton.setAttribute("class", "button");
  downloadButton.innerText = "Download";

  buttonContainer.appendChild(downloadButton);

  const trackingSheet = document.querySelector(
    "#package-tracking > .tracking-sheet-wrapper > .tracking-sheet",
  );
  const packageStatus = trackingSheet.querySelector(".package-status");
  packageStatus.remove();
  trackingSheet.appendChild(buttonContainer);
}

function addConfirmationPrompt(peerId) {
  // <div class="confirmation-prompt">
  //   <div>
  //     Send file to <b><span id="peer-id-confirmation">{{peerId}}</span></b>?
  //   </div>
  //   <div>
  //     <button class="button button-reject">⨯</button>
  //     <button class="button button-accept">✓</button>
  //   </div>
  // </div>

  const confirmationPrompt = document.createElement("div");
  confirmationPrompt.setAttribute("class", "confirmation-prompt");

  const confirmationTextWrapper = document.createElement("div");
  const confirmationTextBold = document.createElement("b");
  const confirmationTextSpan = document.createElement("span");
  confirmationTextSpan.setAttribute("id", "peer-id-confirmation");
  confirmationTextSpan.innerText = peerId;
  confirmationTextBold.appendChild(confirmationTextSpan);
  const questionText = new DocumentFragment();
  questionText.append("Send file to ");
  const questionMark = new DocumentFragment();
  questionMark.append("?");
  confirmationTextWrapper.appendChild(questionText);
  confirmationTextWrapper.appendChild(confirmationTextBold);
  confirmationTextWrapper.appendChild(questionMark);

  const buttonWrapper = document.createElement("div");
  const rejectButton = document.createElement("button");
  rejectButton.setAttribute("class", "button button-reject");
  rejectButton.innerText = "⨯";
  const acceptButton = document.createElement("button");
  acceptButton.setAttribute("class", "button button-accept");
  acceptButton.innerText = "✓";
  buttonWrapper.appendChild(rejectButton);
  buttonWrapper.appendChild(acceptButton);

  confirmationPrompt.appendChild(confirmationTextWrapper);
  confirmationPrompt.appendChild(buttonWrapper);

  const trackingSheetWrapper = document.querySelector(
    "#package-tracking > .tracking-sheet-wrapper",
  );
  trackingSheetWrapper.appendChild(confirmationPrompt);
}

function scrollToPackageTracking() {
  const packageTracker = document.getElementById("package-tracking");
  packageTracker.scrollIntoView(true);
}
