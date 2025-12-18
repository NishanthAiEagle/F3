/* script.js - Aurum Atelier: High-Speed AR & Auto-Try Integration */

const IMAGE_COUNTS = {
  gold_earrings: 5, 
  gold_necklaces: 5,
  diamond_earrings: 5, 
  diamond_necklaces: 6
};

/* DOM Elements */
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');
const indicatorDot = document.getElementById('indicator-dot');
const indicatorText = document.getElementById('indicator-text');

/* App State */
let earringImg = null, necklaceImg = null, currentType = '';
let lastGestureTime = 0;
const GESTURE_COOLDOWN = 600; 
let isProcessingHand = false;
let isProcessingFace = false;

/* --- Try All / Gallery State --- */
let autoTryRunning = false;
let autoSnapshots = [];
let autoTryIndex = 0;
let autoTryTimeout = null;

/* --- Asset Preloading Cache --- */
const preloadedAssets = {};

async function preloadCategory(type) {
  if (preloadedAssets[type]) return; 
  preloadedAssets[type] = [];
  const count = IMAGE_COUNTS[type];
  
  for(let i=1; i<=count; i++) {
    const src = `${type}/${i}.png`;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    preloadedAssets[type].push(img);
  }
}

/* --- UI Indicator Helpers --- */
function updateHandIndicator(detected) {
  if (detected) {
    indicatorDot.style.background = "#00ff88"; 
    indicatorText.textContent = "Gesture Active";
  } else {
    indicatorDot.style.background = "#555"; 
    indicatorText.textContent = "Hand Not Detected";
  }
}

function flashIndicator(color) {
    indicatorDot.style.background = color;
    setTimeout(() => { 
        if(indicatorText.textContent === "Gesture Active") indicatorDot.style.background = "#00ff88";
        else indicatorDot.style.background = "#555";
    }, 300);
}

/* ---------- HAND DETECTION ---------- */
const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 0, 
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

hands.onResults((results) => {
  isProcessingHand = false; 
  const hasHand = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;
  updateHandIndicator(hasHand);

  if (!hasHand || autoTryRunning) return; // Disable gestures during Auto-Try

  const now = Date.now();
  if (now - lastGestureTime < GESTURE_COOLDOWN) return;

  const landmarks = results.multiHandLandmarks[0];
  const indexTip = landmarks[8];
  const indexKnuckle = landmarks[5]; 

  const horizontalDiff = indexTip.x - indexKnuckle.x;

  if (horizontalDiff > 0.12) { // Next
    navigateJewelry(1);
    lastGestureTime = now;
    flashIndicator("#d4af37");
  } 
  else if (horizontalDiff < -0.12) { // Previous
    navigateJewelry(-1);
    lastGestureTime = now;
    flashIndicator("#d4af37");
  }
});

/* ---------- FACE MESH ---------- */
const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

faceMesh.setOptions({ refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

faceMesh.onResults((results) => {
  isProcessingFace = false;
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
  
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

  if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
    const lm = results.multiFaceLandmarks[0];
    
    // Key landmarks for placement
    const leftEar = { x: lm[132].x * canvasElement.width, y: lm[132].y * canvasElement.height };
    const rightEar = { x: lm[361].x * canvasElement.width, y: lm[361].y * canvasElement.height };
    const neck = { x: lm[152].x * canvasElement.width, y: lm[152].y * canvasElement.height };
    const earDist = Math.hypot(rightEar.x - leftEar.x, rightEar.y - leftEar.y);

    // Render Earrings
    if (earringImg && earringImg.complete) {
      let ew = earDist * 0.25;
      let eh = (earringImg.height/earringImg.width) * ew;
      canvasCtx.drawImage(earringImg, leftEar.x - ew/2, leftEar.y, ew, eh);
      canvasCtx.drawImage(earringImg, rightEar.x - ew/2, rightEar.y, ew, eh);
    }
    
    // Render Necklace
    if (necklaceImg && necklaceImg.complete) {
      let nw = earDist * 1.2;
      let nh = (necklaceImg.height/necklaceImg.width) * nw;
      canvasCtx.drawImage(necklaceImg, neck.x - nw/2, neck.y + (earDist*0.2), nw, nh);
    }
  }
  canvasCtx.restore();
});

/* ---------- CAMERA & APP INIT ---------- */
async function init() {
  const camera = new Camera(videoElement, {
    onFrame: async () => {
      if (!isProcessingFace) { isProcessingFace = true; await faceMesh.send({image: videoElement}); }
      if (!isProcessingHand) { isProcessingHand = true; await hands.send({image: videoElement}); }
    },
    width: 1280, height: 720
  });
  camera.start();
}

/* ---------- NAVIGATION & SELECTION ---------- */
function navigateJewelry(dir) {
  if (!currentType || !preloadedAssets[currentType]) return;
  
  const list = preloadedAssets[currentType];
  let currentImg = currentType.includes('earrings') ? earringImg : necklaceImg;
  
  let idx = list.indexOf(currentImg);
  let nextIdx = (idx + dir + list.length) % list.length;
  
  if (currentType.includes('earrings')) earringImg = list[nextIdx];
  else necklaceImg = list[nextIdx];
}

function selectJewelryType(type) {
  currentType = type;
  preloadCategory(type); 
  
  const container = document.getElementById('jewelry-options');
  container.innerHTML = '';
  container.style.display = 'flex';
  
  for(let i=1; i<=IMAGE_COUNTS[type]; i++) {
    const btnImg = new Image();
    btnImg.src = `${type}/${i}.png`;
    btnImg.className = "thumb-btn"; // Add CSS styling if needed
    btnImg.onclick = () => {
        const fullImg = preloadedAssets[type][i-1];
        if (type.includes('earrings')) earringImg = fullImg;
        else necklaceImg = fullImg;
    };
    container.appendChild(btnImg);
  }
}

function toggleCategory(cat) {
  document.getElementById('subcategory-buttons').style.display = 'flex';
  const subs = document.querySelectorAll('.subpill');
  subs.forEach(b => b.style.display = b.innerText.toLowerCase().includes(cat) ? 'inline-block' : 'none');
}

/* ---------- TRY ALL (SET 2 FEATURE) ---------- */
async function toggleTryAll() {
  if (!currentType) {
    alert("Please select a sub-category (e.g. Gold Earrings) first!");
    return;
  }
  
  if (autoTryRunning) {
    stopAutoTry();
  } else {
    startAutoTry();
  }
}

function startAutoTry() {
  autoTryRunning = true;
  autoSnapshots = [];
  autoTryIndex = 0;
  
  const btn = document.getElementById('tryall-btn');
  btn.textContent = "STOPPING...";
  btn.classList.add('active');
  
  runAutoStep();
}

function stopAutoTry() {
  autoTryRunning = false;
  if (autoTryTimeout) clearTimeout(autoTryTimeout);
  
  const btn = document.getElementById('tryall-btn');
  btn.textContent = "Try All";
  btn.classList.remove('active');
  
  if (autoSnapshots.length > 0) showGallery();
}

async function runAutoStep() {
  if (!autoTryRunning) return;

  const assets = preloadedAssets[currentType];
  if (!assets || autoTryIndex >= assets.length) {
    stopAutoTry();
    return;
  }

  // Set current jewelry
  const targetImg = assets[autoTryIndex];
  if (currentType.includes('earrings')) earringImg = targetImg;
  else necklaceImg = targetImg;

  // Wait for AR positioning to settle, then snap
  autoTryTimeout = setTimeout(() => {
    captureToGallery();
    autoTryIndex++;
    runAutoStep();
  }, 1500); 
}

function captureToGallery() {
  const dataUrl = canvasElement.toDataURL('image/png');
  autoSnapshots.push(dataUrl);
  
  // Flash Effect
  const flash = document.getElementById('flash-overlay');
  if(flash) {
    flash.classList.add('active');
    setTimeout(() => flash.classList.remove('active'), 100);
  }
}

function showGallery() {
  const modal = document.getElementById('gallery-modal');
  const grid = document.getElementById('gallery-grid');
  if(!modal || !grid) return;

  grid.innerHTML = '';
  autoSnapshots.forEach(src => {
    const img = document.createElement('img');
    img.src = src;
    img.className = "gallery-thumb";
    grid.appendChild(img);
  });
  
  modal.style.display = 'flex';
}

function closeGallery() {
  document.getElementById('gallery-modal').style.display = 'none';
}

/* ---------- INITIALIZATION ---------- */
window.onload = init;
window.toggleCategory = toggleCategory;
window.selectJewelryType = selectJewelryType;
window.toggleTryAll = toggleTryAll;
window.closeGallery = closeGallery;