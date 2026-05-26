import { CanvasEngine } from './src/canvas.js';
import { CardManager } from './src/cards.js';
import { ConnectionManager } from './src/connections.js';
import { BoardManager } from './src/boardManager.js';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Core Engines
  const canvasEngine = new CanvasEngine('canvas-viewport', 'canvas-container');
  
  // State variables for overlays & temporary modal creations
  let currentImageBase64 = null;
  let currentCardData = null;
  let activeTab = 'tab-local';

  // 1. Board Manager callback: when a board is navigated to or updated
  const onBoardChanged = (activeBoard) => {
    // Redraw cards
    cardManager.renderCards(activeBoard.cards);
    
    // Set cards list inside connection manager so it knows card bounds
    connectionManager.setCards(activeBoard.cards);
    
    // Redraw connection lines
    connectionManager.renderConnections(activeBoard.connections);
  };

  // 2. Board Manager callback: when a project is loaded
  const onProjectLoaded = (project) => {
    document.getElementById('project-manager').classList.add('hidden');
    document.getElementById('workspace').classList.remove('hidden');
    
    // Wait one frame to let DOM render and get correct dimensions, then center view!
    setTimeout(() => {
      const activeBoard = boardManager.getActiveBoard();
      if (activeBoard && activeBoard.cards && activeBoard.cards.length > 0) {
        canvasEngine.fitToScreen(activeBoard.cards);
      } else {
        canvasEngine.resetView();
      }
    }, 80);
  };

  // 3. Card Manager callback: when cards are moved, edited, or deleted
  const onCardUpdated = (action, cardModel) => {
    const activeBoard = boardManager.getActiveBoard();
    if (!activeBoard) return;

    if (action === 'delete') {
      // Remove card from model list
      activeBoard.cards = activeBoard.cards.filter(c => c.id !== cardModel.id);
      
      // Garbage collect connections connected to this card
      activeBoard.connections = activeBoard.connections.filter(
        conn => conn.from !== cardModel.id && conn.to !== cardModel.id
      );

      // If it was a sub-board card, recursively garbage collect the board definitions!
      if (cardModel.type === 'board') {
        boardManager.deleteSubBoardRecursively(cardModel.targetBoardId);
      }
      
      // Save and re-render
      boardManager.triggerAutoSave();
      onBoardChanged(activeBoard);
    } 
    else if (action === 'drag' || action === 'resize') {
      // Fast updates: update coordinates in model list and redraw connections in real-time
      const ref = activeBoard.cards.find(c => c.id === cardModel.id);
      if (ref) {
        ref.x = cardModel.x;
        ref.y = cardModel.y;
        ref.w = cardModel.w;
        ref.h = cardModel.h;
      }
      connectionManager.setCards(activeBoard.cards);
      connectionManager.renderConnections(activeBoard.connections);
      
      // Auto-save debounced (quietly writes to disk)
      boardManager.triggerAutoSave();
    } 
    else if (action === 'save-quiet') {
      // Write content changes quietly
      const ref = activeBoard.cards.find(c => c.id === cardModel.id);
      if (ref) {
        Object.assign(ref, cardModel);
      }
      boardManager.triggerAutoSave();
    }
    else if (action === 'save') {
      // Full save and re-render
      const ref = activeBoard.cards.find(c => c.id === cardModel.id);
      if (ref) {
        Object.assign(ref, cardModel);
      }
      boardManager.triggerAutoSave();
      onBoardChanged(activeBoard);
    }
  };

  // 4. Card Manager callback: Double-clicked a sub-board card
  const onNavigateBoard = (targetBoardId) => {
    boardManager.navigateBoard(targetBoardId);
  };

  // 5. Card Manager callback: Start drawing line
  const onStartConnection = (sourceCardId) => {
    connectionManager.startConnectionMode(sourceCardId);
  };

  // 6. Connection Manager callbacks
  const onAddConnection = (newConnection) => {
    const activeBoard = boardManager.getActiveBoard();
    if (!activeBoard) return;
    
    if (!activeBoard.connections) activeBoard.connections = [];
    activeBoard.connections.push(newConnection);
    
    boardManager.triggerAutoSave();
    onBoardChanged(activeBoard);
  };

  const onDeleteConnection = (connectionId) => {
    const activeBoard = boardManager.getActiveBoard();
    if (!activeBoard) return;
    
    activeBoard.connections = activeBoard.connections.filter(c => c.id !== connectionId);
    
    boardManager.triggerAutoSave();
    onBoardChanged(activeBoard);
  };

  // Instantiate Managers
  const boardManager = new BoardManager(canvasEngine, onProjectLoaded, onBoardChanged);
  const cardManager = new CardManager('cards-container', canvasEngine, onCardUpdated, onNavigateBoard, onStartConnection);
  const connectionManager = new ConnectionManager('connections-svg', canvasEngine, onAddConnection, onDeleteConnection);

  // Sync canvas movements to SVG connections layer scale redraws
  canvasEngine.onTransform(() => {
    // Re-render connections because bounding coordinates don't change, 
    // but the lines might need refresh hooks depending on scaling.
    // SVG scales naturally via translate/scale parent container transform,
    // so we don't have to recalculate bezier points during active zooms!
    // This is a massive CPU optimization.
  });

  // ==================== PROJECT MANAGER EVENT LOOPS ====================

  const showProjectLoader = (show) => {
    const loader = document.getElementById('app-loader');
    if (show) {
      loader.classList.remove('fade-out');
    } else {
      loader.classList.add('fade-out');
    }
  };

  const renderProjectManager = async () => {
    showProjectLoader(true);
    const grid = document.getElementById('projects-grid');
    grid.innerHTML = '';
    
    const projects = await boardManager.fetchProjectsList();
    
    if (projects.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-secondary); background: rgba(255,255,255,0.01); border: 1px dashed var(--border-color); border-radius: 16px;">
          <i data-lucide="folder-open" style="width:48px; height:48px; color: var(--text-muted); margin-bottom:12px;"></i>
          <p style="font-size:1.1rem; font-weight:600; color:white; margin-bottom:4px;">No hay proyectos locales</p>
          <p style="font-size:0.9rem; margin-bottom:16px;">Comienza creando un nuevo lienzo de diseño gráfico hoy.</p>
          <button id="btn-empty-create" class="btn btn-primary">Crear Proyecto Inicial</button>
        </div>
      `;
      const btnEmpty = document.getElementById('btn-empty-create');
      if (btnEmpty) btnEmpty.addEventListener('click', handleCreateProjectFlow);
    } else {
      projects.forEach(proj => {
        const card = document.createElement('div');
        card.className = 'project-card';
        
        // Convert dates
        const dateStr = new Date(proj.updatedAt).toLocaleDateString('es-ES', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        });

        card.innerHTML = `
          <div class="project-info">
            <h3 class="project-title" title="${proj.name}">${proj.name}</h3>
            <div class="project-meta">
              <i data-lucide="clock"></i>
              <span>Modificado: ${dateStr}</span>
            </div>
            <div class="project-meta" style="margin-top: 4px;">
              <i data-lucide="database"></i>
              <span>Tamaño: ${(proj.size / 1024).toFixed(1)} KB</span>
            </div>
          </div>
          <div class="project-actions">
            <button class="btn-clone-proj" title="Clonar proyecto"><i data-lucide="copy"></i></button>
            <button class="btn-delete-proj" title="Borrar proyecto"><i data-lucide="trash-2"></i></button>
          </div>
        `;

        // Card Click opens project
        card.addEventListener('click', (e) => {
          // Prevent opening if clicking action buttons
          if (e.target.closest('.project-actions')) return;
          showProjectLoader(true);
          boardManager.loadProject(proj.id).then(() => {
            showProjectLoader(false);
          });
        });

        // Clone button
        const cloneBtn = card.querySelector('.btn-clone-proj');
        cloneBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          showProjectLoader(true);
          const cloned = await boardManager.cloneProject(proj.id);
          if (cloned) {
            await renderProjectManager();
          }
          showProjectLoader(false);
        });

        // Delete button
        const delBtn = card.querySelector('.btn-delete-proj');
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`¿Estás seguro de que quieres borrar el proyecto "${proj.name}" permanentemente de tu disco?`)) {
            showProjectLoader(true);
            const success = await boardManager.deleteProject(proj.id);
            if (success) {
              await renderProjectManager();
            }
            showProjectLoader(false);
          }
        });

        grid.appendChild(card);
      });
    }

    if (window.lucide) window.lucide.createIcons();
    showProjectLoader(false);
  };

  const handleCreateProjectFlow = async () => {
    const name = prompt('Introduce el nombre de tu nuevo proyecto creativo:', 'Mi Proyecto de Diseño');
    if (!name) return;

    showProjectLoader(true);
    const newProj = await boardManager.createNewProject(name);
    if (newProj) {
      await boardManager.loadProject(newProj.id);
    }
    showProjectLoader(false);
  };

  // Bind initial screen buttons
  document.getElementById('btn-new-project').addEventListener('click', handleCreateProjectFlow);
  
  // Volver a proyectos button
  document.getElementById('btn-back-projects').addEventListener('click', async () => {
    showProjectLoader(true);
    await boardManager.saveImmediately();
    document.getElementById('workspace').classList.add('hidden');
    document.getElementById('project-manager').classList.remove('hidden');
    await renderProjectManager();
  });

  // ==================== WORKSPACE HEADER & CONTROL BUTTONS ====================

  // Auto-save rename on blur of the board title
  const currentTitleEl = document.getElementById('current-board-title');
  currentTitleEl.addEventListener('blur', () => {
    const text = currentTitleEl.textContent.trim();
    if (text) {
      boardManager.renameCurrentBoard(text);
    } else {
      currentTitleEl.textContent = boardManager.getActiveBoard().name;
    }
  });
  
  currentTitleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      currentTitleEl.blur();
    }
  });

  // Manual export JSON backup
  document.getElementById('btn-export-json').addEventListener('click', () => {
    boardManager.exportProjectJSON();
  });

  // Canvas Exporter (Draw notes as blocks on a dynamic canvas to capture PNG)
  document.getElementById('btn-export-png').addEventListener('click', () => {
    const activeBoard = boardManager.getActiveBoard();
    if (!activeBoard || activeBoard.cards.length === 0) {
      alert('Añade tarjetas primero antes de exportar una imagen.');
      return;
    }

    // Inform user of local render
    const confirmExp = confirm('¿Quieres descargar una captura de tu tablero actual?');
    if (!confirmExp) return;

    // Create a temporary canvas
    const capCanvas = document.createElement('canvas');
    const ctx = capCanvas.getContext('2d');

    // Calculate bounds of elements to size the canvas perfectly
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    activeBoard.cards.forEach(card => {
      const w = card.w || 250;
      const h = card.h || 150;
      if (card.x < minX) minX = card.x;
      if (card.y < minY) minY = card.y;
      if (card.x + w > maxX) maxX = card.x + w;
      if (card.y + h > maxY) maxY = card.y + h;
    });

    const pad = 40;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;

    const w = maxX - minX;
    const h = maxY - minY;

    capCanvas.width = w;
    capCanvas.height = h;

    // Fill dark theme background
    ctx.fillStyle = '#0c0f16';
    ctx.fillRect(0, 0, w, h);

    // Draw grid dots
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let x = 0; x < w; x += 24) {
      for (let y = 0; y < h; y += 24) {
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw connection lines
    activeBoard.connections.forEach(conn => {
      const fromCard = activeBoard.cards.find(c => c.id === conn.from);
      const toCard = activeBoard.cards.find(c => c.id === conn.to);
      if (!fromCard || !toCard) return;

      const points = connectionManager.calculateBestConnectionPoints(fromCard, toCard);
      if (!points) return;

      // Adjust relative to export top-left origin
      const p1 = { x: points.p1.x - minX, y: points.p1.y - minY };
      const p2 = { x: points.p2.x - minX, y: points.p2.y - minY };

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      
      // Simple quadratic curve for export capture
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      ctx.quadraticCurveTo(mx, my + 30, p2.x, p2.y);
      
      ctx.strokeStyle = '#8a5cf6';
      ctx.lineWidth = 2;
      if (conn.style === 'dashed') {
        ctx.setLineDash([6, 4]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
    });

    // Draw card blocks
    ctx.setLineDash([]);
    activeBoard.cards.forEach(card => {
      const cardW = card.w || 250;
      const cardH = card.h || 150;
      const rx = card.x - minX;
      const ry = card.y - minY;

      // HSL Colors map
      const colors = {
        violet: '#1a172b',
        emerald: '#11221b',
        blue: '#121d30',
        rose: '#24151a',
        amber: '#241f14',
        indigo: '#141730',
        slate: '#1d212a'
      };
      
      ctx.fillStyle = colors[card.color] || colors.violet;
      ctx.beginPath();
      ctx.roundRect(rx, ry, cardW, cardH, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw title
      ctx.fillStyle = '#f3f4f6';
      ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(card.title || 'Nota', rx + 14, ry + 24);

      // Draw horizontal dividing line
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.beginPath();
      ctx.moveTo(rx, ry + 36);
      ctx.lineTo(rx + cardW, ry + 36);
      ctx.stroke();

      // Draw text content or details
      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px "Plus Jakarta Sans", sans-serif';
      if (card.type === 'note' && card.content) {
        // Multi-line wrap
        const lines = card.content.split('\n');
        let textY = ry + 52;
        lines.slice(0, 5).forEach(line => {
          ctx.fillText(line.substring(0, 40), rx + 14, textY);
          textY += 16;
        });
      } else if (card.type === 'todo' && card.todos) {
        let textY = ry + 52;
        card.todos.slice(0, 4).forEach(todo => {
          ctx.fillText(`[${todo.completed ? 'x' : ' '}] ${todo.text.substring(0, 35)}`, rx + 14, textY);
          textY += 16;
        });
      } else if (card.type === 'board') {
        ctx.fillStyle = '#a78bfa';
        ctx.fillText('📁 Doble clic para abrir sub-tablero', rx + 14, ry + 60);
      } else if (card.type === 'image') {
        ctx.fillStyle = '#fb7185';
        ctx.fillText('🖼️ Captura de Imagen Adjunta', rx + 14, ry + 60);
      } else if (card.type === 'link') {
        ctx.fillStyle = '#fbbf24';
        ctx.fillText(`🌐 Enlace: ${card.url}`, rx + 14, ry + 60);
      }
    });

    // Download dynamic render
    const link = document.createElement('a');
    link.download = `${activeBoard.name}-tablero.png`;
    link.href = capCanvas.toDataURL();
    link.click();
  });

  // Canvas floating zooms
  document.getElementById('ctrl-zoom-in').addEventListener('click', () => {
    canvasEngine.setZoom(canvasEngine.zoom + 0.1);
  });
  
  document.getElementById('ctrl-zoom-out').addEventListener('click', () => {
    canvasEngine.setZoom(canvasEngine.zoom - 0.1);
  });
  
  document.getElementById('ctrl-zoom-fit').addEventListener('click', () => {
    const activeBoard = boardManager.getActiveBoard();
    if (activeBoard) {
      canvasEngine.fitToScreen(activeBoard.cards);
    }
  });

  // Connect cards tool toggle
  document.getElementById('tool-connect').addEventListener('click', () => {
    if (connectionManager.connectionMode) {
      connectionManager.stopConnectionMode();
    } else {
      connectionManager.startConnectionMode();
    }
  });

  // ==================== DRAG & DROP FOR TOOLBAR ====================

  const tools = ['tool-note', 'tool-todo', 'tool-board'];
  tools.forEach(toolId => {
    const el = document.getElementById(toolId);
    
    // Drag Start
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', toolId);
      e.dataTransfer.effectAllowed = 'copy';
    });

    // Fallback: click triggers creation at center of screen!
    el.addEventListener('click', () => {
      const activeBoard = boardManager.getActiveBoard();
      if (!activeBoard) return;

      // Get center coordinates of the current viewport converted to canvas coordinates
      const viewportWidth = canvasEngine.viewport.clientWidth;
      const viewportHeight = canvasEngine.viewport.clientHeight;
      const centerCoords = canvasEngine.clientToCanvas(
        viewportWidth / 2,
        viewportHeight / 2
      );

      createCardFromTool(toolId, centerCoords.x - 125, centerCoords.y - 75);
    });
  });

  // Allow drop over viewport
  const viewport = canvasEngine.viewport;
  viewport.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  viewport.addEventListener('drop', (e) => {
    e.preventDefault();
    const toolId = e.dataTransfer.getData('text/plain');
    if (!tools.includes(toolId)) return;

    // Convert screen coordinates of drops into canvas space coordinates!
    const canvasCoords = canvasEngine.clientToCanvas(e.clientX, e.clientY);
    
    // Offset card top-left slightly to drop right under cursor center
    createCardFromTool(toolId, canvasCoords.x - 125, canvasCoords.y - 75);
  });

  // Double click canvas to add note
  viewport.addEventListener('dblclick', (e) => {
    // Only double click empty grid background
    if (e.target !== viewport && !e.target.classList.contains('canvas-grid-bg')) return;
    
    const canvasCoords = canvasEngine.clientToCanvas(e.clientX, e.clientY);
    createCardFromTool('tool-note', canvasCoords.x - 125, canvasCoords.y - 75);
  });

  // Helper creating elements from specific tool handles
  const createCardFromTool = (toolId, x, y) => {
    const activeBoard = boardManager.getActiveBoard();
    if (!activeBoard) return;

    let newCard = {
      id: `card-${Date.now()}`,
      x: Math.round(x),
      y: Math.round(y),
      zIndex: cardManager.getMaxZIndex() + 1
    };

    if (toolId === 'tool-note') {
      Object.assign(newCard, {
        type: 'note',
        title: 'Nueva Nota',
        content: '',
        w: 250,
        h: 150,
        color: 'violet'
      });
      activeBoard.cards.push(newCard);
      boardManager.triggerAutoSave();
      onBoardChanged(activeBoard);
    } 
    else if (toolId === 'tool-todo') {
      Object.assign(newCard, {
        type: 'todo',
        title: 'Tareas',
        todos: [],
        w: 280,
        h: 220,
        color: 'emerald'
      });
      activeBoard.cards.push(newCard);
      boardManager.triggerAutoSave();
      onBoardChanged(activeBoard);
    } 
    else if (toolId === 'tool-board') {
      const boardTitle = prompt('Nombre del nuevo sub-tablero:', 'Sub-tablero sin título');
      if (!boardTitle) return;
      boardManager.createSubBoard(boardTitle, x, y);
    }
  };

  // ==================== MODAL OVERLAYS MANAGER ====================

  const openModal = (modalId) => {
    document.getElementById(modalId).classList.remove('hidden');
  };

  const closeModal = (modalId) => {
    document.getElementById(modalId).classList.add('hidden');
    // Clear temp states
    currentImageBase64 = null;
    currentCardData = null;
    document.getElementById('input-image-file').value = '';
    document.getElementById('image-upload-preview').src = '';
    document.getElementById('image-preview-container').classList.add('hidden');
    document.getElementById('image-dropzone').classList.remove('hidden');
    document.getElementById('input-image-url').value = '';
    document.getElementById('input-image-title').value = '';
    document.getElementById('input-link-url').value = '';
    document.getElementById('input-link-title').value = '';
    document.getElementById('input-link-desc').value = '';
    
    const saveImageBtn = document.getElementById('btn-save-image');
    saveImageBtn.disabled = true;
  };

  // Close modals clicking Cancel or X buttons
  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-overlay');
      closeModal(modal.id);
    });
  });

  // Close modal when clicking dark overlay backdrop
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('mousedown', (e) => {
      if (e.target === modal) closeModal(modal.id);
    });
  });

  // Connection intercept on card click
  document.getElementById('cards-container').addEventListener('mousedown', (e) => {
    const cardEl = e.target.closest('.card');
    if (!cardEl) return;
    
    const cardId = cardEl.id.replace('card-', '');
    
    if (connectionManager.connectionMode) {
      e.stopPropagation();
      connectionManager.handleCardClick(cardId);
    }
  }, true); // Use capturing phase to intercept before card drag initializes!

  // ==================== IMAGES LOADER EVENT LOOPS ====================

  document.getElementById('tool-image').addEventListener('click', () => {
    openModal('modal-image');
  });

  // Modal Tabs switching
  document.querySelectorAll('.modal-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      activeTab = btn.getAttribute('data-tab');
      if (activeTab === 'tab-local') {
        document.getElementById('tab-local').classList.remove('hidden');
        document.getElementById('tab-url').classList.add('hidden');
        document.getElementById('btn-save-image').disabled = !currentImageBase64;
      } else {
        document.getElementById('tab-local').classList.add('hidden');
        document.getElementById('tab-url').classList.remove('hidden');
        const urlVal = document.getElementById('input-image-url').value.trim();
        document.getElementById('btn-save-image').disabled = !urlVal;
      }
    });
  });

  // Dropzone drag overs
  const dropzone = document.getElementById('image-dropzone');
  const fileInput = document.getElementById('input-image-file');

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  const processImageFile = (file) => {
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecciona un archivo de imagen válido.');
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      alert('La imagen es demasiado grande. El límite recomendado para persistir localmente es de 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      currentImageBase64 = e.target.result;
      
      // Render Preview
      document.getElementById('image-upload-preview').src = currentImageBase64;
      document.getElementById('image-preview-container').classList.remove('hidden');
      dropzone.classList.add('hidden');
      document.getElementById('btn-save-image').disabled = false;
    };
    reader.readAsDataURL(file);
  };

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) processImageFile(file);
  });

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) processImageFile(file);
  });

  // Remove preview reset
  document.getElementById('btn-remove-preview').addEventListener('click', () => {
    currentImageBase64 = null;
    fileInput.value = '';
    document.getElementById('image-upload-preview').src = '';
    document.getElementById('image-preview-container').classList.add('hidden');
    dropzone.classList.remove('hidden');
    document.getElementById('btn-save-image').disabled = true;
  });

  // Text URL input listener to activate Save btn
  document.getElementById('input-image-url').addEventListener('input', (e) => {
    if (activeTab === 'tab-url') {
      document.getElementById('btn-save-image').disabled = !e.target.value.trim();
    }
  });

  // Save Image Card
  document.getElementById('btn-save-image').addEventListener('click', () => {
    const activeBoard = boardManager.getActiveBoard();
    if (!activeBoard) return;

    const viewportWidth = canvasEngine.viewport.clientWidth;
    const viewportHeight = canvasEngine.viewport.clientHeight;
    const centerCoords = canvasEngine.clientToCanvas(viewportWidth / 2, viewportHeight / 2);

    let src = '';
    let caption = '';

    if (activeTab === 'tab-local') {
      src = currentImageBase64;
      caption = 'Imagen local cargada';
    } else {
      src = document.getElementById('input-image-url').value.trim();
      caption = document.getElementById('input-image-title').value.trim() || 'Imagen web';
    }

    const imageCard = {
      id: `card-${Date.now()}`,
      type: 'image',
      title: 'Imagen Adjunta',
      src,
      caption,
      x: Math.round(centerCoords.x - 150),
      y: Math.round(centerCoords.y - 120),
      w: 300,
      h: 240,
      color: 'rose',
      zIndex: cardManager.getMaxZIndex() + 1
    };

    activeBoard.cards.push(imageCard);
    boardManager.triggerAutoSave();
    onBoardChanged(activeBoard);
    closeModal('modal-image');
  });

  // ==================== LINKS LOADER EVENT LOOPS ====================

  document.getElementById('tool-link').addEventListener('click', () => {
    openModal('modal-link');
  });

  // Save Link Card
  document.getElementById('btn-save-link').addEventListener('click', () => {
    const urlInput = document.getElementById('input-link-url').value.trim();
    if (!urlInput) {
      alert('Introduce una URL válida.');
      return;
    }

    const activeBoard = boardManager.getActiveBoard();
    if (!activeBoard) return;

    const viewportWidth = canvasEngine.viewport.clientWidth;
    const viewportHeight = canvasEngine.viewport.clientHeight;
    const centerCoords = canvasEngine.clientToCanvas(viewportWidth / 2, viewportHeight / 2);

    const title = document.getElementById('input-link-title').value.trim() || 'Enlace Interesante';
    const description = document.getElementById('input-link-desc').value.trim() || 'Una referencia web de inspiración añadida a mi LuminaBoard.';

    const linkCard = {
      id: `card-${Date.now()}`,
      type: 'link',
      title,
      url: urlInput,
      description,
      x: Math.round(centerCoords.x - 140),
      y: Math.round(centerCoords.y - 90),
      w: 280,
      h: 180,
      color: 'amber',
      zIndex: cardManager.getMaxZIndex() + 1
    };

    activeBoard.cards.push(linkCard);
    boardManager.triggerAutoSave();
    onBoardChanged(activeBoard);
    closeModal('modal-link');
  });

  // Initial Load Boot
  renderProjectManager();
});
