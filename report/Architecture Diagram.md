# Architecture Diagram — Vault Workspace

```
╔═══════════════════════════════════════════════════════════════════════════════════════╗
║                                 ELECTRON SHELL                                        ║
║  ┌───────────────────────────────────────────────────────────────────────────────┐    ║
║  │                               Main Process                                    │    ║
║  │   File Watcher  │  OS Dialogs  │  Window Controls  │   SQLite Database (sql.js)   │    ║
║  └───────────────────────────────────────┬───────────────────────────────────────┘    ║
║                                          │  IPC Bridge (window.electron.*)            ║
║  ┌───────────────────────────────────────▼───────────────────────────────────────┐    ║
║  │                            Renderer Process                                   │    ║
║  │                                                                               │    ║
║  │  ┌───────────────────────────────────────────────────────────────────────┐    │
║  │  │                            PRESENTATION                               │    │
║  │  │                                                                       │    │
║  │  │   ┌──────────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────┐  │    │
║  │  │   │ Left Sidebar │  │ Main Editor  │  │  Right   │  │ Search & Tag │  │    │
║  │  │   │              │  │              │  │  Panel   │  │ Filters      │  │    │
║  │  │   │ File Explorer│  │  Tabs Bar    │  │          │  │              │  │    │
║  │  │   │ Context Menu │  │  Properties  │  │  Tags    │  │ SQLite DB    │  │    │
║  │  │   │ Drag & Drop  │  │  Panel       │  │  Meta    │  │ Search Panel │  │    │
║  │  │   │              │  │              │  │  Back-   │  │              │  │    │
║  │  │   │              │  │ BlockEditor  │  │  links   │  │              │  │    │
║  │  │   └──────────────┘  └──────────────┘  └──────────┘  └──────────────┘  │    │
║  │  └────────────────────────────────────┬──────────────────────────────────┘    │
║  │                                       │                                       │
║  │  ┌────────────────────────────────────▼──────────────────────────────────┐    │
║  │  │                              SERVICES                                 │    │
║  │  │                                                                       │    │
║  │  │        fileService (including SQLite IPC Wrappers)   vaultService      │    │
║  │  └────────────────────────────────────┬──────────────────────────────────┘    │
║  │                                       │                                       │
║  │  ┌────────────────────────────────────▼──────────────────────────────────┐    │
║  │  │                           RUNTIME ENGINE                              │    │
║  │  │                                                                       │    │
║  │  │   ┌────────────┐      ┌────────────┐      ┌──────────┐                │    │
║  │  │   │  Parser    │─────►│    Sync    │─────►│  Store   │                │    │
║  │  │   │  Pipeline  │      │  Pipeline  │      │          │                │    │
║  │  │   │            │      │            │      │  Block   │                │    │
║  │  │   │ markdown   │      │ SyncManager│      │ Registry │                │    │
║  │  │   │  -parser   │      │            │      │          │                │    │
║  │  │   │ runtime    │      │ runtime    │      │  Block   │                │    │
║  │  │   │  -builder  │      │  -sync     │      │ Runtime  │                │    │
║  │  │   │ runtime    │      │            │      │ (events) │                │    │
║  │  │   │ -normalizer│      │ block-diff │      │          │                │    │
║  │  │   └────────────┘      └────────────┘      └──────────┘                │    │
║  │  │                                                                       │    │
║  │  │   ┌──────────────────────────────────────────────────────────────┐    │
║  │  │   │                       Knowledge Graph                        │    │
║  │  │   │                                                              │    │
║  │  │   │    GraphRuntime   │   RelationshipIndex   │   KQE            │    │
║  │  │   └──────────────────────────────────────────────────────────────┘    │
║  │  └───────────────────────────────────────────────────────────────────────┘    │
║  └───────────────────────────────────────────────────────────────────────────────┘    ║
╚═══════════════════════════════════════════════════════════════════════════════════════╝
```

---

## Data Flow & SQLite Caching Integration

```
                 User Action / File System Watcher
                                │
                                ▼
                           fileService ───────────────────────────────┐
                                │                                     │
         ┌──────────────────────┴──────────────────────┐              │
         │ (Cache Hit - Hydration)                     │ (Cache Miss) │
         ▼                                             ▼              ▼
  SQLite Database Cache (sql.js)                Parser Pipeline   Disk Storage
  ─────────────────────                         ───────────────   ────────────
  Stats metadata (mtime/size check)             markdown-parser   (Raw MD file I/O)
         │                                             │
         │ (Restore doc blocks directly)               ▼
         ▼                                      runtime-builder
  registerParsedDocument()                             │
         │                                      runtime-normalizer
         │                                             │
         ▼                                             ▼
  SyncManager ◄───────────────────────────────── RuntimeDocument 
         │
         ├──────────────────────────────┬──────────────────────────────┐
         ▼                              ▼                              ▼
   BlockRegistry                  GraphRuntime                 RelationshipIndex
  (in-memory store)             (nodes and edges)             (backlinks/tag index)
         │                              │                              │
         └──────────────────────────────┴─────────────────────────────►│
                                                                       ▼
                                                             KnowledgeQueryEngine
                                                                       │
                                                                       ▼
                                                             Presentation Layer
                                                           (Backlinks, Tag Search UI)
```

---

## Architecture Boundaries

| Boundary | Responsibility | Description |
| --- | --- | --- |
| **Electron IPC** | OS Isolation | Separates the OS dialogs, filesystem storage operations, window frame actions, and SQLite database storage in the main process from the renderer UI application. |
| **SQLite Hydration Layer** | Caching & Performance | Intercepts full-vault file loading by comparing modification time (`mtimeMs`) and file size (`size`) stats. If matching, it retrieves documents directly from SQLite database without loading or parsing markdown, achieving high-performance hydration. |
| **Services → Runtime** | Storage decoupling | Services handle read/write commands to both plain files on disk and cache tables in SQLite, passing normalized runtime documents to the pure in-memory `SyncManager`. |
| **Runtime → UI** | Reactive State Management | The React frontend UI queries state from the in-memory `SyncManager` and `KnowledgeQueryEngine` React hooks, triggered reactively by a custom state index updates (`scanTrigger`). |