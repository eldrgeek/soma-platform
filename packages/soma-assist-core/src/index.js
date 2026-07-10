(function (global, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define(factory);
  } else {
    global.SomaAssistCore = factory();
  }
})(this, function () {
  const cssTemplate = `/*__CSS__*/`;

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
