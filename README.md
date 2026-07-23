# USB LLM Portable Vault

A portable, encrypted AI workspace that runs directly from a USB drive and connects to compatible local or online AI providers.

[☕ Buy me a coffee](https://www.buymeacoffee.com/dragossido)

The project is designed around a simple idea:

> **Carry your AI workspace with you — including provider settings, encrypted API credentials, and conversation history — without installing a conventional desktop application.**

USB LLM Portable Vault currently runs as a local browser application on Windows. It uses a small PowerShell server, stores its data inside the project directory, and can be copied from one USB drive to another.

---

## Project status

**Current stage:** early prototype / proof of concept

The current version is suitable for testing and further development. It is not yet intended as a fully audited security product or a finished commercial application.

### Currently working

- Portable browser-based interface
- No Node.js, npm, Rust, Docker, or Visual Studio required
- Master-password protected workspace
- Encrypted API credentials
- Encrypted conversation history
- Multiple provider profiles
- OpenAI-compatible chat endpoints
- Local or online provider indicator
- Conversation creation, renaming, deletion, and export
- Temporary attachment handling
- Attachment metadata saved without storing the original files
- Relative paths, allowing the directory to move between USB drives

### Experimental

- Image input through the common OpenAI-compatible `image_url` message format
- Document, audio, and video attachment handling
- Compatibility with different OpenAI-compatible providers

Different providers implement multimedia inputs differently. Image, document, audio, and video support may therefore require dedicated provider connectors.

### Planned

- Dedicated OpenAI connector
- OpenRouter presets
- Google Gemini connector
- Anthropic Claude connector
- Ollama, LM Studio, LocalAI, and llama.cpp presets
- Portable local GGUF model support
- Automatic CPU, RAM, GPU, and VRAM detection
- CPU, Vulkan, and CUDA runtime selection
- Model manager and hardware recommendations
- Streaming responses
- Conversation search
- Encrypted backup and restore
- Better attachment extraction and preprocessing
- Audio transcription and text-to-speech
- Video frame and audio analysis
- Cross-platform support

---

## Why this project exists

Most AI applications keep provider credentials, preferences, and conversation history inside:

- A cloud account
- A browser profile
- An installed desktop application
- A single computer

USB LLM Portable Vault explores a different approach.

The complete workspace can remain inside one portable directory:

```text
USB-LLM-Portable-Vault/
├── START_USB_LLM.bat
├── SERVER.ps1
├── web/
├── config/
├── data/
└── logs/
```

The directory can be copied to another compatible USB drive and opened with the same master password.

Large source attachments are intentionally not stored in the workspace. This keeps the USB lightweight while preserving the prompts, AI responses, and attachment metadata.

---

## Main features

### Portable operation

The application uses relative paths and writes its configuration and conversation files inside the project directory.

It does not require:

- A traditional installer
- Node.js
- npm
- Rust
- Visual Studio
- Docker

The current release requires Windows PowerShell and a modern browser.

### Multiple AI providers

Provider profiles can contain:

- Provider name
- OpenAI-compatible API base URL
- Model identifier
- API key
- Declared capabilities

Available capability flags include:

- Text
- Images
- Documents
- Audio
- Video

The capability settings describe what the selected provider is expected to support. They do not guarantee that every API uses the same request format.

### Local and online privacy indicator

The interface identifies endpoints using `localhost` or `127.0.0.1` as local and displays a **LOCAL** indicator.

External endpoints display an **ONLINE** indicator.

This helps the user understand whether requests are expected to remain on the computer or be sent to an external provider.

### Encrypted credentials

Provider profiles and API credentials are encrypted before being written to the USB.

The current prototype uses:

- AES-256-GCM
- PBKDF2 with SHA-256
- 310,000 PBKDF2 iterations
- Random salt
- Random initialisation vector
- Browser Web Crypto API

The master password is not stored.

### Encrypted conversations

Each saved conversation is encrypted separately and stored inside:

```text
data/conversations/
```

The encrypted provider vault is stored inside:

```text
config/vault.enc.json
```

### Lightweight attachment history

The original attachment is not permanently copied into the USB workspace.

The conversation stores only metadata such as:

```json
{
  "name": "example-document.pdf",
  "type": "application/pdf",
  "size": 2485670,
  "stored": false
}
```

The user prompt and AI response remain available, but the source file must be attached again if it is needed in a later session.

---

## Requirements

- Windows 10 or Windows 11
- Windows PowerShell
- A modern browser with Web Crypto support
- Internet access when using an online AI provider
- A valid API key when required by the selected provider

No administrator access should normally be required to run the current browser version.

Some managed workplace or education computers may block PowerShell scripts or local HTTP listeners.

---

## Getting started

### 1. Download or clone the project

```bash
git clone https://github.com/dragossido/USB-AI-Portable-Vault.git
```

Alternatively, download the repository as a ZIP and extract it directly to a USB drive.

### 2. Start the application

Double-click:

```text
START_USB_LLM.bat
```

The launcher starts a local PowerShell server and opens:

```text
http://127.0.0.1:8090
```

Keep the terminal window open while using the application.

### 3. Create the encrypted workspace

On first use:

1. Enter a master password of at least eight characters.
2. Select **Create new workspace**.
3. Keep the password somewhere safe.
4. Open **Providers**.
5. Add a compatible AI provider.
6. Start a new conversation.

---

## Adding a provider

For a generic OpenAI-compatible provider, enter:

```text
Provider name:   My Provider
API base URL:    https://provider.example/v1
Model:           exact-model-identifier
API key:         your-secret-api-key
```

For a local OpenAI-compatible server, an endpoint may look like:

```text
http://127.0.0.1:8080/v1
```

Possible local servers include:

- llama.cpp
- LM Studio
- LocalAI
- Ollama with a compatible endpoint
- Other OpenAI-compatible applications

The local server itself is not bundled in this prototype.

---

## Portability

To move or back up the workspace:

1. Lock or close USB LLM.
2. Close the PowerShell window.
3. Copy the complete project directory.
4. Paste it onto another USB drive.
5. Run `START_USB_LLM.bat`.
6. Unlock it using the original master password.

The USB drive letter can change without breaking the project because the launcher uses relative paths.

Always copy the entire directory, including:

```text
web/
config/
data/
logs/
SERVER.ps1
START_USB_LLM.bat
```

---

## Security notes

This project is an early prototype and has not undergone an independent security audit.

Important considerations:

- The master password cannot currently be recovered.
- Losing the password means losing access to the encrypted vault and conversations.
- Use a strong and unique master password.
- Keep a secure backup of the USB directory.
- Decrypted credentials exist temporarily in browser memory while the workspace is unlocked.
- Lock or close the workspace before removing the USB drive.
- Do not use the prototype for highly sensitive production credentials without reviewing the implementation.
- The local server listens only on `127.0.0.1`.
- Logs should never contain API keys, but users should still review log files before sharing them publicly.
- Browser downloads, including exported conversations, may be saved to the computer's Downloads folder rather than the USB.

---

## Attachment privacy

Attachments are read temporarily by the browser so they can be sent to the selected provider.

The original files are not copied into the USB conversation folder.

However:

- Online providers receive the attached content when a request is sent.
- Local providers process it on the computer running the local model.
- Provider privacy and retention policies still apply.
- Non-image multimedia support is experimental.
- Very large files can consume substantial memory while being converted for transmission.

Always check the **LOCAL** or **ONLINE** indicator before sending private material.

---

## Known limitations

- Windows-only launcher
- PowerShell may be restricted by organisational policies
- Generic OpenAI-compatible chat connector only
- No streaming output yet
- No automatic provider model discovery
- No password recovery
- No security audit
- No bundled local LLM runtime or GGUF model
- Multimedia APIs are not standardised across providers
- Documents, audio, and video may not work with many endpoints
- Original attachments cannot be reopened from saved conversations
- Exported Markdown files are not encrypted
- Browser memory may temporarily contain decrypted information
- The current server handles requests sequentially

---

## Planned local AI architecture

A future release is intended to support optional portable local AI through native llama.cpp runtimes.

The proposed structure is:

```text
runtime/
├── cpu/
├── vulkan/
└── cuda/

models/
├── lite/
├── standard/
└── vision/
```

The launcher could detect the available hardware and select:

- CPU mode for computers without a suitable GPU
- Vulkan for compatible AMD, Intel, or NVIDIA graphics
- CUDA for supported NVIDIA GPUs
- An online provider when local processing is unavailable or too slow

Small quantised GGUF models could provide a basic offline fallback on ordinary computers, while larger models would remain optional.

---

## Repository structure

```text
USB-LLM-Portable-Vault/
├── START_USB_LLM.bat       # Windows launcher
├── SERVER.ps1              # Local static server and API proxy
├── README.md
├── web/
│   ├── index.html          # Application interface
│   ├── styles.css          # Interface styling
│   └── app.js              # Encryption, providers, and conversations
├── config/
│   └── vault.enc.json      # Created after first setup
├── data/
│   └── conversations/      # Encrypted conversation files
└── logs/
    └── server.log
```

Do not commit your personal encrypted vault, conversations, or logs to a public repository.

A suitable `.gitignore` should include:

```gitignore
config/vault.enc.json
data/conversations/*.enc.json
logs/*
!logs/.gitkeep
```

---

## Development

The current version intentionally uses plain HTML, CSS, JavaScript, and PowerShell to remain lightweight and portable.

Core components:

- Browser Web Crypto API for client-side encryption
- PowerShell `HttpListener` for the local web server
- PowerShell API proxy for OpenAI-compatible requests
- Encrypted JSON files for portable persistence

When contributing, avoid introducing requirements that force normal users to install a development runtime unless there is also a compiled or portable distribution.

---

## Contributing

Contributions, testing, issue reports, and suggestions are welcome.

Useful contribution areas include:

- Provider connectors
- Security review
- Local model integration
- Multimedia preprocessing
- Accessibility
- Interface improvements
- Cross-platform launchers
- Documentation
- Automated testing

Before submitting a pull request:

1. Do not include personal API keys.
2. Do not include encrypted personal vault files.
3. Do not include private conversation history.
4. Explain the change clearly.
5. Test the portable launcher on a clean Windows environment where possible.

---

## Responsible use

Users are responsible for:

- Following the terms of the selected AI provider
- Protecting their own API credentials
- Checking the privacy implications of online requests
- Respecting copyright and data-protection requirements
- Verifying AI-generated information before relying on it

---

## Support the project

This project is being developed independently.

If you find it useful and would like to support continued development, testing, documentation, and future local-AI integration, you may add a support link here:


[☕ Buy me a coffee](https://www.buymeacoffee.com/dragossido)


Support is optional. Bug reports, testing, documentation improvements, and GitHub contributions are also valuable.

---

## Licence

A licence has not yet been selected.

Before publishing the repository, choose an open-source licence appropriate for your goals. Common options include:

- **MIT** — simple and permissive
- **Apache-2.0** — permissive with an explicit patent grant
- **GPL-3.0** — requires distributed modifications to remain open source

Replace this section after adding a `LICENSE` file.

---

## Disclaimer

This software is provided as an experimental project without warranty.

Do not rely on it as the only copy of important credentials or conversations. Keep backups and review the source code before using it with sensitive information.
