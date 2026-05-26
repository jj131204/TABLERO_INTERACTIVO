export class BoardManager {
  constructor(canvasEngine, onProjectLoaded, onBoardChanged) {
    this.canvasEngine = canvasEngine;
    this.onProjectLoaded = onProjectLoaded;
    this.onBoardChanged = onBoardChanged;

    this.currentProject = null; // The loaded project JSON structure
    this.activeBoardId = 'root'; // The active board ID being displayed

    // Debouncing for Auto-saving
    this.saveTimeout = null;
    this.saveDelay = 1000; // 1 second debounce
    this.syncStatusEl = document.getElementById('sync-status');
  }

  // Set the visual Sync status indicator in UI
  setSyncStatus(status) {
    if (!this.syncStatusEl) return;
    
    this.syncStatusEl.className = 'sync-status-indicator ' + status;
    const textEl = this.syncStatusEl.querySelector('.status-text');
    
    if (status === 'synced') {
      textEl.textContent = 'Guardado en Local';
    } else if (status === 'syncing') {
      textEl.textContent = 'Guardando...';
    } else if (status === 'error') {
      textEl.textContent = 'Error al guardar';
    }
  }

  // ==================== REST API CLIENT METHODS ====================

  // Fetch list of all projects on disk
  async fetchProjectsList() {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Error al listar proyectos');
      return await res.json();
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  // Create a new project on disk
  async createNewProject(name) {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) throw new Error('Error al crear proyecto');
      return await res.json();
    } catch (e) {
      console.error(e);
      alert('No se pudo crear el proyecto localmente. ¿Está el servidor corriendo?');
      return null;
    }
  }

  // Load a project from disk DB
  async loadProject(id) {
    try {
      this.setSyncStatus('syncing');
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error('Error al cargar proyecto');
      
      this.currentProject = await res.json();
      this.activeBoardId = this.currentProject.activeBoardId || 'root';
      
      // Safety checks: ensure root board exists
      if (!this.currentProject.boards) this.currentProject.boards = {};
      if (!this.currentProject.boards.root) {
        this.currentProject.boards.root = {
          id: 'root',
          name: 'Inicio',
          cards: [],
          connections: []
        };
      }
      
      this.setSyncStatus('synced');
      this.onProjectLoaded(this.currentProject);
      this.navigateBoard(this.activeBoardId, false); // Don't trigger another save on load
      
      return this.currentProject;
    } catch (e) {
      console.error(e);
      this.setSyncStatus('error');
      alert('Error al cargar el archivo de proyecto. Verifica el formato JSON.');
      return null;
    }
  }

  // Delete a project from disk DB
  async deleteProject(id) {
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  // Clone a project in disk DB
  async cloneProject(id) {
    try {
      const res = await fetch(`/api/projects/${id}/clone`, { method: 'POST' });
      if (!res.ok) throw new Error('Error al clonar');
      return await res.json();
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  // Debounced auto-save project payload to disk DB
  triggerAutoSave() {
    this.setSyncStatus('syncing');
    
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      if (!this.currentProject) return;

      try {
        const res = await fetch(`/api/projects/${this.currentProject.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.currentProject)
        });

        if (res.ok) {
          this.setSyncStatus('synced');
        } else {
          throw new Error('Error al guardar');
        }
      } catch (e) {
        console.error('AutoSave failed:', e);
        this.setSyncStatus('error');
      }
    }, this.saveDelay);
  }

  // Save changes instantly (e.g. before exiting)
  async saveImmediately() {
    if (!this.currentProject) return;
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    
    this.setSyncStatus('syncing');
    try {
      const res = await fetch(`/api/projects/${this.currentProject.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.currentProject)
      });
      if (res.ok) {
        this.setSyncStatus('synced');
      } else {
        this.setSyncStatus('error');
      }
    } catch (e) {
      this.setSyncStatus('error');
    }
  }

  // ==================== BOARD STATE MANIPULATIONS ====================

  // Get active board data
  getActiveBoard() {
    if (!this.currentProject) return null;
    return this.currentProject.boards[this.activeBoardId];
  }

  // Rename the current board title
  renameCurrentBoard(newName) {
    const activeBoard = this.getActiveBoard();
    if (!activeBoard || !newName) return;
    
    activeBoard.name = newName;
    
    // If it's a sub-board, we also need to update the card in the parent board!
    if (activeBoard.parentId) {
      const parentBoard = this.currentProject.boards[activeBoard.parentId];
      if (parentBoard) {
        const cardRef = parentBoard.cards.find(c => c.type === 'board' && c.targetBoardId === this.activeBoardId);
        if (cardRef) {
          cardRef.title = newName;
        }
      }
    }
    
    this.renderBreadcrumbs();
    this.triggerAutoSave();
  }

  // Navigate into a board (or go back up)
  navigateBoard(boardId, shouldSave = true) {
    if (!this.currentProject || !this.currentProject.boards[boardId]) return;

    this.activeBoardId = boardId;
    this.currentProject.activeBoardId = boardId;
    
    // Update breadcrumbs UI
    this.renderBreadcrumbs();
    
    // Notify main script to re-render cards and connections
    const activeBoard = this.getActiveBoard();
    this.onBoardChanged(activeBoard);

    if (shouldSave) {
      this.triggerAutoSave();
    }
  }

  // Create a new sub-board inside active board
  createSubBoard(title, x, y) {
    if (!this.currentProject) return;

    const subBoardId = `board-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    
    // 1. Create the new board definition
    this.currentProject.boards[subBoardId] = {
      id: subBoardId,
      name: title,
      parentId: this.activeBoardId,
      cards: [],
      connections: []
    };

    // 2. Create the directory-link card in the current active board
    const activeBoard = this.getActiveBoard();
    const boardCard = {
      id: `card-${Date.now()}`,
      type: 'board',
      title: title,
      targetBoardId: subBoardId,
      x: Math.round(x),
      y: Math.round(y),
      w: 240,
      h: 100,
      color: 'blue'
    };

    activeBoard.cards.push(boardCard);
    
    this.onBoardChanged(activeBoard);
    this.triggerAutoSave();
  }

  // Delete a sub-board recursively (garbage collection of orphans)
  deleteSubBoardRecursively(targetBoardId) {
    if (!this.currentProject || !this.currentProject.boards[targetBoardId]) return;

    const board = this.currentProject.boards[targetBoardId];
    
    // Recursively delete children boards if any board cards are inside
    board.cards.forEach(card => {
      if (card.type === 'board') {
        this.deleteSubBoardRecursively(card.targetBoardId);
      }
    });

    delete this.currentProject.boards[targetBoardId];
  }

  // ==================== BREADCRUMBS BUILDER ====================
  
  renderBreadcrumbs() {
    const container = document.getElementById('breadcrumbs');
    if (!container || !this.currentProject) return;

    container.innerHTML = '';
    
    // Build path array from activeBoardId upwards
    const path = [];
    let currentId = this.activeBoardId;
    
    while (currentId) {
      const board = this.currentProject.boards[currentId];
      if (!board) break;
      
      path.unshift(board); // Prepends to keep chronological order (Root -> Child)
      currentId = board.parentId;
    }

    path.forEach((board, index) => {
      const item = document.createElement('span');
      item.className = 'breadcrumb-item';
      item.textContent = board.name || 'Sin Título';
      
      const isLast = index === path.length - 1;
      
      if (isLast) {
        item.classList.add('active');
        // Update header title directly
        const titleHeader = document.getElementById('current-board-title');
        if (titleHeader) titleHeader.textContent = board.name;
      } else {
        item.addEventListener('click', () => {
          this.navigateBoard(board.id);
        });
      }

      container.appendChild(item);

      if (!isLast) {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-separator';
        sep.innerHTML = '<i data-lucide="chevron-right" style="width: 14px; height: 14px; vertical-align: middle;"></i>';
        container.appendChild(sep);
      }
    });

    if (window.lucide) window.lucide.createIcons();
  }

  // ==================== MANUAL EXPORTS / IMPORTS ====================

  // Export current project JSON as manual download
  exportProjectJSON() {
    if (!this.currentProject) return;
    
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.currentProject, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', `${this.currentProject.id}.json`);
    dlAnchorElem.click();
  }
}
