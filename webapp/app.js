(() => {
  "use strict";

  /* ─── State ──────────────────────────────────────────────────────── */
  const state = { items: [], current: -1 };
  let scene, camera, renderer, mesh, animId, projectionMode = "auto";
  let pointerDown = false, pointerStart = { x: 0, y: 0 };
  let yaw = 0, pitch = 0, targetFov = 65;
  let activeVideo = null;

  /* ─── DOM refs ───────────────────────────────────────────────────── */
  const $ = (s) => document.querySelector(s);
  const uploadBtn = $("#uploadBtn");
  const browseBtn = $("#browseBtn");
  const fileInput = $("#fileInput");
  const dropZone = $("#dropZone");
  const mediaList = $("#mediaList");
  const mediaCount = $("#mediaCount");
  const mediaBadge = $("#mediaBadge");
  const viewerTitle = $("#viewerTitle");
  const viewerStage = $("#viewerStage");
  const emptyViewer = $("#emptyViewer");
  const viewerLoading = $("#viewerLoading");
  const panoStage = $("#panoStage");
  const cornerLabel = $("#cornerLabel");
  const cornerText = $("#cornerText");
  const viewerControls = $("#viewerControls");
  const playPause = $("#playPause");
  const timeDisplay = $("#timeDisplay");
  const bottomInfo = $("#bottomInfo");
  const projectionSelect = $("#projectionSelect");

  /* ─── File handling ──────────────────────────────────────────────── */
  const IMG_TYPES = new Set(["jpg","jpeg","png","webp","gif"]);
  const VID_TYPES = new Set(["mp4","webm","ogg","mov","avi"]);
  function ext(name) { return (name.split(".").pop() || "").toLowerCase(); }
  function isImage(name) { return IMG_TYPES.has(ext(name)); }
  function isVideo(name) { return VID_TYPES.has(ext(name)); }
  function fmtSize(b) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
  }
  function fmtTime(s) {
    if (!isFinite(s)) return "00:00";
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
  }
  function pad2(n) { return String(n).padStart(2, "0"); }

  /* ─── Client-side downscaling + EXIF decode ──────────────────────── */
  const MAX_DIM = 4096;
  async function decodeImageFile(file) {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    let w = bmp.width, h = bmp.height, target = bmp;
    if (w > MAX_DIM || h > MAX_DIM) {
      const s = Math.min(MAX_DIM / w, MAX_DIM / h);
      const nw = Math.round(w * s), nh = Math.round(h * s);
      const c = new OffscreenCanvas(nw, nh);
      c.getContext("2d").drawImage(bmp, 0, 0, nw, nh);
      target = await createImageBitmap(c);
      bmp.close();
    }
    return target;
  }

  async function makeThumb(bitmap, tw = 104, th = 94) {
    const c = new OffscreenCanvas(tw, th);
    const ctx = c.getContext("2d");
    const bw = bitmap.width, bh = bitmap.height;
    const scale = Math.max(tw / bw, th / bh);
    const dw = bw * scale, dh = bh * scale;
    ctx.drawImage(bitmap, (tw - dw) / 2, (th - dh) / 2, dw, dh);
    return c.convertToBlob({ type: "image/webp", quality: 0.8 });
  }

  async function handleFiles(files) {
    const list = Array.from(files).filter(f => isImage(f.name) || isVideo(f.name));
    if (!list.length) return;
    viewerLoading.style.display = "flex";

    const added = [];
    for (const f of list) {
      if (isImage(f.name)) {
        const bmp = await decodeImageFile(f);
        const thumbBlob = await makeThumb(bmp);
        added.push({
          id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
          name: f.name,
          type: "image",
          file: f,
          objectUrl: URL.createObjectURL(f),
          thumbUrl: URL.createObjectURL(thumbBlob),
          bitmap: bmp,
          width: bmp.width,
          height: bmp.height,
          size: f.size,
        });
      } else {
        const url = URL.createObjectURL(f);
        const meta = await getVideoMeta(f);
        added.push({
          id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
          name: f.name,
          type: "video",
          file: f,
          objectUrl: url,
          thumbUrl: url,
          width: meta.w,
          height: meta.h,
          size: f.size,
          duration: meta.dur,
        });
      }
    }

    state.items.push(...added);
    renderList();
    viewerLoading.style.display = "none";

    if (state.current < 0 && added.length) {
      selectItem(state.items.length - added.length);
    }
  }

  function getVideoMeta(file) {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        const d = v.duration;
        v.src = "";
        resolve({ w: v.videoWidth, h: v.videoHeight, dur: d });
      };
      v.onerror = () => resolve({ w: 0, h: 0, dur: 0 });
      v.src = URL.createObjectURL(file);
    });
  }

  /* ─── Media list render ──────────────────────────────────────────── */
  function renderList() {
    mediaCount.textContent = pad2(state.items.length);
    mediaList.innerHTML = state.items.map((it, i) => `
      <div class="media-item${state.current === i ? " media-item--selected" : ""}" data-idx="${i}">
        <button class="media-item__select" data-idx="${i}">
          <div class="media-item__thumb">
            ${it.type === "video"
              ? `<video src="${it.objectUrl}" muted></video>`
              : `<img src="${it.thumbUrl}" alt="" loading="lazy"/>`
            }
          </div>
          <div class="media-item__info">
            <span class="media-item__name">${it.name}</span>
            <span class="media-item__meta">${fmtSize(it.size)}${it.width ? " · " + it.width + "×" + it.height : ""}</span>
          </div>
          <span class="media-badge${it.type === "video" ? " media-badge--video" : ""}">${it.type === "video" ? "VIDEO" : "IMAGE"}</span>
        </button>
        <button class="media-item__delete" data-del="${i}" aria-label="Remove">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
    `).join("");
  }

  /* ─── Item selection + panorama load ─────────────────────────────── */
  async function selectItem(idx) {
    const item = state.items[idx];
    if (!item) return;
    state.current = idx;
    renderList();

    viewerTitle.textContent = item.name;
    viewerTitle.style.whiteSpace = "nowrap";
    viewerTitle.style.fontFamily = "var(--font-display)";

    emptyViewer.style.display = "none";
    viewerLoading.style.display = "flex";
    cornerLabel.style.display = "none";
    viewerControls.style.display = "none";

    stopCurrent();

    if (item.type === "video") {
      await loadVideo(item);
    } else {
      await loadImage(item);
    }

    viewerLoading.style.display = "none";
    cornerLabel.style.display = "flex";
    viewerControls.style.display = "flex";
  }

  async function loadImage(item) {
    initThree();
    const tex = new THREE.Texture(item.bitmap);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    applyProjection(item.width, item.height);
    setTexture(tex);
    bottomInfo.textContent = item.name + " · " + item.width + "×" + item.height;
  }

  async function loadVideo(item) {
    initThree();
    const video = document.createElement("video");
    video.src = item.objectUrl;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    await video.play().catch(() => {});
    activeVideo = video;

    const tex = new THREE.VideoTexture(video);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    applyProjection(item.width, item.height);
    setTexture(tex);
    bottomInfo.textContent = item.name + " · " + item.width + "×" + item.height;

    mediaBadge.textContent = "VIDEO";
    mediaBadge.className = "media-badge media-badge--video";
    mediaBadge.style.display = "inline-flex";

    playPause.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
  }

  function applyProjection(w, h) {
    const sel = projectionSelect.value;
    if (sel === "auto") {
      projectionMode = (w && h && w / h >= 1.8) ? "360" : "180";
    } else {
      projectionMode = sel;
    }
    cornerText.textContent = projectionMode === "360" ? "360°" : "180°";
  }

  function setTexture(tex) {
    if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
    const geo = projectionMode === "180"
      ? new THREE.SphereGeometry(500, 60, 40, 0, Math.PI)
      : new THREE.SphereGeometry(500, 60, 40);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide });
    mesh = new THREE.Mesh(geo, mat);
    mesh.scale.x = -1;
    scene.add(mesh);
    yaw = 0; pitch = 0; targetFov = 65;
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
  }

  /* ─── Three.js init ──────────────────────────────────────────────── */
  let threeReady = false;
  function initThree() {
    if (threeReady) return;
    threeReady = true;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(65, 1, 1, 1100);
    camera.position.set(0, 0, 0.1);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0a0b0e);
    panoStage.appendChild(renderer.domElement);
    sizeRenderer();
    startLoop();
    bindControls();
  }

  function sizeRenderer() {
    const rect = viewerStage.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function startLoop() {
    function tick() {
      animId = requestAnimationFrame(tick);
      if (mesh) {
        mesh.rotation.y += (yaw - mesh.rotation.y) * 0.12;
        mesh.rotation.x += (pitch - mesh.rotation.x) * 0.12;
      }
      if (camera.fov !== targetFov) {
        camera.fov += (targetFov - camera.fov) * 0.12;
        camera.updateProjectionMatrix();
      }
      if (activeVideo && activeVideo.readyState >= 2) {
        if (activeVideo.paused) {
          playPause.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>`;
        } else {
          playPause.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
        }
        timeDisplay.textContent = fmtTime(activeVideo.currentTime) + " / " + fmtTime(activeVideo.duration);
      }
      renderer.render(scene, camera);
    }
    tick();
  }

  function stopCurrent() {
    if (activeVideo) {
      activeVideo.pause();
      activeVideo.src = "";
      activeVideo = null;
    }
    if (mesh) {
      scene.remove(mesh);
      mesh.material.dispose();
      mesh.geometry.dispose();
      mesh = null;
    }
    mediaBadge.style.display = "none";
  }

  /* ─── Controls ───────────────────────────────────────────────────── */
  function bindControls() {
    const el = panoStage;
    el.addEventListener("pointerdown", (e) => {
      pointerDown = true;
      pointerStart = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!pointerDown) return;
      const dx = e.clientX - pointerStart.x;
      const dy = e.clientY - pointerStart.y;
      yaw += dx * -0.003;
      pitch += dy * 0.003;
      const pitchMax = projectionMode === "180" ? 1.05 : 1.5;
      pitch = Math.max(-pitchMax, Math.min(pitchMax, pitch));
      if (projectionMode === "180") {
        const yawLim = Math.PI * 0.5;
        yaw = Math.max(-yawLim, Math.min(yawLim, yaw));
      }
      pointerStart = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener("pointerup", () => { pointerDown = false; });
    el.addEventListener("pointercancel", () => { pointerDown = false; });

    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      targetFov = Math.max(20, Math.min(90, targetFov + e.deltaY * 0.04));
    }, { passive: false });

    if (window.DeviceOrientationEvent) {
      window.addEventListener("deviceorientation", (e) => {
        if (e.gamma == null || e.beta == null) return;
        yaw = (e.gamma / 90) * Math.PI;
        pitch = ((e.beta - 45) / 90) * Math.PI;
        pitch = Math.max(-1.5, Math.min(1.5, pitch));
      });
    }
  }

  window.addEventListener("resize", () => { if (threeReady) sizeRenderer(); });

  /* ─── Play/Pause ─────────────────────────────────────────────────── */
  playPause.addEventListener("click", () => {
    if (!activeVideo) return;
    activeVideo.paused ? activeVideo.play() : activeVideo.pause();
  });

  /* ─── Projection select ──────────────────────────────────────────── */
  projectionSelect.addEventListener("change", () => {
    const item = state.items[state.current];
    if (!item) return;
    applyProjection(item.width, item.height);
    setTexture(mesh.material.map);
  });

  /* ─── Upload triggers ────────────────────────────────────────────── */
  uploadBtn.addEventListener("click", () => fileInput.click());
  browseBtn.addEventListener("click", (e) => { e.stopPropagation(); fileInput.click(); });
  dropZone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => { handleFiles(fileInput.files); fileInput.value = ""; });

  dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("upload-zone--active"); });
  dropZone.addEventListener("dragleave", () => { dropZone.classList.remove("upload-zone--active"); });
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("upload-zone--active");
    handleFiles(e.dataTransfer.files);
  });

  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => e.preventDefault());

  /* ─── Media list events (delegation) ─────────────────────────────── */
  mediaList.addEventListener("click", (e) => {
    const delBtn = e.target.closest("[data-del]");
    if (delBtn) {
      const i = parseInt(delBtn.dataset.del, 10);
      removeItem(i);
      return;
    }
    const selBtn = e.target.closest("[data-idx]");
    if (selBtn) {
      selectItem(parseInt(selBtn.dataset.idx, 10));
    }
  });

  function removeItem(idx) {
    const it = state.items[idx];
    if (!it) return;
    URL.revokeObjectURL(it.objectUrl);
    if (it.thumbUrl !== it.objectUrl) URL.revokeObjectURL(it.thumbUrl);
    if (it.bitmap) it.bitmap.close();
    state.items.splice(idx, 1);
    if (state.current === idx) {
      stopCurrent();
      state.current = state.items.length ? Math.min(idx, state.items.length - 1) : -1;
      if (state.current >= 0) selectItem(state.current);
      else resetEmpty();
    } else if (state.current > idx) {
      state.current--;
    }
    renderList();
  }

  function resetEmpty() {
    viewerTitle.textContent = "";
    viewerTitle.innerHTML = "Choose a panorama<br>to start exploring";
    emptyViewer.style.display = "flex";
    cornerLabel.style.display = "none";
    viewerControls.style.display = "none";
    viewerLoading.style.display = "none";
    bottomInfo.textContent = "PanoSpace · Local Viewer";
    mediaBadge.style.display = "none";
    if (panoStage) panoStage.style.display = "none";
  }

  /* ─── Keyboard shortcuts ─────────────────────────────────────────── */
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
    if (e.key === " ") { e.preventDefault(); playPause.click(); }
    if (e.key === "ArrowLeft") yaw += 0.15;
    if (e.key === "ArrowRight") yaw -= 0.15;
    if (e.key === "ArrowUp") pitch = Math.min(1.5, pitch + 0.1);
    if (e.key === "ArrowDown") pitch = Math.max(-1.5, pitch - 0.1);
    if (e.key === "+" || e.key === "=") targetFov = Math.max(20, targetFov - 4);
    if (e.key === "-" || e.key === "_") targetFov = Math.min(90, targetFov + 4);
  });
})();