const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let db = null;
let SQL = null;
let currentDbPath = null;

async function initDatabase(vaultPath) {
  if (!SQL) {
    SQL = await initSqlJs();
  }

  // Close existing db if any
  closeDatabase();

  const dbDir = path.join(vaultPath, '.module-test');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  currentDbPath = path.join(dbDir, 'metadata.db');

  if (fs.existsSync(currentDbPath)) {
    try {
      const filebuffer = fs.readFileSync(currentDbPath);
      db = new SQL.Database(filebuffer);
    } catch (err) {
      console.error("Failed to load SQLite DB file, initializing empty:", err);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // Check if blocks table has old schema (only 1 primary key column: 'id')
  let needRebuild = false;
  if (fs.existsSync(currentDbPath)) {
    try {
      const stmt = db.prepare("PRAGMA table_info(blocks)");
      let pkCount = 0;
      while (stmt.step()) {
        const col = stmt.getAsObject();
        if (col.pk > 0) {
          pkCount++;
        }
      }
      stmt.free();
      // If table exists but only has 1 PK (which was id), rebuild to support composite PK (id, document_path)
      if (pkCount === 1) {
        needRebuild = true;
      }
    } catch (e) {
      // blocks table might not exist yet
    }
  }

  if (needRebuild) {
    console.log("Migrating SQLite cache schema: Dropping old tables to rebuild with composite primary key...");
    try {
      db.run("DROP TABLE IF EXISTS file_references;");
      db.run("DROP TABLE IF EXISTS file_tags;");
      db.run("DROP TABLE IF EXISTS blocks;");
      db.run("DROP TABLE IF EXISTS documents;");
    } catch (err) {
      console.error("Failed to drop old tables during migration:", err);
    }
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      path TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      word_count INTEGER NOT NULL,
      char_count INTEGER NOT NULL,
      mtime_ms REAL NOT NULL,
      size INTEGER NOT NULL,
      properties TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS blocks (
      id TEXT NOT NULL,
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
      PRIMARY KEY (id, document_path),
      FOREIGN KEY(document_path) REFERENCES documents(path) ON DELETE CASCADE
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS file_references (
      source_path TEXT NOT NULL,
      target_path TEXT NOT NULL,
      PRIMARY KEY (source_path, target_path),
      FOREIGN KEY(source_path) REFERENCES documents(path) ON DELETE CASCADE
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS file_tags (
      document_path TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (document_path, tag),
      FOREIGN KEY(document_path) REFERENCES documents(path) ON DELETE CASCADE
    );
  `);

  // Foreign keys constraint enable
  db.run("PRAGMA foreign_keys = ON;");

  // Save database initial state if new
  if (!fs.existsSync(currentDbPath)) {
    saveDatabase();
  }
}

function saveDatabase() {
  if (!db || !currentDbPath) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(currentDbPath, buffer);
  } catch (err) {
    console.error("Failed to write SQLite database to disk:", err);
  }
}

function getStoredFileStats() {
  if (!db) return {};
  try {
    const stmt = db.prepare("SELECT path, mtime_ms, size FROM documents");
    const stats = {};
    while (stmt.step()) {
      const row = stmt.getAsObject();
      stats[row.path] = {
        mtimeMs: row.mtime_ms,
        size: row.size
      };
    }
    stmt.free();
    return stats;
  } catch (err) {
    console.error("Failed to query stored file stats:", err);
    return {};
  }
}

function saveDocument(doc, mtimeMs, size) {
  if (!db) return;

  try {
    db.run("BEGIN TRANSACTION;");

    // 1. Insert/Update Document
    const insertDocStmt = db.prepare(`
      INSERT OR REPLACE INTO documents (path, title, word_count, char_count, mtime_ms, size, properties)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertDocStmt.run([
      doc.path,
      doc.title,
      doc.wordCount,
      doc.charCount,
      mtimeMs,
      size,
      JSON.stringify(doc.properties || {})
    ]);
    insertDocStmt.free();

    // 2. Clear old relation tables manually to avoid conflict
    const deleteBlocksStmt = db.prepare("DELETE FROM blocks WHERE document_path = ?");
    deleteBlocksStmt.run([doc.path]);
    deleteBlocksStmt.free();

    const deleteTagsStmt = db.prepare("DELETE FROM file_tags WHERE document_path = ?");
    deleteTagsStmt.run([doc.path]);
    deleteTagsStmt.free();

    const deleteRefsStmt = db.prepare("DELETE FROM file_references WHERE source_path = ?");
    deleteRefsStmt.run([doc.path]);
    deleteRefsStmt.free();

    // 3. Insert blocks
    const insertBlockStmt = db.prepare(`
      INSERT OR REPLACE INTO blocks (id, document_path, type, level, content, info, line_start, line_end, parent_id, children_ids, tags, refs, checked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const block of doc.blocks) {
      insertBlockStmt.run([
        block.id,
        doc.path,
        block.type,
        block.level !== undefined ? block.level : null,
        block.content || '',
        block.info || null,
        block.metadata.lineStart,
        block.metadata.lineEnd,
        block.parentId || null,
        JSON.stringify(block.childrenIds || []),
        JSON.stringify(block.metadata.tags || []),
        JSON.stringify(block.metadata.references || []),
        block.metadata.checked !== undefined ? (block.metadata.checked ? 1 : 0) : null
      ]);
    }
    insertBlockStmt.free();

    // 4. Insert tags
    const insertTagStmt = db.prepare(`
      INSERT OR IGNORE INTO file_tags (document_path, tag)
      VALUES (?, ?)
    `);
    for (const tag of doc.tags) {
      insertTagStmt.run([doc.path, tag.toLowerCase()]);
    }
    insertTagStmt.free();

    // 5. Insert references (Wikilinks)
    const insertRefStmt = db.prepare(`
      INSERT OR IGNORE INTO file_references (source_path, target_path)
      VALUES (?, ?)
    `);
    for (const ref of doc.references) {
      insertRefStmt.run([doc.path, ref]);
    }
    insertRefStmt.free();

    db.run("COMMIT;");
    saveDatabase();
  } catch (err) {
    try {
      db.run("ROLLBACK;");
    } catch (_) {}
    console.error("Failed to save document to SQLite:", doc.path, err);
    throw err;
  }
}

function deleteDocument(filePath) {
  if (!db) return;
  const normalizedPath = filePath.replace(/\\/g, '/');
  try {
    db.run("BEGIN TRANSACTION;");
    const stmt = db.prepare("DELETE FROM documents WHERE path = ?");
    stmt.run([normalizedPath]);
    stmt.free();
    db.run("COMMIT;");
    saveDatabase();
  } catch (err) {
    try {
      db.run("ROLLBACK;");
    } catch (_) {}
    console.error("Failed to delete document from SQLite:", normalizedPath, err);
    throw err;
  }
}

function loadCachedDocuments() {
  if (!db) return [];

  try {
    // Read all documents
    const docsStmt = db.prepare("SELECT * FROM documents");
    const documentsList = [];
    
    while (docsStmt.step()) {
      const docRow = docsStmt.getAsObject();
      
      // Read blocks for this document
      const blocksStmt = db.prepare("SELECT * FROM blocks WHERE document_path = ? ORDER BY line_start ASC");
      const blocks = [];
      
      blocksStmt.bind([docRow.path]);
      while (blocksStmt.step()) {
        const blockRow = blocksStmt.getAsObject();
        const bTags = JSON.parse(blockRow.tags || '[]');
        const bRefs = JSON.parse(blockRow.refs || '[]');

        blocks.push({
          id: blockRow.id,
          type: blockRow.type,
          level: blockRow.level !== null ? blockRow.level : undefined,
          content: blockRow.content,
          info: blockRow.info !== null ? blockRow.info : undefined,
          parentId: blockRow.parent_id !== null ? blockRow.parent_id : undefined,
          childrenIds: JSON.parse(blockRow.children_ids || '[]'),
          children: [], // will be reconstructed or kept as inline arrays
          metadata: {
            sourceFile: blockRow.document_path,
            lineStart: blockRow.line_start,
            lineEnd: blockRow.line_end,
            parentId: blockRow.parent_id !== null ? blockRow.parent_id : undefined,
            childrenIds: JSON.parse(blockRow.children_ids || '[]'),
            tags: bTags,
            references: bRefs,
            checked: blockRow.checked !== null ? (blockRow.checked === 1) : undefined
          }
        });
      }
      blocksStmt.free();

      // Load actual document-level tags and references
      const docTagsStmt = db.prepare("SELECT tag FROM file_tags WHERE document_path = ?");
      docTagsStmt.bind([docRow.path]);
      const tags = [];
      while (docTagsStmt.step()) {
        tags.push(docTagsStmt.getAsObject().tag);
      }
      docTagsStmt.free();

      const docRefsStmt = db.prepare("SELECT target_path FROM file_references WHERE source_path = ?");
      docRefsStmt.bind([docRow.path]);
      const references = [];
      while (docRefsStmt.step()) {
        references.push(docRefsStmt.getAsObject().target_path);
      }
      docRefsStmt.free();

      documentsList.push({
        path: docRow.path,
        title: docRow.title,
        wordCount: docRow.word_count,
        charCount: docRow.char_count,
        properties: JSON.parse(docRow.properties || '{}'),
        blocks,
        tags,
        references
      });
    }
    docsStmt.free();

    return documentsList;
  } catch (err) {
    console.error("Failed to load cached documents from SQLite:", err);
    return [];
  }
}

function searchNotesAndBlocks(queryText) {
  if (!db) return [];

  const cleanQuery = queryText.trim();
  if (!cleanQuery) return [];

  const terms = cleanQuery.split(/\s+/).filter(t => t.length > 0);
  if (terms.length === 0) return [];

  const tagTerms = [];
  const textTerms = [];
  for (const term of terms) {
    if (term.startsWith('#')) {
      const tag = term.slice(1).toLowerCase();
      if (tag) tagTerms.push(tag);
    } else {
      textTerms.push(term.toLowerCase());
    }
  }

  try {
    const docStmt = db.prepare("SELECT path, title, word_count, char_count, properties FROM documents");
    const documents = [];
    while (docStmt.step()) {
      const row = docStmt.getAsObject();
      documents.push({
        path: row.path,
        title: row.title,
        wordCount: row.word_count,
        charCount: row.char_count,
        properties: JSON.parse(row.properties || '{}'),
        tags: [],
        matchingBlocks: []
      });
    }
    docStmt.free();

    const tagStmt = db.prepare("SELECT document_path, tag FROM file_tags");
    const docTagsMap = new Map();
    while (tagStmt.step()) {
      const row = tagStmt.getAsObject();
      if (!docTagsMap.has(row.document_path)) {
        docTagsMap.set(row.document_path, new Set());
      }
      docTagsMap.get(row.document_path).add(row.tag.toLowerCase());
    }
    tagStmt.free();

    for (const doc of documents) {
      const tagSet = docTagsMap.get(doc.path);
      doc.tags = tagSet ? Array.from(tagSet) : [];
    }

    let blockQuery = "SELECT * FROM blocks";
    const blockParams = [];
    const blockConditions = [];

    for (const term of textTerms) {
      blockConditions.push("LOWER(content) LIKE ?");
      blockParams.push(`%${term}%`);
    }
    for (const tag of tagTerms) {
      blockConditions.push("LOWER(tags) LIKE ?");
      blockParams.push(`%"${tag}"%`);
    }

    if (blockConditions.length > 0) {
      blockQuery += " WHERE " + blockConditions.join(" OR ");
    }

    const blockStmt = db.prepare(blockQuery);
    if (blockParams.length > 0) {
      blockStmt.bind(blockParams);
    }

    const matchingBlocksMap = new Map();
    while (blockStmt.step()) {
      const blockRow = blockStmt.getAsObject();
      const bTags = JSON.parse(blockRow.tags || '[]');
      const bRefs = JSON.parse(blockRow.refs || '[]');
      
      const block = {
        id: blockRow.id,
        type: blockRow.type,
        level: blockRow.level !== null ? blockRow.level : undefined,
        content: blockRow.content,
        info: blockRow.info !== null ? blockRow.info : undefined,
        parentId: blockRow.parent_id !== null ? blockRow.parent_id : undefined,
        childrenIds: JSON.parse(blockRow.children_ids || '[]'),
        metadata: {
          sourceFile: blockRow.document_path,
          lineStart: blockRow.line_start,
          lineEnd: blockRow.line_end,
          tags: bTags,
          references: bRefs,
          checked: blockRow.checked !== null ? (blockRow.checked === 1) : undefined
        }
      };

      if (!matchingBlocksMap.has(blockRow.document_path)) {
        matchingBlocksMap.set(blockRow.document_path, []);
      }
      matchingBlocksMap.get(blockRow.document_path).push(block);
    }
    blockStmt.free();

    const filteredResults = [];

    for (const doc of documents) {
      const docBlocks = matchingBlocksMap.get(doc.path) || [];
      let docMatchesAll = true;

      for (const term of textTerms) {
        const titleMatches = doc.title.toLowerCase().includes(term);
        const anyBlockMatches = docBlocks.some(b => b.content.toLowerCase().includes(term));
        if (!titleMatches && !anyBlockMatches) {
          docMatchesAll = false;
          break;
        }
      }

      if (!docMatchesAll) continue;

      for (const tag of tagTerms) {
        const docTagMatches = doc.tags.some(t => t.toLowerCase() === tag);
        const anyBlockMatches = docBlocks.some(b => b.metadata.tags.some(t => t.toLowerCase() === tag));
        if (!docTagMatches && !anyBlockMatches) {
          docMatchesAll = false;
          break;
        }
      }

      if (!docMatchesAll) continue;

      docBlocks.sort((a, b) => a.metadata.lineStart - b.metadata.lineStart);

      filteredResults.push({
        path: doc.path,
        title: doc.title,
        wordCount: doc.wordCount,
        charCount: doc.charCount,
        properties: doc.properties,
        tags: doc.tags,
        matchingBlocks: docBlocks
      });
    }

    return filteredResults;
  } catch (err) {
    console.error("Failed to perform search database query:", err);
    return [];
  }
}

function closeDatabase() {
  if (db) {
    try {
      db.close();
    } catch (_) {}
    db = null;
    currentDbPath = null;
  }
}

module.exports = {
  initDatabase,
  getStoredFileStats,
  saveDocument,
  deleteDocument,
  loadCachedDocuments,
  searchNotesAndBlocks,
  closeDatabase
};
