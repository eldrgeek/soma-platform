(function (global, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define(factory);
  } else {
    global.SomaAssistCore = factory();
  }
})(this, function () {
  const cssTemplate = `:host {
  all: initial; /* reset */
  font-family: system-ui, -apple-system, sans-serif;
}

.soma-assist-wrapper {
  position: fixed;
  z-index: 2147483647; /* max z-index */
  bottom: 0;
  right: 0;
  width: 0;
  height: 0;
}

.soma-chip {
  position: absolute;
  bottom: 24px;
  right: 24px;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: #000;
  color: #fff;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s, opacity 0.2s;
  overflow: hidden;
}
.soma-chip:hover {
  transform: scale(1.05);
}
.soma-chip.soma-hidden {
  opacity: 0;
  pointer-events: none;
}
.soma-chip img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.soma-window {
  position: absolute;
  /* Defaults, overridden by inline styles */
  bottom: 100px;
  right: 24px;
  width: 350px;
  height: 500px;
  min-width: 250px;
  min-height: 300px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  display: flex;
  flex-direction: column;
  opacity: 1;
  transition: opacity 0.2s;
  border: 1px solid #e0e0e0;
}
.soma-window.soma-hidden {
  opacity: 0;
  pointer-events: none;
}

.soma-header {
  height: 48px;
  background: #f5f5f5;
  border-bottom: 1px solid #e0e0e0;
  border-radius: 12px 12px 0 0;
  display: flex;
  align-items: center;
  padding: 0 16px;
  cursor: grab;
  user-select: none;
}
.soma-header:active {
  cursor: grabbing;
}
.soma-title {
  flex: 1;
  font-weight: 600;
  font-size: 16px;
  color: #333;
}
.soma-minimize {
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}
.soma-minimize:hover {
  background: #e0e0e0;
}
.soma-minimize svg {
  width: 16px;
  height: 16px;
  fill: #666;
}

.soma-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.soma-message {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.4;
  word-wrap: break-word;
}
.soma-message.soma-agent {
  background: #f0f0f0;
  color: #333;
  align-self: flex-start;
  border-bottom-left-radius: 4px;
}
.soma-message.soma-user {
  background: #000;
  color: #fff;
  align-self: flex-end;
  border-bottom-right-radius: 4px;
}

.soma-input-area {
  padding: 12px 16px;
  border-top: 1px solid #e0e0e0;
  display: flex;
  gap: 8px;
}
.soma-input-area input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 20px;
  outline: none;
  font-size: 14px;
}
.soma-input-area input:focus {
  border-color: #000;
}
.soma-input-area button {
  background: #000;
  color: #fff;
  border: none;
  border-radius: 20px;
  padding: 0 16px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}
.soma-input-area button:hover {
  background: #333;
}

.soma-status {
  font-size: 12px;
  color: #888;
  text-align: center;
  margin-top: -4px;
  margin-bottom: 8px;
}
.soma-status:empty {
  display: none;
}

/* Resize handle */
.soma-resizer {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 16px;
  height: 16px;
  cursor: sw-resize;
  z-index: 10;
}
.soma-resizer-se {
  left: auto;
  right: 0;
  cursor: se-resize;
}
.soma-resizer-nw {
  top: 0;
  left: 0;
  bottom: auto;
  cursor: nw-resize;
}
.soma-resizer-ne {
  top: 0;
  right: 0;
  bottom: auto;
  cursor: ne-resize;
}
`;

  function createAssistChip({ appId = 'soma-assist', title = 'Assistant', avatar = '', onUserMessage = () => {}, mount = document.body }) {
    // 1. Container & Shadow DOM
    const wrapper = document.createElement('div');
    wrapper.id = `${appId}-wrapper`;
    wrapper.className = 'soma-assist-wrapper';
    mount.appendChild(wrapper);

    const shadow = wrapper.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = cssTemplate;
    shadow.appendChild(style);

    // 2. State
    let isOpen = false;
    let pos = { x: 24, y: 100 }; // default right/bottom distances
    let size = { w: 350, h: 500 };
    
    try {
      const stored = localStorage.getItem(`soma_assist_${appId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.pos) pos = parsed.pos;
        if (parsed.size) size = parsed.size;
      }
    } catch(e) {}

    const saveState = () => {
      try {
        localStorage.setItem(`soma_assist_${appId}`, JSON.stringify({ pos, size }));
      } catch(e) {}
    };

    // 3. UI Elements
    // Chip
    const chip = document.createElement('div');
    chip.className = 'soma-chip';
    chip.innerHTML = avatar 
      ? `<img src="${avatar}" alt="${title}" />`
      : `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>`;
    shadow.appendChild(chip);

    // Window
    const win = document.createElement('div');
    win.className = 'soma-window soma-hidden';
    // Use resize: both and overflow: hidden on the window itself for native resizing
    win.style.resize = 'both';
    win.style.overflow = 'hidden';
    
    const applyPosAndSize = () => {
      win.style.right = `${pos.x}px`;
      win.style.bottom = `${pos.y}px`;
      win.style.width = `${size.w}px`;
      win.style.height = `${size.h}px`;
    };
    applyPosAndSize();

    win.innerHTML = `
      <div class="soma-header">
        <div class="soma-title">${title}</div>
        <div class="soma-minimize" title="Minimize">
          <svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>
        </div>
      </div>
      <div class="soma-body"></div>
      <div class="soma-status"></div>
      <div class="soma-input-area">
        <input type="text" placeholder="Type a message..." />
        <button>Send</button>
      </div>
    `;
    shadow.appendChild(win);

    const body = win.querySelector('.soma-body');
    const input = win.querySelector('input');
    const sendBtn = win.querySelector('button');
    const minBtn = win.querySelector('.soma-minimize');
    const header = win.querySelector('.soma-header');
    const statusEl = win.querySelector('.soma-status');

    // 4. Interactions
    const openWin = () => {
      isOpen = true;
      chip.classList.add('soma-hidden');
      win.classList.remove('soma-hidden');
      input.focus();
    };

    const closeWin = () => {
      isOpen = false;
      win.classList.add('soma-hidden');
      chip.classList.remove('soma-hidden');
    };

    chip.addEventListener('click', openWin);
    minBtn.addEventListener('click', closeWin);

    const handleSend = () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      addMessage(text, 'user');
      onUserMessage(text);
    };
    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSend();
    });

    // Native Resize observer to save size
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.target === win && isOpen) {
          size.w = win.offsetWidth;
          size.h = win.offsetHeight;
          saveState();
        }
      }
    });
    resizeObserver.observe(win);

    // Drag to move (modifying right and bottom relative to screen)
    let isDragging = false;
    let startX, startY;
    let startRight, startBottom;

    header.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startRight = pos.x;
      startBottom = pos.y;
      document.addEventListener('mousemove', onDrag);
      document.addEventListener('mouseup', onStopDrag);
      e.preventDefault();
    });

    const onDrag = (e) => {
      if (!isDragging) return;
      const dx = startX - e.clientX; // Moving left increases 'right'
      const dy = startY - e.clientY; // Moving up increases 'bottom'
      
      pos.x = startRight + dx;
      pos.y = startBottom + dy;
      
      // Basic bounds checking
      if (pos.x < 0) pos.x = 0;
      if (pos.y < 0) pos.y = 0;
      
      win.style.right = `${pos.x}px`;
      win.style.bottom = `${pos.y}px`;
    };

    const onStopDrag = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('mouseup', onStopDrag);
      saveState();
    };

    // API methods
    const addMessage = (text, role = 'agent') => {
      const msg = document.createElement('div');
      msg.className = `soma-message soma-${role}`;
      msg.textContent = text;
      body.appendChild(msg);
      body.scrollTop = body.scrollHeight;
    };

    const setStatus = (text) => {
      statusEl.textContent = text;
    };

    const destroy = () => {
      resizeObserver.disconnect();
      wrapper.remove();
    };

    return {
      open: openWin,
      close: closeWin,
      addMessage,
      setStatus,
      destroy
    };
  }

  return { createAssistChip };
});
