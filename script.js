// ================= DOM ELEMENTS =================
const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessageButton = document.querySelector("#send-message");
const fileInput = document.querySelector("#file-input");
const chatbotToggler = document.querySelector("#chatbot-toggler");
const closeChatbot = document.querySelector("#close-chatbot");

// ================= API SETUP =================
// API key must be provided via an untracked `config.js` that sets `window.APP_CONFIG`.
// Example (see config.example.js):
// window.APP_CONFIG = { API_KEY: 'YOUR_API_KEY_HERE' };
const API_KEY = (window.APP_CONFIG && window.APP_CONFIG.API_KEY) || "";
const API_URL = API_KEY
  ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`
  : null;

// ================= STATE =================
let pendingImage = null;        // 🔥 one-time image buffer
const chatHistory = [];
const initialInputHeight = messageInput.scrollHeight;

const imagePreviewEl = document.querySelector("#image-preview");
const clearChatBtn = document.querySelector("#clear-chat");
const downloadChatBtn = document.querySelector("#download-chat");
const themeToggleBtn = document.querySelector("#theme-toggle");

let pendingController = null;

// ================= HELPERS =================
const createMessageElement = (content, ...classes) => {
  const div = document.createElement("div");
  div.classList.add("message", ...classes);
  div.innerHTML = content;
  return div;
};

// ================= GEMINI RESPONSE =================
const generateBotResponse = async (botDiv, text, image) => {
  const messageElement = botDiv.querySelector(".message-text");

  const parts = [{ text }];
  if (image) parts.push({ inline_data: image });

  chatHistory.push({ role: "user", parts });

  // allow canceling with AbortController
  pendingController = new AbortController();
  try {
    if (!API_URL) {
      messageElement.innerText = 'API key not configured. Add config.js with your API key.';
      messageElement.style.color = '#b03a2e';
      return;
    }
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: chatHistory }),
      signal: pendingController.signal,
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'API error');

    const botText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'No response';
    messageElement.innerText = botText;

    chatHistory.push({ role: "model", parts: [{ text: botText }] });
  } catch (err) {
    if (err.name === 'AbortError') {
      messageElement.innerText = 'Response canceled.';
      messageElement.style.color = '#9a94d6';
    } else {
      messageElement.innerText = err.message || 'Error';
      messageElement.style.color = 'red';
    }
  } finally {
    botDiv.classList.remove("thinking");
    // remove cancel button once response finished/aborted
    const cancelBtn = botDiv.querySelector('.cancel-response');
    if (cancelBtn) cancelBtn.remove();
    pendingController = null;
    chatBody.scrollTop = chatBody.scrollHeight;
    saveChatToStorage();
  }
};

// ================= SEND MESSAGE =================
const handleOutgoingMessage = (e) => {
  e.preventDefault();

  const text = messageInput.value.trim();
  if (!text && !pendingImage) return;

  messageInput.value = "";
  messageInput.dispatchEvent(new Event("input"));

  const ts = formatTimestamp();
    const userHTML = `
    <div class="message-text">${text}
      ${ pendingImage ? `<img src="data:${pendingImage.mime_type};base64,${pendingImage.data}" class="attachment" />` : '' }
    </div>
    <div class="meta"><small>${ts}</small>
      <button class="copy-btn" title="Copy message">content_copy</button>
      ${ pendingImage ? `<button class="remove-msg" title="Remove attachment">delete</button>` : '' }
    </div>
  `;

  chatBody.appendChild(createMessageElement(userHTML, "user-message"));
  chatBody.lastElementChild.dataset.ts = ts;
  chatBody.scrollTop = chatBody.scrollHeight;
  saveChatToStorage();

  setTimeout(() => {
    const botHTML = `
      <svg class="bot-avatar" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
        <path d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9z"/>
      </svg>
      <div class="message-text">
        <div class="thinking-indicator">
          <div class="dot"></div>
          <div class="dot"></div>
          <div class="dot"></div>
        </div>
      </div>
      <div class="meta"><small>${formatTimestamp()}</small>
        <button class="copy-btn" title="Copy message">content_copy</button>
        <button class="cancel-response" title="Cancel response">close</button>
      </div>
    `;

    const botDiv = createMessageElement(botHTML, "bot-message", "thinking");
    chatBody.appendChild(botDiv);
    chatBody.scrollTop = chatBody.scrollHeight;

    const imageToSend = pendingImage;
    // clear preview UI and hide send
    clearImagePreviewUI();

    generateBotResponse(botDiv, text, imageToSend);
  }, 500);
};

// ================= ENTER KEY =================
messageInput.addEventListener("keydown", (e) => {
  if (
    e.key === "Enter" &&
    !e.shiftKey &&
    window.innerWidth > 768 &&
    (messageInput.value.trim() || pendingImage)
  ) {
    handleOutgoingMessage(e);
  }
});

// ================= AUTO RESIZE INPUT =================
messageInput.addEventListener("input", () => {
  messageInput.style.height = `${initialInputHeight}px`;
  messageInput.style.height = `${messageInput.scrollHeight}px`;
});

// ================= IMAGE UPLOAD =================
const showSendButton = (show) => {
  if (show) sendMessageButton.style.display = "block";
  else sendMessageButton.style.display = "none";
};

const clearImagePreviewUI = () => {
  pendingImage = null;
  if (imagePreviewEl) {
    imagePreviewEl.innerHTML = "";
    imagePreviewEl.hidden = true;
  }
  showSendButton(false);
};

const showImagePreviewUI = (dataUrl, file) => {
  if (!imagePreviewEl) return;
  imagePreviewEl.hidden = false;
  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = file.name || "preview";

  const meta = document.createElement("div");
  meta.className = "preview-meta";
  meta.innerHTML = `<div>${file.name || "Image"}</div><div style="font-size:0.8rem;color:#7b76a8">${Math.round(
    file.size / 1024
  )} KB</div>`;

  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-image";
  removeBtn.title = "Remove image";
  removeBtn.innerText = "✕";
  removeBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    clearImagePreviewUI();
  });

  imagePreviewEl.innerHTML = "";
  imagePreviewEl.appendChild(img);
  imagePreviewEl.appendChild(meta);
  imagePreviewEl.appendChild(removeBtn);
  showSendButton(true);
};

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    pendingImage = {
      data: e.target.result.split(",")[1],
      mime_type: file.type,
    };

    showImagePreviewUI(e.target.result, file);
  };

  reader.readAsDataURL(file);
  fileInput.value = "";
});

// Drag & drop support on the chat form
const chatForm = document.querySelector(".chat-form");
if (chatForm) {
  chatForm.addEventListener("dragover", (e) => {
    e.preventDefault();
    chatForm.classList.add("dragover");
  });

  chatForm.addEventListener("dragleave", () => {
    chatForm.classList.remove("dragover");
  });

  chatForm.addEventListener("drop", (e) => {
    e.preventDefault();
    chatForm.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      pendingImage = {
        data: ev.target.result.split(",")[1],
        mime_type: file.type,
      };
      showImagePreviewUI(ev.target.result, file);
    };
    reader.readAsDataURL(file);
  });
}

// ================= BUTTONS =================
sendMessageButton.addEventListener("click", handleOutgoingMessage);

document
  .querySelector("#file-upload")
  .addEventListener("click", () => fileInput.click());

if (chatbotToggler) {
  chatbotToggler.addEventListener("click", () => {
    document.body.classList.toggle("show-chatbot");
  });
}

if (closeChatbot) {
  closeChatbot.addEventListener("click", () => {
    document.body.classList.remove("show-chatbot");
  });
}

/* ---------------- Additional Features ---------------- */

const formatTimestamp = (date = new Date()) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function saveChatToStorage() {
  try {
    const nodes = Array.from(chatBody.querySelectorAll('.message'));
    const data = nodes.map(n => ({ html: n.querySelector('.message-text')?.innerHTML || '', classes: Array.from(n.classList), ts: n.dataset.ts || '' }));
    localStorage.setItem('chat_messages', JSON.stringify(data));
  } catch (e) { console.warn(e); }
}

function loadChatFromStorage() {
  try {
    const raw = localStorage.getItem('chat_messages');
    if (!raw) return;
    const data = JSON.parse(raw);
    chatBody.innerHTML = '';
    data.forEach(item => {
      const div = document.createElement('div');
      div.className = item.classes.join(' ');
      div.dataset.ts = item.ts || '';
      div.innerHTML = item.html + (item.ts ? `<div class="meta"><small>${item.ts}</small></div>` : '');
      chatBody.appendChild(div);
    });
    chatBody.scrollTop = chatBody.scrollHeight;
  } catch (e) { console.warn(e); }
}

// clear chat
if (clearChatBtn) {
  clearChatBtn.addEventListener('click', () => {
    if (!confirm('Clear chat history?')) return;
    chatBody.innerHTML = '';
    localStorage.removeItem('chat_messages');
  });
}

// download chat
if (downloadChatBtn) {
  downloadChatBtn.addEventListener('click', () => {
    const text = Array.from(chatBody.querySelectorAll('.message')).map(m => {
      const who = m.classList.contains('user-message') ? 'User' : 'Bot';
      const t = m.dataset.ts || '';
      const txt = m.querySelector('.message-text')?.innerText || '';
      return `[${t}] ${who}: ${txt}`;
    }).join('\n\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chat.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

// copy message (delegate)
chatBody.addEventListener('click', (e) => {
  const copyBtn = e.target.closest('.copy-btn');
  if (!copyBtn) return;
  const msg = copyBtn.closest('.message');
  const text = msg.querySelector('.message-text')?.innerText || '';
  navigator.clipboard?.writeText(text).then(() => {
    copyBtn.innerText = 'check';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.innerText = 'content_copy';
      copyBtn.classList.remove('copied');
    }, 900);
  }).catch(() => {});
});

// delegated remove message button (for attachments or messages)
chatBody.addEventListener('click', (e) => {
  const rem = e.target.closest('.remove-msg');
  if (!rem) return;
  const msg = rem.closest('.message');
  if (!msg) return;
  msg.remove();
  saveChatToStorage();
});

// delegated cancel response button
chatBody.addEventListener('click', (e) => {
  const cancelBtn = e.target.closest('.cancel-response');
  if (!cancelBtn) return;
  if (pendingController) {
    pendingController.abort();
    // find the thinking bot-message ancestor and update text
    const botMsg = cancelBtn.closest('.bot-message');
    if (botMsg) {
      const textEl = botMsg.querySelector('.message-text');
      if (textEl) {
        textEl.innerText = 'Response canceled.';
        botMsg.classList.remove('thinking');
      }
    }
  }
});

// image click handlers removed (lightbox was removed)

// theme toggle
if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    themeToggleBtn.innerText = isDark ? 'light_mode' : 'dark_mode';
    localStorage.setItem('chat_theme', isDark ? 'dark' : 'light');
  });
  const saved = localStorage.getItem('chat_theme');
  if (saved === 'dark') { document.body.classList.add('dark-theme'); themeToggleBtn.innerText = 'light_mode'; }
}

// keyboard shortcut: Ctrl/Cmd+Enter to send
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    handleOutgoingMessage(new Event('submit'));
  }
});

// load persisted chat
loadChatFromStorage();
