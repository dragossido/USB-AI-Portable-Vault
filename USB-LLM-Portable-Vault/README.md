# USB LLM Portable Vault

A no-install portable browser workspace for connecting to local or online
OpenAI-compatible AI providers.

## Included features

- Master-password lock screen
- AES-256-GCM encrypted provider credentials
- PBKDF2-SHA256 password derivation with 310,000 iterations
- Encrypted conversations stored on the USB
- Multiple provider profiles
- Local/online privacy indicator
- Capability settings for text, images, documents, audio and video
- Conversation rename, delete and Markdown export
- Temporary attachment processing
- Attachment metadata stored without storing the original files
- No Node.js, npm, Rust, Visual Studio or installer

## Start

Double-click:

```text
START_USB_LLM.bat
```

The interface opens at:

```text
http://127.0.0.1:8090
```

## First use

1. Enter a master password of at least eight characters.
2. Select **Create new workspace**.
3. Open **Providers**.
4. Add an OpenAI-compatible provider.
5. Select its supported input capabilities.
6. Start a conversation.

## USB storage

Credentials are stored in:

```text
config\vault.enc.json
```

Conversations are stored individually in:

```text
data\conversations
```

Both are encrypted in the browser before being written to disk. The master
password is never saved.

## Attachments

The original attachment is not copied into the USB data folders.

The encrypted conversation keeps only:

- File name
- MIME type
- File size
- `stored: false`
- User message
- AI response

Image attachments use the common OpenAI-compatible `image_url` structure.

For documents, audio and video, this generic first version sends the temporary
file as a data URL inside a text content part. Not every provider accepts that
format. Provider-specific connectors will be needed for full compatibility with
services such as Gemini, Anthropic and OpenAI's dedicated audio or file APIs.

## Important security notes

- Losing the master password means losing access to the encrypted vault and chats.
- Choose a strong password and keep a backup of the USB.
- While the workspace is unlocked, decrypted credentials exist in browser memory.
- Closing or locking the workspace removes them from the application's state.
- The local PowerShell server listens only on `127.0.0.1`.
