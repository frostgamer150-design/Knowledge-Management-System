---

# 5.4 Algorithm Design

---

## ALG-01 — Block ID Generation (FNV-1a Hash)

**Mục đích:** Tạo ID ổn định, duy nhất cho mỗi block dựa trên nội dung và vị trí.

```
INPUT:  filePath, index, content
OUTPUT: "block://<hex>"

ALGORITHM FNV1a_32:
  input  ← normalize(filePath) + ":" + index + ":" + trim(content)
  hash   ← 2166136261          // FNV offset basis

  FOR each char c IN input:
    hash ← hash XOR charCode(c)
    hash ← hash * 16777619     // FNV prime
    hash ← hash AND 0xFFFFFFFF // keep 32-bit

  RETURN "block://" + (hash >>> 0).toString(16)
```

```
Ví dụ:
  filePath = "Projects/meeting.md"
  index    = 2
  content  = "Hello World"
  input    = "Projects/meeting.md:2:Hello World"
             │
             ▼ FNV-1a
  hash     = 3f7a1b2c
  ID       = "block://3f7a1b2c"
```

> **Tính chất:** Cùng file + cùng vị trí + cùng nội dung → cùng ID. Nội dung thay đổi → ID mới → diff phát hiện "thêm mới".

---

## ALG-02 — Parser Pipeline (3 Stages)

**Mục đích:** Chuyển đổi raw Markdown string → RuntimeBlock[] chuẩn hóa.

```
INPUT:  content (string), sourceFile (string)
OUTPUT: RuntimeBlock[]

┌─────────────────────────────────────────────────┐
│  STAGE 1 — parseMarkdownToRawBlocks()           │
│                                                  │
│  IF content chứa "<!-- block "                  │
│    ├─ Split theo HTML comment boundaries        │
│    ├─ Parse attributes: id, type, level,        │
│    │                    info, checked           │
│    └─ Trả về RawBlock[] với lineStart/lineEnd   │
│  ELSE                                            │
│    └─ Wrap toàn bộ content thành 1 paragraph    │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│  STAGE 2 — buildRuntimeBlocks()                 │
│                                                  │
│  FOR each RawBlock:                             │
│    id   ← generateBlockId(sourceFile, i, content)│
│    IF raw block có id sẵn → dùng id đó         │
│    children ← tokenizeInlineContent(content)    │
│    metadata ← {sourceFile, lineStart, lineEnd,  │
│                tags[], references[]}            │
│    RETURN RuntimeBlock                          │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│  STAGE 3 — normalizeRuntimeBlocks()             │
│                                                  │
│  Reset tất cả parentId = null, childrenIds = [] │
│  stack ← []                                     │
│                                                  │
│  FOR each block (i = 0..n):                     │
│    level ← block.level ?? 0                     │
│    WHILE stack.top.level >= level:              │
│      stack.pop()                                │
│    IF stack không rỗng:                         │
│      block.parentId ← stack.top.id             │
│      stack.top.childrenIds.push(block.id)       │
│    stack.push({id, level})                      │
│                                                  │
│  RETURN blocks (với hierarchy đã thiết lập)     │
└─────────────────────────────────────────────────┘
```

---

## ALG-03 — Inline Content Tokenizer

**Mục đích:** Phân tích nội dung text thành chuỗi InlineNode (wikilink, hashtag, bold, ...).

```
INPUT:  text (string)
OUTPUT: InlineNode[]

nodes ← []
index ← 0

WHILE index < text.length:
  sub ← text.substring(index)

  MATCH theo thứ tự ưu tiên:

  ① ![[link]]  (embed)
    ─ push { type: 'embed', content: link, raw }
    ─ index += raw.length

  ② [[link]]  (wikilink)
    ─ push { type: 'wikilink', content: link, raw }
    ─ index += raw.length

  ③ **text**  (bold)
    ─ push { type: 'bold', content: inner, raw }
    ─ index += raw.length

  ④ *text*  (italic)
    ─ push { type: 'italic', content: inner, raw }
    ─ index += raw.length

  ⑤ `code`  (inline code)
    ─ push { type: 'code', content: inner, raw }
    ─ index += raw.length

  ⑥ #tag  (hashtag — không phải hex color)
    ─ push { type: 'hashtag', content: tagName, raw }
    ─ index += raw.length

  ⑦ char thường
    ─ append vào text node hiện tại
    ─ index += 1

RETURN nodes
```

```
Ví dụ:
  Input:  "See [[John]] about #roadmap and **important** stuff"
  Output: [
    { type: 'text',     content: 'See '         },
    { type: 'wikilink', content: 'John'          },
    { type: 'text',     content: ' about '      },
    { type: 'hashtag',  content: 'roadmap'       },
    { type: 'text',     content: ' and '        },
    { type: 'bold',     content: 'important'     },
    { type: 'text',     content: ' stuff'        },
  ]
```

---

## ALG-04 — Block Diff Algorithm

**Mục đích:** So sánh oldBlocks vs newBlocks để tìm ra added / removed / updated / moved.

```
INPUT:  oldBlocks[], newBlocks[]
OUTPUT: { added[], removed[], updated[], moved[] }

ALGORITHM diffBlocks:

  oldMap ← Map<id, block> từ oldBlocks
  newMap ← Map<id, block> từ newBlocks

  ── PASS 1: Tìm removed ──────────────────────────
  FOR each block IN oldBlocks:
    IF block.id NOT IN newMap:
      removed.push(block.id)

  ── PASS 2: Tìm added / updated / moved ──────────
  FOR i = 0 TO newBlocks.length - 1:
    newBlock ← newBlocks[i]
    oldBlock ← oldMap.get(newBlock.id)

    IF oldBlock KHÔNG TỒN TẠI:
      correspondingOld ← oldBlocks[i]  // same position
      isReplacement ← correspondingOld EXISTS
                      AND correspondingOld.type === newBlock.type
                      AND correspondingOld.id NOT IN newMap

      IF isReplacement:
        updated.push(newBlock)
        removed.remove(correspondingOld.id)  // không thực sự bị xoá
      ELSE:
        added.push(newBlock)

    ELSE:  // ID khớp
      shifted ← lineStart đổi OR lineEnd đổi OR parentId đổi
      IF shifted:
        moved.push(newBlock)

  RETURN { added, removed, updated, moved }
```

```
Ví dụ minh họa:

  oldBlocks: [A(id=1), B(id=2), C(id=3)]
  newBlocks: [A(id=1), D(id=4), E(id=5)]

  PASS 1 → removed = [2, 3]   (B, C không còn trong newMap)
  PASS 2:
    i=0: newBlock=A(id=1), oldBlock=A → lineStart đổi? → moved/unchanged
    i=1: newBlock=D(id=4), oldBlock=null
         correspondingOld = B(id=2), type match, B not in newMap
         → isReplacement = true → updated.push(D), removed.remove(2)
    i=2: newBlock=E(id=5), oldBlock=null
         correspondingOld = C(id=3), type match, C not in newMap
         → isReplacement = true → updated.push(E), removed.remove(3)

  Result: added=[], removed=[], updated=[D,E], moved=[]
```

---

## ALG-05 — AST Diff Algorithm

**Mục đích:** Kiểm tra nhanh xem hai danh sách RawBlock có tương đương không (trước khi chạy full diff).

```
INPUT:  oldAST[], newAST[]
OUTPUT: { added[], removed[], equivalent }

ALGORITHM diffAST:

  ── Bước 1: Kiểm tra equivalence nhanh ──────────
  equivalent ← (oldAST.length === newAST.length)

  IF equivalent:
    FOR i = 0 TO length - 1:
      IF oldAST[i].type ≠ newAST[i].type
         OR oldAST[i].content ≠ newAST[i].content:
        equivalent ← false
        BREAK

  ── Bước 2: Nếu không tương đương, tìm diff ─────
  IF NOT equivalent:
    oldContents ← Set(oldAST.map(b → b.content))
    newContents ← Set(newAST.map(b → b.content))

    FOR each b IN newAST:
      IF b.content NOT IN oldContents → added.push(b)

    FOR each b IN oldAST:
      IF b.content NOT IN newContents → removed.push(b)

  RETURN { added, removed, equivalent }
```

> **Lưu ý:** Dùng `content` làm key để so sánh — không dùng ID vì RawBlock chưa có ID ổn định. Đây là diff sơ bộ trước khi bước lên `diffBlocks`.

---

## ALG-06 — Wikilink Resolver

**Mục đích:** Resolve `[[target]]` → đường dẫn thực tế trong vault, với 3 mức fallback.

```
INPUT:  target (string), sourceFile (string), allPaths (string[])
OUTPUT: resolvedPath (string | null)

ALGORITHM resolveLinkPath:

  { targetFile } ← parseReferenceTarget(target)
    // Tách anchor: "Note#Header" → targetFile="Note", anchor="Header"

  IF targetFile rỗng → RETURN null

  targetWithExt ← targetFile.endsWith('.md')
                  ? targetFile
                  : targetFile + ".md"

  ── Mức 1: Tìm tương đối so với sourceFile ──────
  sourceDir ← thư mục chứa sourceFile
  relativePath ← sourceDir + "/" + targetWithExt
  IF relativePath IN allPaths → RETURN relativePath

  ── Mức 2: Tìm tuyệt đối từ vault root ──────────
  IF targetWithExt IN allPaths → RETURN targetWithExt

  ── Mức 3: Tìm theo filename trong toàn vault ───
  targetFileName ← basename(targetWithExt)
  FOR each path IN allPaths:
    IF basename(path).toLowerCase()
       === targetFileName.toLowerCase():
      RETURN path

  RETURN null   // không tìm thấy
```

```
Ví dụ:
  target     = "John"
  sourceFile = "Projects/Work/meeting.md"
  allPaths   = ["Projects/Work/John.md", "Resources/John.md"]

  Mức 1: "Projects/Work/John.md" → TÌM THẤY ✓
  RETURN "Projects/Work/John.md"

  ──────────────────────────────────────────────
  target     = "typescript-guide"
  sourceFile = "Projects/Work/meeting.md"

  Mức 1: "Projects/Work/typescript-guide.md" → không có
  Mức 2: "typescript-guide.md" → không có
  Mức 3: tìm filename → "Resources/typescript-guide.md" ✓
  RETURN "Resources/typescript-guide.md"
```

---

## ALG-07 — Frontmatter Parser

**Mục đích:** Tách YAML frontmatter khỏi nội dung Markdown và parse thành object.

```
INPUT:  content (string)
OUTPUT: { properties: Record<string,any>, remainingContent: string }

ALGORITHM parseFrontmatter:

  IF content không bắt đầu bằng "---\n":
    RETURN { properties: {}, remainingContent: content }

  frontmatterText ← text giữa "---\n" và "\n---\n"
  remainingContent ← phần còn lại sau "---\n"

  properties ← {}
  currentKey ← ""

  FOR each line IN frontmatterText.split('\n'):
    IF line rỗng → SKIP

    IF line bắt đầu bằng '-' AND currentKey tồn tại:
      // List item
      val ← line.slice(1).trim()
      IF properties[currentKey] chưa là array:
        properties[currentKey] ← []
      properties[currentKey].push(val)
      CONTINUE

    colonIdx ← line.indexOf(':')
    key ← line trước ':'
    val ← line sau ':' (trimmed)
    currentKey ← key

    IF val bắt đầu '[' kết thúc ']':
      // Inline array: [a, b, c]
      properties[key] ← val.split(',').map(trim)
    ELSE IF val không rỗng:
      properties[key] ← val       // scalar
    ELSE:
      properties[key] ← []        // mảng sẽ tiếp tục ở dòng sau

  RETURN { properties, remainingContent }
```

```
Ví dụ input:
  ---
  tags:
    - work
    - team
  status: in-progress
  date: 2026-06-11
  ---
  # Note content...

Output properties:
  {
    tags:   ["work", "team"],
    status: "in-progress",
    date:   "2026-06-11"
  }
```

---

## ALG-08 — Relationship Index Update

**Mục đích:** Cập nhật backlinks, forwardRefs, tagIndex khi một file thay đổi — xoá quan hệ cũ trước khi ghi mới.

```
INPUT:  sourceFile, resolvedTargets[], tags[]
OUTPUT: (side effects trên 4 maps)

ALGORITHM registerFileRelations:

  src ← normalize(sourceFile)

  ── Bước 1: Xoá tất cả quan hệ cũ của file này ──
  oldTargets ← forwardReferences.get(src) ?? {}
  FOR each oldDest IN oldTargets:
    backlinks.get(oldDest).delete(src)

  oldTags ← fileTags.get(src) ?? {}
  FOR each tag IN oldTags:
    tagIndex.get(tag).delete(src)

  forwardReferences.delete(src)
  fileTags.delete(src)

  ── Bước 2: Ghi quan hệ mới ──────────────────────
  targetsSet ← new Set()
  FOR each target IN resolvedTargets:
    dest ← normalize(target)
    targetsSet.add(dest)

    IF backlinks không có dest:
      backlinks.set(dest, new Set())
    backlinks.get(dest).add(src)      // backlink: dest ← src

  forwardReferences.set(src, targetsSet)

  tagsSet ← new Set()
  FOR each tag IN tags:
    tagsSet.add(tag)
    IF tagIndex không có tag:
      tagIndex.set(tag, new Set())
    tagIndex.get(tag).add(src)

  fileTags.set(src, tagsSet)
```

```
Trạng thái sau khi chạy:

  backlinks["Projects/John.md"]    = {"meeting.md", "ideas.md"}
  forwardReferences["meeting.md"]  = {"Projects/John.md", "todo.md"}
  tagIndex["work"]                 = {"meeting.md", "todo.md"}
  fileTags["meeting.md"]           = {"work", "team"}
```

---

## ALG-09 — Tab Management (Preview vs Pin)

**Mục đích:** Click đơn thay thế tab đang active (preview), Ctrl+Click mở thêm tab mới (pin).

```
INPUT:  path, isCtrlClick, openTabs[], currentActiveTabPath
OUTPUT: newOpenTabs[]

ALGORITHM handleSelectFile:

  IF path đã có trong openTabs:
    // Tab đã mở → chỉ activate, không thay đổi danh sách
    setActiveTabPath(path)
    RETURN

  IF isCtrlClick OR openTabs rỗng OR không có tab active:
    // Mở tab mới (pin behavior)
    newTabs ← [...openTabs, { path, title }]

  ELSE:
    // Thay thế tab đang active (preview behavior)
    activeIdx ← openTabs.findIndex(t → t.path === currentActiveTabPath)
    IF activeIdx >= 0:
      newTabs ← openTabs với newTabs[activeIdx] = { path, title }
    ELSE:
      newTabs ← [...openTabs, { path, title }]

  setOpenTabs(newTabs)
  setActiveTabPath(path)
```

---

## ALG-10 — Watcher Toast Ignore Logic

**Mục đích:** Khi app tự tạo/sửa/xoá file, bỏ qua toast từ watcher để tránh hiển thị trùng.

```
INPUT:  payload {event, type, path}
OUTPUT: shouldShowToast (boolean)

ALGORITHM checkIgnoreToast:

  now ← Date.now()

  // Dọn entries cũ hơn 3 giây
  ignoredPaths ← ignoredPaths.filter(item → now - item.timestamp < 3000)

  normPath ← normalize(payload.path)

  FOR each item IN ignoredPaths:
    IF item.event ≠ payload.event → CONTINUE

    // Khớp chính xác (file)
    IF normPath === item.path → RETURN false (bỏ qua)

    // Khớp prefix (folder delete kéo theo nhiều files)
    IF normPath.startsWith(item.path + '/') → RETURN false

  RETURN true (hiển thị toast)

──────────────────────────────────────────────
  Khi app chủ động thao tác:
    ignoreWatcherToast(path, event):
      ignoredPaths.push({ path, event, timestamp: now })
```

```
Timeline minh họa:

  t=0ms:  App gọi createFile("note.md")
          → ignoreWatcherToast("note.md", "create")
          → ignoredPaths = [{ path:"note.md", event:"create", t=0 }]

  t=50ms: Watcher fires { event:"create", path:"note.md" }
          → normPath = "note.md"
          → item.path match → RETURN false → KHÔNG hiện toast ✓

  t=3100ms: item hết hạn, bị dọn
            → Lần sau watcher fire thật sẽ hiện toast bình thường ✓
```