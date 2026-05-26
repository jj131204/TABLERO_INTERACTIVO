export class CanvasEngine {
  constructor(viewportId, containerId) {
    this.viewport = document.getElementById(viewportId);
    this.container = document.getElementById(containerId);
    
    // Zoom and Pan States
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    
    this.minZoom = 0.15;
    this.maxZoom = 3.0;
    
    // Panning interaction states
    this.isPanning = false;
    this.startX = 0;
    this.startY = 0;
    this.spacePressed = false;
    
    this.onCanvasTransformCallback = null;

    this.initEvents();
    this.applyTransform();
  }

  initEvents() {
    // Detect spacebar for panning
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA' && !document.activeElement.isContentEditable) {
        this.spacePressed = true;
        this.viewport.style.cursor = 'grab';
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spacePressed = false;
        this.viewport.style.cursor = '';
      }
    });

    // Panning starts
    this.viewport.addEventListener('mousedown', (e) => {
      // Pan triggers: Space key + left click, middle click (button 1), or right click (button 2)
      const isMiddleClick = e.button === 1;
      const isRightClick = e.button === 2;
      const isPanTrigger = this.spacePressed || isMiddleClick || isRightClick || e.target === this.viewport || e.target.classList.contains('canvas-grid-bg');

      if (isPanTrigger) {
        this.isPanning = true;
        this.startX = e.clientX - this.panX;
        this.startY = e.clientY - this.panY;
        this.viewport.style.cursor = 'grabbing';
        
        if (isRightClick) {
          e.preventDefault(); // Prevent context menu
        }
      }
    });

    // Disable default context menu on canvas grid to allow right-click panning
    this.viewport.addEventListener('contextmenu', (e) => {
      if (e.target === this.viewport || e.target.classList.contains('canvas-grid-bg') || this.isPanning) {
        e.preventDefault();
      }
    });

    // Panning moves
    window.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      
      this.panX = e.clientX - this.startX;
      this.panY = e.clientY - this.startY;
      this.applyTransform();
    });

    // Panning ends
    window.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.viewport.style.cursor = this.spacePressed ? 'grab' : '';
      }
    });

    // Zoom on mouse wheel (focuses on the mouse cursor!)
    this.viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      
      const zoomFactor = 0.08;
      let newZoom = this.zoom;
      
      if (e.deltaY < 0) {
        newZoom = Math.min(this.maxZoom, this.zoom + zoomFactor);
      } else {
        newZoom = Math.max(this.minZoom, this.zoom - zoomFactor);
      }
      
      if (newZoom === this.zoom) return;
      
      // Calculate mouse position relative to viewport
      const rect = this.viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Focus zoom: keep the points under cursor identical after zoom
      // Formula: panNew = mouse - (mouse - panOld) * (zoomNew / zoomOld)
      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
      
      this.zoom = newZoom;
      this.applyTransform();
    }, { passive: false });

    // Handle viewport resize
    window.addEventListener('resize', () => {
      this.applyTransform();
    });
  }

  // Set zoom directly
  setZoom(value) {
    const prevZoom = this.zoom;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, value));
    
    // Zoom relative to the center of the viewport
    const viewportWidth = this.viewport.clientWidth;
    const viewportHeight = this.viewport.clientHeight;
    
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;
    
    this.panX = centerX - (centerX - this.panX) * (this.zoom / prevZoom);
    this.panY = centerY - (centerY - this.panY) * (this.zoom / prevZoom);
    
    this.applyTransform();
  }

  // Reset pan and zoom to default center
  resetView() {
    this.zoom = 1.0;
    this.panX = this.viewport.clientWidth / 2 || 0;
    this.panY = this.viewport.clientHeight / 2 || 0;
    this.applyTransform();
  }

  // Center view on all cards
  fitToScreen(cards) {
    if (!cards || cards.length === 0) {
      this.resetView();
      return;
    }

    // Find bounding box of all cards (coordinates are in canvas space)
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    cards.forEach(card => {
      const x = card.x;
      const y = card.y;
      const w = card.w || 250;
      const h = card.h || 150;

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    });

    // Add padding
    const padding = 60;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    const viewportWidth = this.viewport.clientWidth;
    const viewportHeight = this.viewport.clientHeight;

    // Calculate zoom level required to fit bounding box
    const zoomX = viewportWidth / contentWidth;
    const zoomY = viewportHeight / contentHeight;
    let newZoom = Math.min(zoomX, zoomY, 1.2); // Cap at 1.2x zoom
    newZoom = Math.max(this.minZoom, newZoom);

    // Calculate pans to center the bounding box
    // Center point in canvas coords
    const contentCenterX = minX + contentWidth / 2;
    const contentCenterY = minY + contentHeight / 2;

    // We want the content center to line up with viewport center
    const viewportCenterX = viewportWidth / 2;
    const viewportCenterY = viewportHeight / 2;

    // Middle of container is 5000, 5000.
    const canvasCenterX = 5000;
    const canvasCenterY = 5000;

    this.zoom = newZoom;
    this.panX = viewportCenterX - (contentCenterX - canvasCenterX) * this.zoom;
    this.panY = viewportCenterY - (contentCenterY - canvasCenterY) * this.zoom;

    this.applyTransform();
  }

  // Convert client (screen) coordinates to canvas coordinates
  clientToCanvas(clientX, clientY) {
    const rect = this.viewport.getBoundingClientRect();
    
    // 1. Mouse offset relative to viewport top-left
    const viewportX = clientX - rect.left;
    const viewportY = clientY - rect.top;
    
    // 2. Un-apply pan and zoom to get offset relative to the canvas coordinate origin
    // Note: #canvas-container is 10000x10000, and centered initially at -5000, -5000.
    // The transformation is applied as: transform: translate3d(panX, panY, 0) scale(zoom)
    // Since transform-origin is "center center" (i.e. at 5000px, 5000px):
    // screenCoords = TransformMatrix * localCoords
    // Mathematically, relative to the center of the viewport:
    // x_screen = panX + (x_canvas - 5000) * zoom
    // Therefore, solving for x_canvas:
    // x_canvas = 5000 + (x_screen - panX) / zoom
    
    const canvasX = 5000 + (viewportX - this.panX) / this.zoom;
    const canvasY = 5000 + (viewportY - this.panY) / this.zoom;

    return { x: canvasX, y: canvasY };
  }

  // Core redraw/re-render transform update
  applyTransform() {
    this.container.style.transform = `translate3d(${this.panX}px, ${this.panY}px, 0) scale(${this.zoom})`;
    
    // Update zoom indicator in UI
    const zoomText = document.getElementById('ctrl-zoom-level');
    if (zoomText) {
      zoomText.textContent = `${Math.round(this.zoom * 100)}%`;
    }

    // Fire callback for drawing connections or updating positions
    if (this.onCanvasTransformCallback) {
      this.onCanvasTransformCallback(this.zoom);
    }
  }

  onTransform(callback) {
    this.onCanvasTransformCallback = callback;
  }
}
