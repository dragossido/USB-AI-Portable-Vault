const $ = (id) => document.getElementById(id);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const state = {
  masterPassword: null,
  vault: {
    version: 1,
    providers: []
  },
  conversations: [],
  activeConversationId: null,
  pendingFiles: []
};

function randomId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 310000,
      hash: "SHA-256"
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptObject(object, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = encoder.encode(JSON.stringify(object));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return {
    format: "usb-llm-aes-gcm-v1",
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext))
  };
}

async function decryptObject(envelope, password) {
  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.ciphertext);
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return JSON.parse(decoder.decode(plaintext));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`);
  return body;
}

async function vaultExists() {
  const result = await api("/api/vault/exists");
  return Boolean(result.exists);
}

async function readVaultEnvelope() {
  return api("/api/vault/read");
}

async function writeVault() {
  const envelope = await encryptObject(state.vault, state.masterPassword);
  await api("/api/vault/write", {
    method: "POST",
    body: JSON.stringify(envelope)
  });
}

async function loadConversations() {
  const result = await api("/api/conversations/list");
  const conversations = [];

  for (const item of result.items || []) {
    try {
      const envelope = await api(`/api/conversations/read?id=${encodeURIComponent(item.id)}`);
      const conversation = await decryptObject(envelope, state.masterPassword);
      conversations.push(conversation);
    } catch (error) {
      console.warn("Could not load conversation", item.id, error);
    }
  }

  conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  state.conversations = conversations;
}

async function saveConversation(conversation) {
  conversation.updatedAt = new Date().toISOString();
  const envelope = await encryptObject(conversation, state.masterPassword);
  await api(`/api/conversations/write?id=${encodeURIComponent(conversation.id)}`, {
    method: "POST",
    body: JSON.stringify(envelope)
  });

  const index = state.conversations.findIndex((item) => item.id === conversation.id);
  if (index >= 0) state.conversations[index] = conversation;
  else state.conversations.unshift(conversation);

  state.conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  renderConversationList();
}

async function deleteConversationFile(id) {
  await api(`/api/conversations/delete?id=${encodeURIComponent(id)}`, {
    method: "POST",
    body: "{}"
  });
}

function defaultProvider() {
  return {
    id: randomId("provider"),
    name: "Local OpenAI-compatible",
    baseUrl: "http://127.0.0.1:8080/v1",
    model: "local-model",
    apiKey: "",
    capabilities: {
      text: true,
      images: false,
      documents: false,
      audio: false,
      video: false
    }
  };
}

async function createWorkspace() {
  clearLockError();
  const password = $("masterPassword").value;
  if (password.length < 8) {
    showLockError("Use a master password of at least 8 characters.");
    return;
  }

  state.masterPassword = password;
  state.vault = { version: 1, providers: [defaultProvider()] };
  await writeVault();
  state.conversations = [];
  enterApp();
}

async function unlockWorkspace() {
  clearLockError();
  const password = $("masterPassword").value;
  if (!password) {
    showLockError("Enter the master password.");
    return;
  }

  try {
    const envelope = await readVaultEnvelope();
    const vault = await decryptObject(envelope, password);
    state.masterPassword = password;
    state.vault = vault;
    await loadConversations();
    enterApp();
  } catch {
    showLockError("The password is incorrect, or the vault is damaged.");
  }
}

function enterApp() {
  $("masterPassword").value = "";
  $("lockScreen").classList.add("hidden");
  $("app").classList.remove("hidden");
  populateProviderSelect();
  renderProviderList();
  renderConversationList();

  if (state.conversations.length) {
    openConversation(state.conversations[0].id);
  } else {
    createNewConversation();
  }
}

function lockWorkspace() {
  state.masterPassword = null;
  state.vault = { version: 1, providers: [] };
  state.conversations = [];
  state.activeConversationId = null;
  state.pendingFiles = [];
  $("messages").innerHTML = "";
  $("app").classList.add("hidden");
  $("lockScreen").classList.remove("hidden");
}

function activeConversation() {
  return state.conversations.find((item) => item.id === state.activeConversationId);
}

function selectedProvider() {
  return state.vault.providers.find((item) => item.id === $("providerSelect").value);
}

function createNewConversation() {
  const provider = state.vault.providers[0];
  if (!provider) {
    showError("Add a provider profile first.");
    return;
  }

  const now = new Date().toISOString();
  const conversation = {
    id: randomId("conversation"),
    title: "New conversation",
    providerId: provider.id,
    providerName: provider.name,
    model: provider.model,
    createdAt: now,
    updatedAt: now,
    messages: []
  };

  state.conversations.unshift(conversation);
  state.activeConversationId = conversation.id;
  renderConversationList();
  renderMessages();
  $("providerSelect").value = provider.id;
  updateProviderStatus();
}

function openConversation(id) {
  const conversation = state.conversations.find((item) => item.id === id);
  if (!conversation) return;
  state.activeConversationId = id;

  if (state.vault.providers.some((provider) => provider.id === conversation.providerId)) {
    $("providerSelect").value = conversation.providerId;
  }

  renderConversationList();
  renderMessages();
  updateProviderStatus();
}

function renderConversationList() {
  const list = $("conversationList");
  list.innerHTML = "";

  for (const conversation of state.conversations) {
    const button = document.createElement("button");
    button.className = `conversation-item ${conversation.id === state.activeConversationId ? "active" : ""}`;
    button.innerHTML = `
      <strong>${escapeHtml(conversation.title)}</strong>
      <small>${escapeHtml(conversation.providerName || "")}</small>
    `;
    button.addEventListener("click", () => openConversation(conversation.id));
    list.appendChild(button);
  }
}

function renderMessages() {
  const container = $("messages");
  container.innerHTML = "";
  const conversation = activeConversation();

  if (!conversation || !conversation.messages.length) {
    container.innerHTML = `
      <div class="empty">
        <h2>Start a conversation</h2>
        <p>Attachments are processed temporarily and are not stored on the USB.</p>
      </div>
    `;
    return;
  }

  for (const message of conversation.messages) {
    const article = document.createElement("article");
    article.className = `message ${message.role}`;

    const title = document.createElement("strong");
    title.textContent = message.role === "user" ? "You" : "USB LLM";
    article.appendChild(title);

    const paragraph = document.createElement("p");
    paragraph.textContent = message.text || "";
    article.appendChild(paragraph);

    for (const attachment of message.attachments || []) {
      const chip = document.createElement("span");
      chip.className = "attachment-chip";
      chip.textContent = `${attachment.name} · not stored`;
      article.appendChild(chip);
    }

    container.appendChild(article);
  }

  container.scrollTop = container.scrollHeight;
}

function populateProviderSelect() {
  const select = $("providerSelect");
  const previous = select.value;
  select.innerHTML = "";

  for (const provider of state.vault.providers) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = `${provider.name} — ${provider.model}`;
    select.appendChild(option);
  }

  if (state.vault.providers.some((item) => item.id === previous)) {
    select.value = previous;
  }

  updateProviderStatus();
}

function updateProviderStatus() {
  const provider = selectedProvider();
  if (!provider) return;

  const local = provider.baseUrl.includes("127.0.0.1") || provider.baseUrl.includes("localhost");
  $("privacyBadge").textContent = local ? "LOCAL" : "ONLINE";
  $("privacyBadge").className = `badge ${local ? "local" : "online"}`;

  const caps = Object.entries(provider.capabilities)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .join(", ");

  $("capabilitySummary").textContent = caps ? `Supports: ${caps}` : "No capabilities selected";
}

function renderPendingFiles() {
  const container = $("attachmentsPreview");
  container.innerHTML = "";

  state.pendingFiles.forEach((file, index) => {
    const chip = document.createElement("div");
    chip.className = "preview-chip";
    chip.innerHTML = `<span>${escapeHtml(file.name)}</span>`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      state.pendingFiles.splice(index, 1);
      renderPendingFiles();
    });

    chip.appendChild(remove);
    container.appendChild(chip);
  });
}

function attachmentCategory(file) {
  if (file.type.startsWith("image/")) return "images";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  return "documents";
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

async function buildProviderContent(text, files, provider) {
  const parts = [];
  if (text) parts.push({ type: "text", text });

  for (const file of files) {
    const category = attachmentCategory(file);
    if (!provider.capabilities[category]) {
      throw new Error(`${provider.name} is not configured for ${category}.`);
    }

    if (category === "images") {
      const dataUrl = await fileToDataUrl(file);
      parts.push({ type: "image_url", image_url: { url: dataUrl } });
    } else {
      const dataUrl = await fileToDataUrl(file);
      parts.push({
        type: "text",
        text: `[Temporary attachment: ${file.name}, MIME ${file.type || "unknown"}, size ${file.size} bytes, data URL follows]\n${dataUrl}`
      });
    }
  }

  return parts;
}

async function sendMessage(event) {
  event.preventDefault();
  clearError();

  const conversation = activeConversation();
  const provider = selectedProvider();
  const text = $("messageInput").value.trim();
  const files = [...state.pendingFiles];

  if (!conversation || !provider) return;
  if (!text && !files.length) return;

  $("sendButton").disabled = true;
  $("sendButton").textContent = "Thinking...";

  try {
    const metadata = files.map((file) => ({
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      stored: false
    }));

    const userMessage = {
      role: "user",
      text: text || "Please analyse the attached file.",
      attachments: metadata
    };

    conversation.messages.push(userMessage);
    conversation.providerId = provider.id;
    conversation.providerName = provider.name;
    conversation.model = provider.model;

    if (conversation.title === "New conversation") {
      conversation.title = (text || files[0]?.name || "Conversation").slice(0, 60);
    }

    renderMessages();

    const content = await buildProviderContent(text, files, provider);
    const providerMessages = conversation.messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message, index, array) => {
        const isCurrent = index === array.length - 1 && message.role === "user";
        return {
          role: message.role,
          content: isCurrent ? content : message.text
        };
      });

    const result = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.model,
        messages: providerMessages
      })
    });

    const answer = result.choices?.[0]?.message?.content;
    if (!answer) throw new Error("The provider returned no assistant response.");

    conversation.messages.push({
      role: "assistant",
      text: answer,
      attachments: []
    });

    $("messageInput").value = "";
    $("fileInput").value = "";
    state.pendingFiles = [];
    renderPendingFiles();

    await saveConversation(conversation);
    renderMessages();
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unexpected error.");
  } finally {
    $("sendButton").disabled = false;
    $("sendButton").textContent = "Send";
  }
}

function renderProviderList() {
  const container = $("providerList");
  container.innerHTML = "";

  for (const provider of state.vault.providers) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = provider.name;
    button.addEventListener("click", () => loadProviderForm(provider.id));
    container.appendChild(button);
  }
}

function loadProviderForm(id) {
  const provider = state.vault.providers.find((item) => item.id === id);
  if (!provider) return;

  $("providerId").value = provider.id;
  $("providerName").value = provider.name;
  $("providerBaseUrl").value = provider.baseUrl;
  $("providerModel").value = provider.model;
  $("providerApiKey").value = provider.apiKey;
  $("capText").checked = provider.capabilities.text;
  $("capImages").checked = provider.capabilities.images;
  $("capDocuments").checked = provider.capabilities.documents;
  $("capAudio").checked = provider.capabilities.audio;
  $("capVideo").checked = provider.capabilities.video;
}

function clearProviderForm() {
  $("providerId").value = "";
  $("providerName").value = "";
  $("providerBaseUrl").value = "";
  $("providerModel").value = "";
  $("providerApiKey").value = "";
  $("capText").checked = true;
  $("capImages").checked = false;
  $("capDocuments").checked = false;
  $("capAudio").checked = false;
  $("capVideo").checked = false;
}

async function saveProvider() {
  const id = $("providerId").value || randomId("provider");
  const provider = {
    id,
    name: $("providerName").value.trim(),
    baseUrl: $("providerBaseUrl").value.trim(),
    model: $("providerModel").value.trim(),
    apiKey: $("providerApiKey").value,
    capabilities: {
      text: $("capText").checked,
      images: $("capImages").checked,
      documents: $("capDocuments").checked,
      audio: $("capAudio").checked,
      video: $("capVideo").checked
    }
  };

  if (!provider.name || !provider.baseUrl || !provider.model) {
    alert("Provider name, base URL and model are required.");
    return;
  }

  const index = state.vault.providers.findIndex((item) => item.id === id);
  if (index >= 0) state.vault.providers[index] = provider;
  else state.vault.providers.push(provider);

  await writeVault();
  renderProviderList();
  populateProviderSelect();
  loadProviderForm(provider.id);
}

async function deleteProvider() {
  const id = $("providerId").value;
  if (!id) return;
  if (state.vault.providers.length <= 1) {
    alert("Keep at least one provider profile.");
    return;
  }
  if (!confirm("Delete this provider profile?")) return;

  state.vault.providers = state.vault.providers.filter((item) => item.id !== id);
  await writeVault();
  clearProviderForm();
  renderProviderList();
  populateProviderSelect();
}

async function renameConversation() {
  const conversation = activeConversation();
  if (!conversation) return;
  const title = prompt("Conversation title:", conversation.title);
  if (!title) return;
  conversation.title = title.trim().slice(0, 100);
  await saveConversation(conversation);
}

async function deleteConversation() {
  const conversation = activeConversation();
  if (!conversation) return;
  if (!confirm(`Delete "${conversation.title}"?`)) return;

  await deleteConversationFile(conversation.id);
  state.conversations = state.conversations.filter((item) => item.id !== conversation.id);
  state.activeConversationId = null;

  if (state.conversations.length) openConversation(state.conversations[0].id);
  else createNewConversation();
}

function exportConversation() {
  const conversation = activeConversation();
  if (!conversation) return;

  const lines = [`# ${conversation.title}`, "", `Provider: ${conversation.providerName}`, `Model: ${conversation.model}`, ""];

  for (const message of conversation.messages) {
    lines.push(`## ${message.role === "user" ? "You" : "Assistant"}`, "");
    lines.push(message.text || "", "");
    for (const attachment of message.attachments || []) {
      lines.push(`- Attachment: ${attachment.name} (${attachment.type}, ${attachment.size} bytes) — not stored`);
    }
    lines.push("");
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${conversation.title.replace(/[^\w-]+/g, "_") || "conversation"}.md`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function showError(message) {
  $("errorBox").textContent = message;
  $("errorBox").classList.remove("hidden");
}

function clearError() {
  $("errorBox").textContent = "";
  $("errorBox").classList.add("hidden");
}

function showLockError(message) {
  $("lockError").textContent = message;
  $("lockError").classList.remove("hidden");
}

function clearLockError() {
  $("lockError").textContent = "";
  $("lockError").classList.add("hidden");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

$("unlockButton").addEventListener("click", unlockWorkspace);
$("createVaultButton").addEventListener("click", createWorkspace);
$("masterPassword").addEventListener("keydown", (event) => {
  if (event.key === "Enter") unlockWorkspace();
});
$("lockButton").addEventListener("click", lockWorkspace);
$("newChatButton").addEventListener("click", createNewConversation);
$("providersButton").addEventListener("click", () => {
  renderProviderList();
  if (state.vault.providers[0]) loadProviderForm(state.vault.providers[0].id);
  $("providersDialog").showModal();
});
$("providerSelect").addEventListener("change", updateProviderStatus);
$("fileInput").addEventListener("change", (event) => {
  state.pendingFiles.push(...event.target.files);
  renderPendingFiles();
});
$("chatForm").addEventListener("submit", sendMessage);
$("addProviderButton").addEventListener("click", clearProviderForm);
$("saveProviderButton").addEventListener("click", saveProvider);
$("deleteProviderButton").addEventListener("click", deleteProvider);
$("renameChatButton").addEventListener("click", renameConversation);
$("deleteChatButton").addEventListener("click", deleteConversation);
$("exportChatButton").addEventListener("click", exportConversation);

(async () => {
  try {
    const exists = await vaultExists();
    $("unlockButton").disabled = !exists;
    $("createVaultButton").textContent = exists ? "Replace workspace" : "Create new workspace";
  } catch (error) {
    showLockError(`Could not contact the portable server: ${error.message}`);
  }
})();
