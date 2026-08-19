/**
 * VisionManager - Centralized Camera & MediaPipe Holistic Tracking Engine.
 * Headless logic service responsible for managing webcam captures, pre-filtering frames,
 * downloading dependencies, and running MediaPipe Holistic in a background loop.
 * Reuses a single Holistic instance across starts/stops to prevent WebAssembly re-initialization crashes.
 */
export class VisionManager {
  constructor(app) {
    this.app = app;
    this.isActive = false;
    this.isMediaPipeActive = false;
    
    // Load persisted settings
    this.isGlobalEnabled = localStorage.getItem('gesture_control_enabled') === 'true';
    this.camBrightness = parseInt(localStorage.getItem('gesture_cam_brightness') || '100', 10);
    this.camContrast = parseInt(localStorage.getItem('gesture_cam_contrast') || '110', 10);

    this.listeners = [];
    this.cameraStream = null;
    this.holisticInstance = null;

    // Status change listener callback (set by UI layer)
    this.onStatusChange = null;

    // Create background video capture element (hidden)
    this.videoEl = document.createElement('video');
    this.videoEl.autoplay = true;
    this.videoEl.playsInline = true;
    this.videoEl.muted = true;
    this.videoEl.style.position = 'absolute';
    this.videoEl.style.width = '0px';
    this.videoEl.style.height = '0px';
    this.videoEl.style.opacity = '0';
    this.videoEl.style.pointerEvents = 'none';
    document.body.appendChild(this.videoEl);

    // Create off-screen canvas pre-filter pipeline
    this.processCanvas = document.createElement('canvas');
    this.processCanvas.width = 640;
    this.processCanvas.height = 480;
    this.processCtx = this.processCanvas.getContext('2d');

    // Auto-start camera if globally enabled
    if (this.isGlobalEnabled) {
      this.start().catch(err => {
        console.warn('[VisionManager] Auto-start failed:', err);
      });
    }
  }

  /**
   * Set vision tracking active statuses and notify subscribers.
   */
  setStatus(isActive, isMediaPipeActive) {
    this.isActive = isActive;
    this.isMediaPipeActive = isMediaPipeActive;
    if (this.onStatusChange) {
      try {
        this.onStatusChange({ isActive, isMediaPipeActive });
      } catch (e) {
        console.error('[VisionManager] onStatusChange callback exception:', e);
      }
    }
  }

  /**
   * Load CDN scripts for MediaPipe Holistic modules.
   */
  async loadScripts() {
    if (window.Holistic && window.Camera) return;

    const loadScript = (url) => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
      document.head.appendChild(script);
    });

    try {
      if (!window.Camera) {
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
      }
      if (!window.Holistic) {
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js');
      }
      console.log('[VisionManager] MediaPipe Holistic scripts successfully linked.');
    } catch (err) {
      console.error('[VisionManager] MediaPipe loading failed:', err);
      alert('無法載入 MediaPipe 資源，請檢查網路連線！');
      throw err;
    }
  }

  /**
   * Initialize camera hardware, apply preprocess filter, and start MediaPipe tracking.
   */
  async start() {
    if (this.isActive) return;
    this.isActive = true;

    // Trigger status change (initializing or active)
    this.setStatus(true, this.isMediaPipeActive);

    try {
      // If holistic is already initialized, but cameraStream was stopped/nulled, recreate and start it
      if (this.holisticInstance && !this.cameraStream) {
        this.cameraStream = new window.Camera(this.videoEl, {
          onFrame: async () => {
            if (!this.isActive || !this.holisticInstance) return;
            try {
              // Apply brightness/contrast hardware-acceleration pre-filter
              this.processCtx.filter = `brightness(${this.camBrightness}%) contrast(${this.camContrast}%)`;
              this.processCtx.drawImage(this.videoEl, 0, 0, 640, 480);
              this.processCtx.filter = 'none';
              
              if (this.holisticInstance) {
                await this.holisticInstance.send({ image: this.processCanvas });
              }
            } catch (e) {
              console.warn('[VisionManager] Holistic send bypassed:', e);
            }
          },
          width: 640,
          height: 480,
          frameRate: { ideal: 60, min: 30 }
        });
        await this.cameraStream.start();
        this.setStatus(true, true);
        console.log('[VisionManager] Camera stream re-created & started (reusing Holistic instance).');
        return;
      }

      // Fallback: If both exist, just start
      if (this.holisticInstance && this.cameraStream) {
        await this.cameraStream.start();
        this.setStatus(true, true);
        console.log('[VisionManager] Camera stream resumed (reusing Holistic instance).');
        return;
      }

      // Load dependencies
      await this.loadScripts();

      if (!window.Holistic) {
        throw new Error('Holistic engine undefined.');
      }

      // Check secure context
      const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      if (!isSecure) {
        throw new Error('Insecure context. Webcam requires HTTPS.');
      }

      // Reset global Emscripten Module and arguments to fresh empty structures to prevent re-initialization crashes
      try {
        window.Module = {};
        window.arguments = [];
      } catch (e) {
        console.warn('[VisionManager] Global Emscripten Module cleanup failed:', e);
      }

      // Instantiate Holistic tracking instance (exactly once)
      const holistic = new window.Holistic({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
      });

      holistic.setOptions({
        modelComplexity: 0,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      // Hook up Holistic results
      holistic.onResults((results) => {
        if (!this.isMediaPipeActive) {
          this.isMediaPipeActive = true;
          this.setStatus(true, true);
        }
        
        // Broadcast tracking frame results to all registered listeners
        this.listeners.forEach(callback => {
          try {
            callback(results);
          } catch (e) {
            console.error('[VisionManager] Listener callback exception:', e);
          }
        });
      });

      // Start webcam camera capture utility
      this.cameraStream = new window.Camera(this.videoEl, {
        onFrame: async () => {
          if (!this.isActive || !this.holisticInstance) return;
          try {
            // Apply brightness/contrast hardware-acceleration pre-filter
            this.processCtx.filter = `brightness(${this.camBrightness}%) contrast(${this.camContrast}%)`;
            this.processCtx.drawImage(this.videoEl, 0, 0, 640, 480);
            this.processCtx.filter = 'none';
            
            if (this.holisticInstance) {
              await this.holisticInstance.send({ image: this.processCanvas });
            }
          } catch (e) {
            console.warn('[VisionManager] Holistic send bypassed:', e);
          }
        },
        width: 640,
        height: 480,
        frameRate: { ideal: 60, min: 30 }
      });

      this.holisticInstance = holistic;
      await this.cameraStream.start();
      console.log('[VisionManager] Video capture loop started.');

    } catch (err) {
      console.error('[VisionManager] Initialization failed:', err);
      this.isActive = false;
      this.isMediaPipeActive = false;
      this.setStatus(false, false);
      alert('開啟鏡頭失敗：\n' + err.message);
    }
  }

  /**
   * Stop webcam cameras but keep the Holistic tracking instance alive in memory for reuse.
   */
  stop() {
    if (!this.isActive) return;
    this.isActive = false;
    this.setStatus(false, this.isMediaPipeActive);

    console.log('[VisionManager] Pausing video capture stream and stopping loop...');

    if (this.cameraStream) {
      try {
        if (typeof this.cameraStream.stop === 'function') {
          this.cameraStream.stop();
        }
      } catch (e) {
        console.warn('Failed to stop cameraStream loop cleanly:', e);
      }
      try {
        const stream = this.videoEl.srcObject;
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        this.videoEl.srcObject = null;
      } catch (e) {
        console.warn('Failed to stop webcam tracks cleanly:', e);
      }
      this.cameraStream = null; // Clean up stream instance to allow fresh recreation
    }
  }

  /**
   * Toggle global tracking active preference.
   */
  toggleGlobalEnabled() {
    this.isGlobalEnabled = !this.isGlobalEnabled;
    localStorage.setItem('gesture_control_enabled', this.isGlobalEnabled);
    
    // Force a full page reload to ensure clean camera Wasm/WebGL context initialization,
    // avoiding any cumulative memory/performance leaks across toggles.
    location.reload();
  }

  /**
   * Update preprocessing camera filters in real-time.
   */
  updateFilters(brightness, contrast) {
    this.camBrightness = brightness;
    this.camContrast = contrast;
    localStorage.setItem('gesture_cam_brightness', brightness);
    localStorage.setItem('gesture_cam_contrast', contrast);
  }

  /**
   * Pub-Sub Registration.
   */
  onResults(callback) {
    if (typeof callback === 'function' && !this.listeners.includes(callback)) {
      this.listeners.push(callback);
    }
  }

  /**
   * Pub-Sub Deregistration.
   */
  removeResultsListener(callback) {
    this.listeners = this.listeners.filter(cb => cb !== callback);
  }
}
