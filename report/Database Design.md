# Physical Database Design — SQLite Caching Engine

To optimize personal knowledge management operations—specifically backlinks rendering, global properties autocomplete, full-text searching, and hashtag indexing—the system integrates a local-first **SQLite Database** (`sql.js`) caching layer.

The database file is dynamically initialized inside a hidden folder `.module-test/metadata.db` directly under the active vault path.

---

## 1. Database Schema DDL

The database tables are defined and created at initialization (`database_service.cjs`) as follows:

```sql
-- 1. Documents Table: Stores note-level stats and YAML frontmatter properties
CREATE TABLE IF NOT EXISTS documents (
  path TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  char_count INTEGER NOT NULL,
  mtime_ms REAL NOT NULL,
  size INTEGER NOT NULL,
  properties TEXT NOT NULL
);

-- 2. Blocks Table: Stores block-level parsed data and block-level tag/link lists
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  document_path TEXT NOT NULL,
  type TEXT NOT NULL,
  level INTEGER,
  content TEXT NOT NULL,
  info TEXT,
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  parent_id TEXT,
  children_ids TEXT,
  tags TEXT NOT NULL,
  refs TEXT NOT NULL,
  checked INTEGER,
  FOREIGN KEY(document_path) REFERENCES documents(path) ON DELETE CASCADE
);

-- 3. File References Table: Indexes Wikilinks between documents for backlinks query
CREATE TABLE IF NOT EXISTS file_references (
  source_path TEXT NOT NULL,
  target_path TEXT NOT NULL,
  PRIMARY KEY (source_path, target_path),
  FOREIGN KEY(source_path) REFERENCES documents(path) ON DELETE CASCADE
);

-- 4. File Tags Table: Indexes tags at the note level for tag search and filtering
CREATE TABLE IF NOT EXISTS file_tags (
  document_path TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (document_path, tag),
  FOREIGN KEY(document_path) REFERENCES documents(path) ON DELETE CASCADE
);

-- Enable Foreign Keys Cascading
PRAGMA foreign_keys = ON;
```

---

## 2. Table Column Specifications

### `documents`
*   `path` (TEXT, Primary Key): The normalized relative path of the markdown file (e.g. `Projects/system-design.md`).
*   `title` (TEXT): The note title, extracted from the first H1 tag, or falls back to the filename.
*   `word_count` (INTEGER): Total word count of the file.
*   `char_count` (INTEGER): Total character count of the file.
*   `mtime_ms` (REAL): The modification timestamp (`stat.mtimeMs`) from the filesystem. Used for cache validation.
*   `size` (INTEGER): File size in bytes. Used for cache validation.
*   `properties` (TEXT): JSON-serialized string of note properties (from YAML frontmatter).

### `blocks`
*   `id` (TEXT, Primary Key): Stable unique ID generated via FNV-1a hash (`block://<hex>`).
*   `document_path` (TEXT, Foreign Key -> `documents.path` ON DELETE CASCADE): Path of the containing file.
*   `type` (TEXT): Block type (`heading`, `paragraph`, `list-item`, `quote`, `code`, `table`, `callout`, `empty`).
*   `level` (INTEGER): Level of heading (1, 2, 3...) or null.
*   `content` (TEXT): Text content of the block.
*   `info` (TEXT): Extra attributes (e.g., programming language for code blocks, callout icons).
*   `line_start` (INTEGER): Starting line index in markdown source (1-indexed).
*   `line_end` (INTEGER): Ending line index in markdown source (1-indexed).
*   `parent_id` (TEXT): ID of parent block (hierarchical outliner relationship).
*   `children_ids` (TEXT): JSON string array of child block IDs.
*   `tags` (TEXT): JSON string array of tags parsed in the block.
*   `refs` (TEXT): JSON string array of Wikilinks referenced in the block.
*   `checked` (INTEGER): checkbox state (1 for checked, 0 for unchecked, null for non-checkbox lists).

### `file_references`
*   `source_path` (TEXT, FK -> `documents.path` ON DELETE CASCADE): The source note path containing the link.
*   `target_path` (TEXT): The resolved target path of the link.

### `file_tags`
*   `document_path` (TEXT, FK -> `documents.path` ON DELETE CASCADE): Note containing the tag.
*   `tag` (TEXT): Lowercase tag string (without `#`).

---

## 3. SQLite Caching & Hydration Strategy

To avoid redundant parsing of large numbers of markdown notes on startup, the system implements an **Incremental Hydration Scan**:

1.  On startup or vault switch, the system gathers all file statistics from the active workspace vault path (`mtimeMs` and `size`).
2.  It queries the stored database stats via the IPC handle `sqlite-get-file-stats`, returning a mapping of file path to cached `{ mtimeMs, size }`.
3.  It compares files:
    *   **Cache Hit**: If the filesystem stat (`mtimeMs` and `size`) matches the database stat, the note is hydrated directly into memory (`registerParsedDocument`) without disk read or markdown parse.
    *   **Cache Miss**: If a file is new or modified (stats mismatch), the app reads the file, parses frontmatter and blocks, registers it in memory, and writes the updated info to SQLite (`sqliteSaveDocument`).
    *   **Stale Cleanup**: Any file path present in the database cache that no longer exists on the disk is removed (`sqliteDeleteDocument`).

---

## 4. Search and Query Performance

The database search is executing queries using optimized term matching:

*   **Hashtag Query**: For search terms starting with `#`, the engine matches lowercase tags:
    ```sql
    SELECT * FROM blocks WHERE LOWER(tags) LIKE '%"tag-value"%'
    ```
*   **Text Terms Query**:
    ```sql
    SELECT * FROM blocks WHERE LOWER(content) LIKE '%keyword%'
    ```
*   **Result Composition**: Matching blocks are grouped by document, and returned alongside document stats (`wordCount`, `charCount`, `properties`) to be rendered dynamically in the UI Search panel.
