export class ConnectionManager {
  constructor(svgId, canvasEngine, onAddConnection, onDeleteConnection) {
    this.svg = document.getElementById(svgId);
    this.canvasEngine = canvasEngine;
    this.onAddConnection = onAddConnection;
    this.onDeleteConnection = onDeleteConnection;
    
    this.connections = []; // Array of { id, from, to, color, style }
    this.cards = []; // Current active cards list
    
    this.connectionMode = false;
    this.sourceCardId = null;
    
    this.initSvgDefs();
    this.initEvents();
  }

  // Initialize arrow markers in SVG
  initSvgDefs() {
    this.svg.innerHTML = ''; // Clear SVG
    
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    
    // Create arrow markers for each HSL color to support multi-colored arrows
    const colors = {
      violet: 'hsl(263, 90%, 50%)',
      emerald: 'hsl(142, 70%, 45%)',
      blue: 'hsl(217, 91%, 50%)',
      rose: 'hsl(350, 89%, 50%)',
      amber: 'hsl(45, 93%, 45%)',
      indigo: 'hsl(245, 80%, 55%)',
      slate: 'hsl(215, 20%, 65%)',
      default: 'rgba(255,255,255,0.2)'
    };
    
    Object.entries(colors).forEach(([name, colorVal]) => {
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', `arrow-${name}`);
      marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '8');
      marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '6');
      marker.setAttribute('markerHeight', '6');
      marker.setAttribute('orient', 'auto-start-reverse');
      
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M 0 1.5 L 8 5 L 0 8.5 z');
      path.setAttribute('fill', colorVal);
      
      marker.appendChild(path);
      defs.appendChild(marker);
    });

    this.svg.appendChild(defs);
  }

  initEvents() {
    // Click on connections is handled by attaching click events on the paths
    // Handle Esc key to cancel connection mode
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.connectionMode) {
        this.stopConnectionMode();
      }
    });

    // Handle global click to cancel connection mode if clicking empty space
    this.canvasEngine.viewport.addEventListener('mousedown', (e) => {
      if (this.connectionMode && (e.target === this.canvasEngine.viewport || e.target.classList.contains('canvas-grid-bg'))) {
        // Delay slightly to check if clicking on a card first
        setTimeout(() => {
          if (this.connectionMode) {
            this.stopConnectionMode();
          }
        }, 100);
      }
    });
  }

  // Set the current cards list
  setCards(cards) {
    this.cards = cards;
  }

  // Start Connection Mode
  startConnectionMode(sourceId = null) {
    this.connectionMode = true;
    this.canvasEngine.viewport.classList.add('connection-mode');
    
    // Highlight button in toolbar
    const connectBtn = document.getElementById('tool-connect');
    if (connectBtn) connectBtn.classList.add('active');
    
    const cardsEl = document.querySelectorAll('.card');
    cardsEl.forEach(c => c.classList.add('connection-candidate'));

    if (sourceId) {
      this.sourceCardId = sourceId;
      const srcEl = document.getElementById(`card-${sourceId}`);
      if (srcEl) {
        srcEl.classList.remove('connection-candidate');
        srcEl.classList.add('connection-source');
      }
    }
  }

  // Stop Connection Mode
  stopConnectionMode() {
    this.connectionMode = false;
    this.sourceCardId = null;
    this.canvasEngine.viewport.classList.remove('connection-mode');
    
    // Unhighlight button in toolbar
    const connectBtn = document.getElementById('tool-connect');
    if (connectBtn) connectBtn.classList.remove('active');

    const cardsEl = document.querySelectorAll('.card');
    cardsEl.forEach(c => {
      c.classList.remove('connection-candidate');
      c.classList.remove('connection-source');
    });
  }

  // Handle Card Click inside connection mode
  handleCardClick(cardId) {
    if (!this.connectionMode) return false;

    // 1. If no source card selected, select this as source
    if (!this.sourceCardId) {
      this.sourceCardId = cardId;
      const srcEl = document.getElementById(`card-${cardId}`);
      if (srcEl) {
        srcEl.classList.remove('connection-candidate');
        srcEl.classList.add('connection-source');
      }
      return true;
    }

    // 2. If same card clicked, cancel
    if (this.sourceCardId === cardId) {
      this.stopConnectionMode();
      return true;
    }

    // 3. Connect source to destination
    const from = this.sourceCardId;
    const to = cardId;
    
    // Avoid duplicate connections
    const duplicate = this.connections.some(c => (c.from === from && c.to === to) || (c.from === to && c.to === from));
    
    if (!duplicate) {
      const newConn = {
        id: `conn-${Date.now()}`,
        from,
        to,
        color: 'violet', // default color matches theme
        style: 'bezier'
      };
      this.onAddConnection(newConn);
    }
    
    this.stopConnectionMode();
    return true;
  }

  // Render all connections
  renderConnections(connections) {
    this.connections = connections || [];
    
    // Remove all old path groups, keeping <defs>
    const paths = this.svg.querySelectorAll('.conn-group');
    paths.forEach(p => p.remove());

    if (this.connections.length === 0 || this.cards.length === 0) return;

    this.connections.forEach(conn => {
      const fromCard = this.cards.find(c => c.id === conn.from);
      const toCard = this.cards.find(c => c.id === conn.to);

      if (!fromCard || !toCard) return;

      this.drawConnection(conn, fromCard, toCard);
    });
  }

  // Draw a single connection Bezier curve
  drawConnection(conn, card1, card2) {
    const points = this.calculateBestConnectionPoints(card1, card2);
    if (!points) return;

    const { p1, p2, dir1, dir2 } = points;

    // Draw Curve
    const pathGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    pathGroup.setAttribute('class', 'conn-group');
    pathGroup.setAttribute('id', `group-${conn.id}`);

    // Create thicker invisible curve for easy hovering/clicking
    const hoverPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = this.calculateBezierPath(p1, p2, dir1, dir2);
    hoverPath.setAttribute('d', d);
    hoverPath.setAttribute('fill', 'none');
    hoverPath.setAttribute('stroke', 'transparent');
    hoverPath.setAttribute('stroke-width', '16');
    hoverPath.setAttribute('style', 'cursor: pointer; pointer-events: stroke;');

    // Create the visual visible curve
    const visualPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    visualPath.setAttribute('d', d);
    visualPath.setAttribute('class', `connection-path ${conn.style === 'dashed' ? 'dashed' : ''}`);
    
    const colorName = conn.color || 'violet';
    const HSLColors = {
      violet: 'hsl(263, 90%, 50%)',
      emerald: 'hsl(142, 70%, 45%)',
      blue: 'hsl(217, 91%, 50%)',
      rose: 'hsl(350, 89%, 50%)',
      amber: 'hsl(45, 93%, 45%)',
      indigo: 'hsl(245, 80%, 55%)',
      slate: 'hsl(215, 20%, 65%)'
    };
    const strokeColor = HSLColors[colorName] || HSLColors.violet;
    
    visualPath.setAttribute('stroke', strokeColor);
    visualPath.setAttribute('marker-end', `url(#arrow-${colorName})`);

    // Interactive double-click to delete connection
    const deleteAction = (e) => {
      e.stopPropagation();
      if (confirm('¿Eliminar esta línea de conexión?')) {
        this.onDeleteConnection(conn.id);
      }
    };
    
    hoverPath.addEventListener('dblclick', deleteAction);
    visualPath.addEventListener('dblclick', deleteAction);

    // Hover effect highlights
    hoverPath.addEventListener('mouseenter', () => visualPath.classList.add('selected'));
    hoverPath.addEventListener('mouseleave', () => visualPath.classList.remove('selected'));

    pathGroup.appendChild(hoverPath);
    pathGroup.appendChild(visualPath);
    this.svg.appendChild(pathGroup);
  }

  // Math algorithm: Compute 4 border-center points per card and find pair with shortest distance.
  calculateBestConnectionPoints(card1, card2) {
    const w1 = card1.w || 250;
    const h1 = card1.h || 150;
    const w2 = card2.w || 250;
    const h2 = card2.h || 150;

    // Center coordinates relative to canvas (10000x10000 grid)
    const c1 = {
      left: card1.x,
      right: card1.x + w1,
      top: card1.y,
      bottom: card1.y + h1,
      centerX: card1.x + w1 / 2,
      centerY: card1.y + h1 / 2
    };

    const c2 = {
      left: card2.x,
      right: card2.x + w2,
      top: card2.y,
      bottom: card2.y + h2,
      centerX: card2.x + w2 / 2,
      centerY: card2.y + h2 / 2
    };

    // Edge candidates: Left, Right, Top, Bottom
    const card1Edges = [
      { x: c1.right, y: c1.centerY, dir: 'R' },
      { x: c1.left, y: c1.centerY, dir: 'L' },
      { x: c1.centerX, y: c1.bottom, dir: 'B' },
      { x: c1.centerX, y: c1.top, dir: 'T' }
    ];

    const card2Edges = [
      { x: c2.left, y: c2.centerY, dir: 'L' },
      { x: c2.right, y: c2.centerY, dir: 'R' },
      { x: c2.centerX, y: c2.top, dir: 'T' },
      { x: c2.centerX, y: c2.bottom, dir: 'B' }
    ];

    let minDistance = Infinity;
    let bestPair = null;

    card1Edges.forEach(e1 => {
      card2Edges.forEach(e2 => {
        const dx = e2.x - e1.x;
        const dy = e2.y - e1.y;
        const dist = dx * dx + dy * dy; // Avoid Math.sqrt for speed comparison

        // Bonus: slight penalty if lines cross back through the card itself, 
        // to encourage clean flows pointing outwards
        let penalty = 0;
        if (e1.dir === 'R' && dx < 0) penalty = 50000;
        if (e1.dir === 'L' && dx > 0) penalty = 50000;
        if (e1.dir === 'B' && dy < 0) penalty = 50000;
        if (e1.dir === 'T' && dy > 0) penalty = 50000;

        if (dist + penalty < minDistance) {
          minDistance = dist + penalty;
          bestPair = { p1: e1, p2: e2, dir1: e1.dir, dir2: e2.dir };
        }
      });
    });

    return bestPair;
  }

  // Calculate Bezier Cubic curve
  calculateBezierPath(p1, p2, dir1, dir2) {
    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);
    const strength = Math.max(40, Math.min(150, Math.max(dx, dy) * 0.45));

    let c1 = { x: p1.x, y: p1.y };
    let c2 = { x: p2.x, y: p2.y };

    // Exit source direction control point
    if (dir1 === 'R') c1.x += strength;
    else if (dir1 === 'L') c1.x -= strength;
    else if (dir1 === 'B') c1.y += strength;
    else if (dir1 === 'T') c1.y -= strength;

    // Enter destination direction control point
    if (dir2 === 'R') c2.x += strength;
    else if (dir2 === 'L') c2.x -= strength;
    else if (dir2 === 'B') c2.y += strength;
    else if (dir2 === 'T') c2.y -= strength;

    return `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  }
}
