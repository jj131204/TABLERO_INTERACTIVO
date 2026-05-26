export class CardManager {
  constructor(containerId, canvasEngine, onUpdate, onNavigateBoard, onStartConnection) {
    this.container = document.getElementById(containerId);
    this.canvasEngine = canvasEngine;
    this.onUpdate = onUpdate; // Callback when a card is changed
    this.onNavigateBoard = onNavigateBoard; // Callback when a sub-board is entered
    this.onStartConnection = onStartConnection; // Callback when connection drawing starts
    
    this.selectedCardId = null;
    this.draggedCard = null;
    this.resizingCard = null;
    
    this.initGlobalEvents();
  }

  initGlobalEvents() {
    // Select click clearing when clicking the canvas grid
    this.canvasEngine.viewport.addEventListener('mousedown', (e) => {
      if (e.target === this.canvasEngine.viewport || e.target.classList.contains('canvas-grid-bg')) {
        this.clearSelection();
      }
    });

    // Handle dragging/resizing moves globally on window
    window.addEventListener('mousemove', (e) => {
      const zoom = this.canvasEngine.zoom;
      
      // 1. Handle Card Dragging
      if (this.draggedCard) {
        const dx = (e.clientX - this.draggedCard.startClientX) / zoom;
        const dy = (e.clientY - this.draggedCard.startClientY) / zoom;
        
        // Update model coordinates
        this.draggedCard.model.x = Math.round(this.draggedCard.startCardX + dx);
        this.draggedCard.model.y = Math.round(this.draggedCard.startCardY + dy);
        
        // Update DOM element position
        this.draggedCard.element.style.left = `${this.draggedCard.model.x}px`;
        this.draggedCard.element.style.top = `${this.draggedCard.model.y}px`;
        
        // Notify changes (re-draw connections while dragging!)
        this.onUpdate('drag', this.draggedCard.model);
      }
      
      // 2. Handle Card Resizing
      if (this.resizingCard) {
        const dx = (e.clientX - this.resizingCard.startClientX) / zoom;
        const dy = (e.clientY - this.resizingCard.startClientY) / zoom;
        
        const newW = Math.max(this.resizingCard.minW, this.resizingCard.startCardW + dx);
        const newH = Math.max(this.resizingCard.minH, this.resizingCard.startCardH + dy);
        
        this.resizingCard.model.w = Math.round(newW);
        this.resizingCard.model.h = Math.round(newH);
        
        this.resizingCard.element.style.width = `${this.resizingCard.model.w}px`;
        this.resizingCard.element.style.height = `${this.resizingCard.model.h}px`;
        
        this.onUpdate('resize', this.resizingCard.model);
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.draggedCard) {
        this.onUpdate('save', this.draggedCard.model);
        this.draggedCard = null;
      }
      if (this.resizingCard) {
        this.onUpdate('save', this.resizingCard.model);
        this.resizingCard = null;
      }
    });
  }

  // Deselect all cards
  clearSelection() {
    this.selectedCardId = null;
    const cards = this.container.querySelectorAll('.card');
    cards.forEach(c => c.classList.remove('selected'));
  }

  // Select a specific card
  selectCard(cardId, element) {
    this.clearSelection();
    this.selectedCardId = cardId;
    element.classList.add('selected');
  }

  // Render all cards for the active board
  renderCards(cards) {
    this.container.innerHTML = '';
    this.clearSelection();
    
    if (!cards || cards.length === 0) return;
    
    cards.forEach(cardData => {
      const cardEl = this.createCardElement(cardData);
      this.container.appendChild(cardEl);
    });
    
    // Trigger Lucide icons reload
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // Create a single card DOM element
  createCardElement(card) {
    const cardEl = document.createElement('div');
    cardEl.id = `card-${card.id}`;
    cardEl.className = `card color-${card.color || 'violet'}`;
    cardEl.style.left = `${card.x}px`;
    cardEl.style.top = `${card.y}px`;
    cardEl.style.width = `${card.w || 250}px`;
    cardEl.style.height = `${card.h || 150}px`;
    cardEl.style.zIndex = card.zIndex || 10;
    
    // 1. Header
    const header = document.createElement('div');
    header.className = 'card-header';
    
    // Left drag handle icon + editable title
    const dragHandle = document.createElement('div');
    dragHandle.className = 'card-drag-handle';
    dragHandle.innerHTML = `<i data-lucide="grip-vertical"></i>`;
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'card-title-text';
    titleSpan.contentEditable = true;
    titleSpan.textContent = card.title || this.getDefaultTitle(card.type);
    titleSpan.addEventListener('blur', () => {
      card.title = titleSpan.textContent.trim() || this.getDefaultTitle(card.type);
      this.onUpdate('save', card);
    });
    titleSpan.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        titleSpan.blur();
      }
    });
    
    dragHandle.appendChild(titleSpan);
    header.appendChild(dragHandle);

    // Card Actions
    const menu = document.createElement('div');
    menu.className = 'card-menu';
    
    // Connect button
    const connBtn = document.createElement('button');
    connBtn.className = 'card-btn';
    connBtn.title = 'Conectar con otra tarjeta';
    connBtn.innerHTML = `<i data-lucide="git-commit"></i>`;
    connBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.onStartConnection(card.id);
    });
    menu.appendChild(connBtn);

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'card-btn btn-delete-card';
    delBtn.title = 'Eliminar tarjeta';
    delBtn.innerHTML = `<i data-lucide="trash-2"></i>`;
    delBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (confirm('¿Estás seguro de que quieres eliminar esta tarjeta?')) {
        cardEl.remove();
        this.onUpdate('delete', card);
      }
    });
    menu.appendChild(delBtn);
    header.appendChild(menu);
    cardEl.appendChild(header);

    // 2. Body
    const body = document.createElement('div');
    body.className = 'card-body';
    
    this.renderCardBodyContents(card, body);
    cardEl.appendChild(body);

    // 3. Color Picker (Shown on hover)
    const colorPicker = this.createColorPicker(card, cardEl);
    cardEl.appendChild(colorPicker);

    // 4. Resizer Corner
    const resizer = document.createElement('div');
    resizer.className = 'card-resizer';
    resizer.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.selectCard(card.id, cardEl);
      
      this.resizingCard = {
        element: cardEl,
        model: card,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startCardW: card.w || 250,
        startCardH: card.h || 150,
        minW: this.getMinWidth(card.type),
        minH: this.getMinHeight(card.type)
      };
    });
    cardEl.appendChild(resizer);

    // 5. Card click to select & drag trigger
    cardEl.addEventListener('mousedown', (e) => {
      // Don't trigger drag on input, button or contenteditable elements
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON' || e.target.isContentEditable || e.target.closest('button')) {
        return;
      }
      
      e.stopPropagation();
      this.selectCard(card.id, cardEl);
      
      // Send to front
      const maxZIndex = this.getMaxZIndex() + 1;
      card.zIndex = maxZIndex;
      cardEl.style.zIndex = maxZIndex;
      
      this.draggedCard = {
        element: cardEl,
        model: card,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startCardX: card.x,
        startCardY: card.y
      };
    });

    // Double-click actions (specifically for nested boards)
    cardEl.addEventListener('dblclick', (e) => {
      if (card.type === 'board') {
        e.stopPropagation();
        this.onNavigateBoard(card.targetBoardId, card.title);
      }
    });

    return cardEl;
  }

  // Get default title by card type
  getDefaultTitle(type) {
    switch (type) {
      case 'note': return 'Nota';
      case 'todo': return 'Tareas';
      case 'image': return 'Imagen';
      case 'link': return 'Enlace';
      case 'board': return 'Sub-tablero';
      default: return 'Elemento';
    }
  }

  // Minimum dimensions per card type
  getMinWidth(type) {
    if (type === 'board') return 200;
    return 180;
  }
  getMinHeight(type) {
    if (type === 'board') return 90;
    return 100;
  }

  // Render specific card type layouts
  renderCardBodyContents(card, bodyEl) {
    switch (card.type) {
      case 'note':
        const editor = document.createElement('textarea');
        editor.className = 'note-editor';
        editor.placeholder = 'Escribe tus pensamientos aquí...';
        editor.value = card.content || '';
        editor.addEventListener('input', () => {
          card.content = editor.value;
          this.onUpdate('save-quiet', card); // Save without triggering full re-render
        });
        bodyEl.appendChild(editor);
        break;

      case 'todo':
        bodyEl.className = 'card-body todo-container';
        const todoList = document.createElement('div');
        todoList.className = 'todo-list';
        
        const renderList = () => {
          todoList.innerHTML = '';
          if (card.todos && card.todos.length > 0) {
            card.todos.forEach(todo => {
              const item = document.createElement('div');
              item.className = 'todo-item';
              
              const checkbox = document.createElement('input');
              checkbox.type = 'checkbox';
              checkbox.className = 'todo-checkbox';
              checkbox.checked = todo.completed;
              checkbox.addEventListener('change', () => {
                todo.completed = checkbox.checked;
                this.onUpdate('save', card);
              });

              const text = document.createElement('span');
              text.className = 'todo-text';
              text.contentEditable = true;
              text.textContent = todo.text;
              text.addEventListener('blur', () => {
                todo.text = text.textContent.trim() || 'Tarea';
                this.onUpdate('save', card);
              });
              text.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  text.blur();
                }
              });

              const itemDel = document.createElement('button');
              itemDel.className = 'todo-item-btn';
              itemDel.innerHTML = `<i data-lucide="x"></i>`;
              itemDel.addEventListener('click', () => {
                card.todos = card.todos.filter(t => t.id !== todo.id);
                this.onUpdate('save', card);
              });

              item.appendChild(checkbox);
              item.appendChild(text);
              item.appendChild(itemDel);
              todoList.appendChild(item);
            });
          }
          if (window.lucide) window.lucide.createIcons();
        };

        const inputArea = document.createElement('div');
        inputArea.className = 'todo-input-area';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'todo-input';
        input.placeholder = 'Nueva tarea...';
        
        const addBtn = document.createElement('button');
        addBtn.className = 'btn btn-secondary';
        addBtn.style.padding = '4px 10px';
        addBtn.innerHTML = `<i data-lucide="plus" style="width:14px; height:14px;"></i>`;
        
        const addNewTodo = () => {
          const text = input.value.trim();
          if (!text) return;
          if (!card.todos) card.todos = [];
          card.todos.push({
            id: `todo-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            text,
            completed: false
          });
          input.value = '';
          this.onUpdate('save', card);
        };

        addBtn.addEventListener('click', addNewTodo);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addNewTodo();
          }
        });

        inputArea.appendChild(input);
        inputArea.appendChild(addBtn);
        
        bodyEl.appendChild(todoList);
        bodyEl.appendChild(inputArea);
        renderList();
        break;

      case 'image':
        bodyEl.className = 'card-body image-card-body';
        const img = document.createElement('img');
        img.className = 'image-card-img';
        img.src = card.src || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=300&auto=format&fit=crop';
        img.alt = card.title;
        
        const caption = document.createElement('div');
        caption.className = 'image-card-caption';
        caption.textContent = card.caption || 'Haz clic para editar pie de foto...';
        caption.contentEditable = true;
        caption.addEventListener('blur', () => {
          card.caption = caption.textContent.trim();
          this.onUpdate('save', card);
        });
        caption.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            caption.blur();
          }
        });

        bodyEl.appendChild(img);
        bodyEl.appendChild(caption);
        break;

      case 'board':
        bodyEl.className = 'card-body board-card-body';
        bodyEl.innerHTML = `
          <i data-lucide="folder" class="board-icon"></i>
          <span class="board-label">${card.title || 'Sub-tablero'}</span>
          <span class="board-hint">Doble clic para entrar</span>
        `;
        break;

      case 'link':
        bodyEl.className = 'card-body link-card-body';
        
        const previewHeader = document.createElement('div');
        previewHeader.className = 'link-preview-header';
        
        const linkTitle = document.createElement('div');
        linkTitle.className = 'link-preview-title';
        linkTitle.textContent = card.title || 'Enlace Web';
        
        const linkDesc = document.createElement('div');
        linkDesc.className = 'link-preview-desc';
        linkDesc.textContent = card.description || 'Sin descripción disponible para este enlace.';
        
        previewHeader.appendChild(linkTitle);
        previewHeader.appendChild(linkDesc);
        
        const previewFooter = document.createElement('div');
        previewFooter.className = 'link-preview-footer';
        
        const shortUrl = this.getDomain(card.url || 'https://google.com');
        const urlSpan = document.createElement('span');
        urlSpan.className = 'link-preview-url';
        urlSpan.textContent = shortUrl;
        
        const goBtn = document.createElement('a');
        goBtn.href = card.url || '#';
        goBtn.target = '_blank';
        goBtn.className = 'link-preview-btn';
        goBtn.innerHTML = `<i data-lucide="external-link" style="width:14px; height:14px;"></i>`;
        
        previewFooter.appendChild(urlSpan);
        previewFooter.appendChild(goBtn);
        
        bodyEl.appendChild(previewHeader);
        bodyEl.appendChild(previewFooter);
        break;
    }
  }

  // Create card color picker toolbar
  createColorPicker(card, cardEl) {
    const picker = document.createElement('div');
    picker.className = 'card-colors-picker';
    
    const colors = ['violet', 'emerald', 'blue', 'rose', 'amber', 'indigo', 'slate'];
    colors.forEach(col => {
      const dot = document.createElement('div');
      dot.className = `color-dot ${col}`;
      dot.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        // Remove existing color classes
        colors.forEach(c => cardEl.classList.remove(`color-${c}`));
        
        // Add new class
        cardEl.classList.add(`color-${col}`);
        card.color = col;
        
        this.onUpdate('save', card);
      });
      picker.appendChild(dot);
    });
    
    return picker;
  }

  // Get domain name from URL
  getDomain(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace('www.', '');
    } catch (e) {
      return url;
    }
  }

  // Find max z-index of cards to push clicked card forward
  getMaxZIndex() {
    let max = 10;
    const cards = this.container.querySelectorAll('.card');
    cards.forEach(c => {
      const z = parseInt(c.style.zIndex);
      if (!isNaN(z) && z > max) {
        max = z;
      }
    });
    return max;
  }
}
