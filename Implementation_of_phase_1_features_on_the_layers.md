Các tính năng của mình và cách nó được triển khai xuyên suốt từng phần hệ thống
tới từ [[Tóm tắt các tính năng Phase 1]]

---

### I. Nhóm tính năng: Quản lý cấu trúc Vault & File System

#### 1. Mở và đóng Vault

- **Tầng UI (Renderer):** Khi người dùng click chọn Vault, [App.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx) gọi hàm [vaultService.selectVaultDir()](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/vault_Service.ts#L16).
  - *Mục tiêu:* Kích hoạt luồng chọn thư mục gốc của Vault thông qua hộp thoại hệ thống và nhận lại đường dẫn được chọn để làm việc.
- **Tầng Cầu nối IPC:** [preload.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/preload.cjs#L10) định nghĩa API `selectVaultDir` thực hiện gửi yêu cầu `ipcRenderer.invoke('select-vault-dir')`.
  - *Mục tiêu:* Cung cấp kênh giao tiếp an toàn IPC từ Renderer sang Main Process mà không phơi bày các hàm hệ thống (Node.js API) trực tiếp ra ngoài, đảm bảo an toàn sandbox cho UI.
- **Tầng Main Process & Persistence:** Trong [main.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/main.cjs#L185), handler `'select-vault-dir'` mở hộp thoại hệ thống `dialog.showOpenDialog`. Khi thư mục được chọn:
  1. Đường dẫn mới được lưu vào tệp JSON cấu hình thông qua `ElectronStore`.
     - *Mục tiêu:* Ghi nhớ đường dẫn Vault hiện tại để tự động nạp lại khi người dùng mở lại ứng dụng lần sau.
  2. Khởi tạo lại kết nối CSDL SQLite cục bộ bằng cách gọi hàm `dbService.initDatabase(selectedPath)`.
     - *Mục tiêu:* Thiết lập cơ chế bộ nhớ đệm (caching) bền vững bằng cách tải hoặc khởi tạo cơ sở dữ liệu SQLite cục bộ (`metadata.db`) ngay tại thư mục ẩn `.module-test` của Vault được chọn. Việc này giúp lưu trữ sẵn toàn bộ chỉ mục (documents, blocks, tags, backlinks) để truy vấn tức thì mà không cần phải quét đĩa và phân tích cú pháp lại toàn bộ các tệp văn bản từ đầu mỗi khi khởi động ứng dụng (tránh nghẽn hiệu năng trên Vault lớn), đồng thời đảm bảo dữ liệu cache được cô lập riêng biệt theo từng Vault.
  3. Trình giám sát thay đổi file khởi động lại trên thư mục mới và gửi thông báo `vault-changed` về Renderer.
     - *Mục tiêu:* Theo dõi tức thời mọi biến động tập tin trong thư mục Vault mới và thông báo cho UI biết để tải lại cấu trúc cây thư mục tương ứng.

#### 2. Đọc cây thư mục đệ quy

- **Tầng UI (Renderer):** Khi ứng dụng tải hoặc đổi Vault, gọi hàm [fileService.getVaultTree()](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/file_Service.ts#L7) và lưu cấu trúc cây thư mục vào state `directoryTrees`.
  - *Mục tiêu:* Lấy cấu trúc cây thư mục mới nhất từ Main Process để render giao diện File Explorer ở sidebar trái.
- **Tầng Cầu nối IPC:** [preload.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/preload.cjs#L14) chuyển tiếp yêu cầu qua kênh IPC `'get-vault-tree'`.
  - *Mục tiêu:* Chuyển tiếp yêu cầu truy vấn cấu trúc thư mục dạng cây một cách bất đồng bộ qua cầu nối bảo mật IPC.
- **Tầng Main Process:** Trong [main.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/main.cjs#L78), hàm đệ quy [readDirectoryRecursive](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/main.cjs#L78) quét thư mục bằng `fs.readdirSync(..., { withFileTypes: true })`:
  - Loại bỏ các tệp tin/thư mục ẩn bắt đầu bằng dấu chấm (`.`).
    - *Mục tiêu:* Ẩn các thư mục cấu hình hệ thống hoặc thư mục ẩn nội bộ (như `.git`, `.module-test`) để giữ cho giao diện File Explorer gọn gàng, tránh việc người dùng vô tình chỉnh sửa file hệ thống.
  - Bọc thông tin thành các node chứa cấu trúc `name`, `path` (chuẩn hóa dấu gạch chéo `/`), `isFolder` và danh sách `children`.
    - *Mục tiêu:* Chuẩn hóa dữ liệu sang dạng JSON có cấu trúc phân tầng giúp Renderer dễ dàng duyệt và hiển thị đệ quy.
  - Sắp xếp thư mục lên trước tệp tin, xếp theo thứ tự bảng chữ cái và trả về Renderer.
    - *Mục tiêu:* Mang lại trải nghiệm duyệt thư mục trực quan và chuyên nghiệp (giống VS Code hay Obsidian).

#### 3. Đồng bộ thay đổi filesystem

- **Tầng Main Process:** Tệp [file_watcher.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/file_watcher.cjs#L8) khởi tạo trình theo dõi bằng **Chokidar**. Chokidar giám sát đĩa và bắt các sự kiện (`add`, `addDir`, `change`, `unlink`, `unlinkDir`) rồi chuyển đổi thành payload chuẩn hóa và gửi qua kênh IPC `'vault-tree-changed'`.
  - *Mục tiêu:* Giám sát liên tục các thay đổi vật lý của tệp tin trên ổ đĩa (ngay cả khi thay đổi được thực hiện bởi các công cụ bên ngoài ứng dụng) để đảm bảo dữ liệu hiển thị và chỉ mục luôn đồng nhất với thực tế.
- **Tầng Cầu nối IPC:** [preload.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/preload.cjs#L32) tiếp nhận sự kiện và truyền vào callback đăng ký của Renderer.
  - *Mục tiêu:* Đăng ký lắng nghe các sự kiện thay đổi hệ thống tập tin từ Main Process và kích hoạt hàm xử lý tương ứng phía UI.
- **Tầng UI & Runtime (Renderer):** [App.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx) lắng nghe sự kiện:
  - Nếu là sự kiện tạo mới hoặc sửa đổi: Đọc tệp tin và đưa vào bộ máy [SyncManager](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/sync/sync-manager.ts#L13) để phân tích cú pháp lại.
    - *Mục tiêu:* Cập nhật cây thư mục trên UI, đồng thời chuyển dữ liệu nội dung mới qua bộ phân tích cú pháp để trích xuất thẻ tag, liên kết ngược (backlinks) thời gian thực.
  - Nếu là sự kiện xóa: Kích hoạt [SyncManager.getInstance().handleFileDelete(...)](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/sync/sync-manager.ts#L107) để dọn dẹp các chỉ mục quan hệ, đồng thời đóng tab tương ứng.
    - *Mục tiêu:* Loại bỏ hoàn toàn các liên kết ngược (backlinks) trỏ tới tệp tin đã xóa và dọn sạch bộ nhớ cache RAM, đồng thời cập nhật UI tránh hiển thị tab lỗi của tệp không còn tồn tại.

#### 4. Thao tác file vật lý

- **Tầng UI (Renderer):** UI gọi các API đóng gói sẵn trong [file_Service.ts](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/file_Service.ts) như `createFile`, `createFolder`, `readFile`, `writeFile`, `moveItem`, `deleteItem`.
  - *Mục tiêu:* Trừu tượng hóa các tác vụ CRUD file vật lý dưới dạng các hàm tiện ích để các thành phần UI dễ dàng gọi trực tiếp.
- **Tầng Cầu nối IPC:** [preload.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/preload.cjs#L15) map tương ứng qua các hàm gọi IPC `invoke`.
  - *Mục tiêu:* Truyền các tham số thao tác tệp tin từ Renderer qua IPC bridge sang Main Process thực hiện.
- **Tầng Main Process:** Trong [main.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/main.cjs#L230-L344) xử lý I/O vật lý:
  - Tạo/Ghi đè file: `fs.writeFileSync(absolutePath, content)`.
    - *Mục tiêu:* Ghi nội dung văn bản trực tiếp xuống ổ đĩa tại đường dẫn chỉ định.
  - Tạo thư mục: `fs.mkdirSync(absolutePath, { recursive: true })`.
    - *Mục tiêu:* Tạo mới thư mục vật lý, hỗ trợ tạo đệ quy các thư mục cha nếu chưa tồn tại.
  - Đọc: `fs.readFileSync(absolutePath, 'utf-8')`.
    - *Mục tiêu:* Đọc nội dung thô dạng UTF-8 từ ổ đĩa để truyền lên hiển thị trên Editor.
  - Xóa: `fs.rmSync(absolutePath, { recursive: true, force: true })`.
    - *Mục tiêu:* Xóa bỏ vĩnh viễn tệp tin hoặc toàn bộ thư mục khỏi đĩa.
  - Di chuyển/Đổi tên: `fs.renameSync(oldPath, newPath)` kết hợp thuật toán sinh tên dự phòng tránh trùng lặp.
    - *Mục tiêu:* Di chuyển hoặc đổi tên tệp/thư mục trên hệ điều hành, đảm bảo an toàn dữ liệu bằng cách tự động sinh tên mới dạng `file (1).md` nếu đường dẫn đích trùng tên với một tệp có sẵn.

#### 5. Drag & Drop di chuyển file

- **Tầng UI (Renderer):** Trong [App.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx), các node thư mục/tệp tin hỗ trợ thuộc tính HTML5 `draggable={true}`.
  - Sự kiện `onDragStart` thiết lập node nguồn đang được kéo (`draggedNode`).
    - *Mục tiêu:* Ghi nhận thông tin tệp tin/thư mục đang được người dùng nhấp giữ để chuẩn bị kéo.
  - Sự kiện `onDragOver` và `onDrop` xác định thư mục đích (`draggedOverFolder`).
    - *Mục tiêu:* Cho phép thả và xác định chính xác thư mục đích mà tệp tin nguồn sẽ được chuyển vào.
  - Khi drop thành công, ứng dụng gọi [fileService.moveItem(...)](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/file_Service.ts#L52).
    - *Mục tiêu:* Yêu cầu hệ thống thực hiện di chuyển tập tin vật lý sang vị trí mới.
- **Tầng Main Process:** Tương tự như thao tác vật lý `move-item`, đổi tên vị trí tệp tin trên ổ đĩa thông qua `fs.renameSync`. Trình theo dõi thay đổi Chokidar sẽ tự động bắt lấy và cập nhật lại cây thư mục.
  - *Mục tiêu:* Cập nhật vị trí vật lý trên ổ đĩa, Chokidar watcher sẽ chịu trách nhiệm thông báo lại để UI vẽ lại cấu trúc cây thư mục mới mà không làm mất đồng bộ.

---

### II. Nhóm tính năng: Giao diện Explorer & Tương tác người dùng

#### 1. Render File Explorer

- **Tầng UI (Renderer):** Trong [App.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx), một hàm render cây thư mục đệ quy nhận dữ liệu từ state `directoryTrees` để hiển thị. Các node tệp tin được gắn icon, định dạng kiểu chữ, và liên kết sự kiện click mở file.
  - *Mục tiêu:* Tạo giao diện danh sách phân cấp trực quan, cho phép người dùng click để mở tài liệu, mở rộng/thu gọn các thư mục và tương tác chuột phải.

#### 2. Chuột phải (Context Menu)

- **Tầng UI (Renderer):** Các node thư mục/tệp tin được gắn sự kiện `onContextMenu`. Khi chuột phải kích hoạt, ứng dụng chặn menu mặc định của trình duyệt và lưu vị trí tọa độ click cùng node mục tiêu vào state `contextMenu` để render menu tuỳ chỉnh chứa 4 chức năng: _New File_, _New Folder_, _Rename_, và _Delete_.
  - *Mục tiêu:* Cung cấp các thao tác CRUD nhanh chóng ngay tại vị trí node tệp tin được click, cải thiện trải nghiệm người dùng tương tự như các phần mềm quản lý file chuyên nghiệp.

#### 3. Expand / Collapse

- **Tầng UI (Renderer):** [App.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx) sử dụng một đối tượng State `expandedFolders: Record<string, boolean>`. Nhấp vào Chevron của thư mục sẽ đảo ngược trạng thái boolean của đường dẫn thư mục đó trong Map, từ đó ẩn/hiện danh sách con.
  - *Mục tiêu:* Cho phép đóng/mở từng thư mục linh hoạt để người dùng dễ dàng thu hẹp hoặc mở rộng phạm vi xem của các cấu trúc thư mục sâu.

#### 4. Highlight file đang mở

- **Tầng UI (Renderer):** Khi hiển thị từng node trong cây thư mục, hệ thống so sánh thuộc tính đường dẫn `node.path` với state của tab đang hoạt động `activeTabPath` (hoặc `activeFilePath`). Nếu khớp, áp dụng lớp CSS highlight (như `bg-blue-500/10 text-blue-400 font-medium`).
  - *Mục tiêu:* Đánh dấu nổi bật tệp tin đang mở trên Sidebar để người dùng dễ dàng định vị vị trí của tệp tin hiện tại trong cấu trúc thư mục tổng thể.

---

### III. Nhóm tính năng: Hệ thống Workspace & Tabs

#### 1. Quản lý Tab

- **Tầng UI (Renderer):** [App.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx) duy trì mảng `openTabs` chứa các đối tượng `{ path, title }` và con trỏ `activeTabPath`.
  - *Mục tiêu:* Cho phép quản lý và làm việc đồng thời với nhiều tài liệu dưới dạng các tab thẻ công tác.
  - **Thêm/Chuyển Tab:** Cập nhật state và nạp nội dung tệp tin lên editor.
    - *Mục tiêu:* Nạp nội dung tập tin tương ứng để hiển thị lên vùng soạn thảo khi người dùng chuyển tab hoặc mở file mới.
  - **Xử lý đồng bộ đổi tên:** Khi nhận sự kiện đổi tên từ watcher, Renderer duyệt mảng `openTabs` để sửa đổi thuộc tính `path` và `title` của tab tương ứng mà không làm gián đoạn trạng thái soạn thảo.
    - *Mục tiêu:* Cập nhật thông tin đường dẫn và tiêu đề của tab bị đổi tên để đảm bảo các thay đổi tiếp theo của người dùng được ghi nhận vào đúng đường dẫn mới.
  - **Xử lý đồng bộ xóa file:** Sự kiện xóa từ watcher sẽ lọc bỏ tệp tin đó khỏi `openTabs` và tự động chuyển tab hiển thị sang tab kế cận.
    - *Mục tiêu:* Tự động đóng tab của file vừa bị xóa để tránh lỗi cố gắng hiển thị hoặc lưu tệp không còn tồn tại trên đĩa.

#### 2. Layout Sidebar & Panel

- **Tầng UI (Renderer):** Layout ba cột phân chia rõ rệt sử dụng Flexbox/Grid CSS trực tiếp trong phần return của [App.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx):
  - *Mục tiêu:* Cấu trúc hóa giao diện ứng dụng khoa học:
    - _Sidebar trái:_ Duyệt cây thư mục và tìm kiếm file nhanh.
    - _Panel chính:_ Vùng trung tâm quản lý tab soạn thảo văn bản.
    - _Sidebar phải:_ Hiển thị Frontmatter, backlinks và thống kê từ của file đang mở.

#### 3. Hệ thống thông báo Toast

- **Tầng UI (Renderer):** [App.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx) duy trì danh sách thông báo qua state `toasts`. Các thao tác như lưu, đổi tên, đổi vault sẽ chèn thêm phần tử vào mảng. Một hook `useEffect` sẽ tự động dọn dẹp các thông báo này sau khoảng thời gian đếm ngược (timeout).
  - *Mục tiêu:* Cung cấp phản hồi trạng thái không gây gián đoạn (non-blocking notification) cho người dùng về kết quả của các tác vụ hệ thống.

---

### IV. Nhóm tính năng: Note Editor & Markdown Parser

#### 1. Chế độ Edit / Preview

- **Tầng UI (Renderer):** State `previewMode` (boolean) kiểm soát luồng hiển thị trong panel soạn thảo chính.
  - *Mục tiêu:* Cung cấp hai trải nghiệm làm việc linh hoạt:
    - Nếu ở chế độ `Edit Mode`, mount component [BlockEditor.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/components/BlockEditor.tsx) truyền vào dữ liệu `editorBlocks`.
      - *Mục tiêu:* Cho phép người dùng chỉnh sửa trực quan nội dung văn bản phân chia theo từng khối độc lập.
    - Nếu ở chế độ `Preview Mode`, duyệt qua danh sách các block trong bộ nhớ và kết xuất chúng thành các HTML element tĩnh định dạng sẵn.
      - *Mục tiêu:* Định dạng tài liệu đẹp mắt để người dùng đọc báo cáo/tài liệu dễ dàng.

#### 2. Markdown Block Parser

- **Tầng Parser (Runtime):**
  - **Bóc tách (Block Extraction):** Hàm [extractBlocksFromMarkdown](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/parser/block-extractor.ts#L9) thực hiện tuần tự:
    1. Gọi [parseMarkdownToRawBlocks](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/parser/markdown-parser.ts#L16) phân đoạn Markdown thô dựa trên chú thích `<!-- block ... -->`.
       - *Mục tiêu:* Chia tách tệp tin Markdown thành các đoạn văn thô dựa trên comment ID block để quản lý cập nhật gia tăng.
    2. Chạy [buildRuntimeBlocks](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/parser/runtime-builder.ts#L188) phân tích cú pháp nội dung bên trong mỗi block để tạo đối tượng `RuntimeBlock`.
       - *Mục tiêu:* Nhận dạng kiểu của khối (Heading, Code, List, v.v.) và chuyển đổi nội dung bên trong thành cấu trúc dữ liệu cụ thể.
    3. Sử dụng [normalizeRuntimeBlocks](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/parser/runtime-normalizer.ts#L7) sắp xếp các mối quan hệ lồng nhau.
       - *Mục tiêu:* Xây dựng liên kết phân cấp cha-con cho các khối có tính lồng ghép như danh sách đa cấp (Lists).
  - **Tuần tự hóa (Serialization):** Hàm [serializeBlocksToMarkdown](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/parser/markdown-parser.ts#L319) duyệt qua mảng `editorBlocks` và ghép nối thuộc tính của chúng thành chuỗi Markdown kèm thẻ comment metadata ngăn cách cấu trúc.
    - *Mục tiêu:* Chuyển đổi ngược dữ liệu khối trong RAM thành chuỗi Markdown chuẩn để ghi xuống ổ đĩa, đảm bảo lưu trữ bảo toàn cấu trúc ID của block.

#### 3. Auto Save

- **Tầng UI (Renderer):** [App.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx) định nghĩa hàm `saveActiveFile`. Khi có sự kiện thay đổi nội dung block trong editor hoặc khi thành phần editor bị mất tiêu điểm (`onBlur`), hàm này chuyển đổi danh sách block thành markdown, chèn frontmatter và gọi [fileService.writeFile(...)](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/file_Service.ts#L43) để ghi xuống ổ đĩa.
  - *Mục tiêu:* Đảm bảo tiến độ công việc của người dùng luôn được sao lưu tự động xuống ổ đĩa vật lý ngầm định, ngăn chặn hoàn toàn việc mất dữ liệu mà không cần phải bấm lưu thủ công.

---

### V. Nhóm tính năng: Knowledge Index & Backlinks

#### 1. Trích xuất liên kết và Metadata

- **Tầng Parser (Runtime):** Khi biên dịch cấu trúc inline qua hàm [tokenizeInlineContent](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/parser/runtime-builder.ts#L24), bộ phân tích sẽ sử dụng Regex để nhận dạng các định dạng:
  - WikiLinks `[[target]]` và Embeds `![[target]]` -> Nạp vào danh sách `references` của khối.
    - *Mục tiêu:* Nhận dạng các liên kết chéo nội bộ giữa các ghi chú để tạo lập các kết nối đồ thị kiến thức.
  - Hashtags `#tag` -> Nạp vào danh sách `tags` của khối.
    - *Mục tiêu:* Thu thập từ khóa phân loại để lập chỉ mục danh sách thẻ tag.
- **Tầng Sync Pipeline (Runtime):** Trong quá trình xử lý của [SyncManager.handleFileChange](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/sync/sync-manager.ts#L32), bộ máy sẽ tính toán đếm số từ `wordCount` (tách theo khoảng trắng của nội dung block) và số ký tự `charCount` (độ dài chuỗi văn bản).
  - *Mục tiêu:* Thống kê dung lượng chữ thời gian thực để cập nhật thông tin tổng quát cho người dùng.

#### 2. Backlinks & Relationships

- **Tầng Chỉ mục Đồ thị (Runtime):**
  - [RelationshipIndex](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/graph/relationship-index.ts#L4) duy trì bản đồ Map `backlinks` ánh xạ một file đích đến tập hợp các file nguồn tham chiếu tới nó.
    - *Mục tiêu:* Lưu giữ các kết nối ngược sẵn trong RAM, giúp truy xuất tức thời các tài liệu tham chiếu tới ghi chú hiện tại mà không phải quét đĩa lặp lại.
  - [KnowledgeQueryEngine](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/graph/knowledge-query-engine.ts#L14) cung cấp hàm [getLinkedMentions](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/graph/knowledge-query-engine.ts#L38) để lọc ra chính xác khối văn bản (`RuntimeBlock`) nào trong file nguồn đang chứa liên kết dẫn đến tệp tin hiện tại.
    - *Mục tiêu:* Trích xuất ngữ cảnh xung quanh liên kết để hiển thị lên Sidebar, giúp người dùng nắm bắt thông tin rõ ràng hơn.
- **Tầng UI (Renderer):** [App.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx) gọi query engine để lấy backlinks và kết xuất chúng lên sidebar bên phải.
  - *Mục tiêu:* Hiển thị trực quan danh sách các liên kết ngược và khối nội dung chứa liên kết đó lên Sidebar phải để người dùng click chuyển vùng nhanh.

#### 3. Đồng bộ Metadata gia tăng (Incremental Sync)

- **Tầng Sync Pipeline (Runtime):** Khi phát hiện tệp tin được cập nhật hoặc tạo mới, [SyncManager](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/sync/sync-manager.ts#L13) chỉ trích xuất thông tin của riêng tệp tin đó rồi chuyển tiếp đến [syncDocumentRuntime](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/sync/runtime-sync.ts#L13).
  - *Mục tiêu:* Tránh phân tích lại toàn bộ các ghi chú trong Vault khi chỉ có một file thay đổi, tiết kiệm tài nguyên CPU.
  - Đăng ký danh sách block mới vào [BlockRegistry](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/store/block-registry.ts#L6).
    - *Mục tiêu:* Cập nhật danh sách các block hợp lệ đang hoạt động trong hệ thống.
  - Giải quyết đường dẫn liên kết tương đối thông qua [resolveLinkPath](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/graph/link-resolver.ts#L7).
    - *Mục tiêu:* Khớp WikiLink với đường dẫn vật lý thực tế trên đĩa (hỗ trợ cả cơ chế tìm kiếm fallback theo tên file nếu không ghi rõ đường dẫn thư mục cha).
  - Xóa các mối liên kết cũ của tệp tin trên [GraphRuntime](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/graph/graph-runtime.ts#L6) và chỉ mục quan hệ [RelationshipIndex](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/graph/relationship-index.ts#L4), sau đó tái tạo lại các cạnh đồ thị mới một cách chính xác và hiệu quả nhất mà không ảnh hưởng tới các file khác.
    - *Mục tiêu:* Loại bỏ sạch các liên kết lỗi thời của file này và cập nhật đồ thị liên kết chính xác theo nội dung mới vừa sửa đổi.

---

### 1. Tầng Giao tiếp Hệ thống & Lưu trữ Vật lý (Main Process & Platform Integration)

Tầng này hoạt động chủ yếu ở môi trường Node.js / Electron Main process để tương tác trực tiếp với hệ điều hành và hệ quản trị cơ sở dữ liệu:

- **Điều hướng & Quản trị Tệp tin**: `main.cjs` đăng ký các IPC handler xử lý vòng đời cửa sổ, nạp cấu hình Vault qua `ElectronStore`, thực hiện các tác vụ tạo, đọc, viết, đổi tên/di chuyển và xóa tệp tin/thư mục vật lý trên đĩa.
  - *Mục tiêu:* Cho phép ứng dụng thao tác trực tiếp với hệ thống tệp tin của hệ điều hành thông qua các hàm an toàn của Node.js (`fs`).
- **Bảo mật & Cầu nối (Context Bridge)**: `preload.cjs` đóng gói các lời gọi IPC thành đối tượng API an toàn (`window.electron`) cung cấp cho Renderer Process.
  - *Mục tiêu:* Thiết lập ranh giới bảo mật cho Renderer, không để lộ các thư viện hệ thống nhạy cảm của Node.js vào trang web HTML của Renderer.
- **Giám sát Tệp tin theo Thời gian thực**: `file_watcher.cjs` và `vault_watcher.cjs` sử dụng thư viện **Chokidar** để phát hiện sự thay đổi trên đĩa và đồng bộ qua sự kiện IPC `vault-tree-changed`.
  - *Mục tiêu:* Tự động hóa việc theo dõi sự thay đổi của file trên ổ đĩa để giao diện UI luôn phản ánh đúng cấu trúc tệp tin hiện hành của hệ điều hành.
- **Lưu trữ & Truy vấn Metadata Caching**: `database_service.cjs` sử dụng **sql.js** (SQLite) để quản lý cơ sở dữ liệu lưu cache siêu dữ liệu của các tài liệu (`documents`), cấu trúc khối (`blocks`), nhãn phân loại (`file_tags`) và bản đồ liên kết (`file_references`).
  - *Mục tiêu:* Cung cấp bộ lưu trữ cache lâu dài trên ổ đĩa giúp khôi phục nhanh trạng thái và lập chỉ mục tìm kiếm văn bản toàn diện mà không cần quét lại toàn bộ thư mục khi khởi động ứng dụng.

### 2. Tầng Phân tích Cú pháp Tài liệu & AST (Lexical Parsing & AST Layer)

Tầng này chịu trách nhiệm phân tích văn bản Markdown thô thành cấu trúc cây cú pháp trừu tượng (AST) ở cấp độ khối (Block) và dòng nội dung (Inline Node):

- **Bộ phân tích Khối Markdown**: `markdown-parser.ts` định nghĩa:
  - `parseMarkdownToRawBlocks`: Trích xuất các block ngăn cách bằng chú thích định danh `<!-- block id="..." -->`.
    - *Mục tiêu:* Tách văn bản Markdown thô thành các mảng block riêng biệt phục vụ cho trình soạn thảo dạng khối.
  - `parseStandardMarkdown`: Phân tích dòng văn bản thô để phân loại các dạng phần tử (Heading, List-item, Quote, Callout, Table, Paragraph).
    - *Mục tiêu:* Xác định chính xác kiểu dữ liệu hiển thị của từng phần tử nội dung Markdown.
  - `serializeBlocksToMarkdown`: Chuyển đổi ngược cấu trúc block AST về định dạng Markdown.
    - *Mục tiêu:* Chuyển đổi dữ liệu đối tượng trong bộ nhớ thành chuỗi Markdown thuần để ghi xuống ổ đĩa.
- **Tokenizer Thực thể Nội tuyến**: Lớp `buildRuntimeBlocks` kết hợp hàm `tokenizeInlineContent` để bóc tách đệ quy các token nội tuyến như WikiLink `[[link]]`, Embed `![[link]]`, Hashtag `#tag`, Bold, Italic và Code.
  - *Mục tiêu:* Định vị và trích xuất các cấu trúc liên kết và thẻ phân loại nằm xen kẽ trong các dòng văn bản.
- **Chuẩn hóa Cấu trúc Phân cấp**: Lớp `normalizeRuntimeBlocks` xây dựng liên kết cha-con (`parentId`, `childrenIds`) cho các khối danh sách lồng nhau dựa trên giải thuật Stack thụt dòng đầu dòng.
  - *Mục tiêu:* Thiết lập chính xác phân cấp cấu trúc cho các danh sách thụt lề nhiều cấp.

### 3. Tầng Đồ thị Tri thức & Chỉ mục Ngữ nghĩa (In-Memory Knowledge Graph & Semantic Indexes)

Tầng này lưu trữ cấu trúc liên kết và hỗ trợ Renderer truy cập nhanh dữ liệu mối quan hệ ngữ nghĩa trong bộ nhớ:

- **Global Block Cache**: Lớp `BlockRegistry` lưu trữ và ánh xạ danh sách các block đang hoạt động theo đường dẫn tệp và định danh duy nhất ID.
  - *Mục tiêu:* Cung cấp kho truy xuất nhanh thông tin của bất kỳ block nào trong hệ thống thông qua ID của nó.
- **Chỉ mục Liên kết Ngược & Nhãn**: Lớp `RelationshipIndex` duy trì bản đồ liên kết hai chiều (Forward References và Backlinks) cùng bản đồ phân bổ nhãn Tag-to-Files.
  - *Mục tiêu:* Hỗ trợ UI truy vấn tức thời danh sách các ghi chú liên quan và các ghi chú chứa thẻ tag cụ thể.
- **Đồ thị Đỉnh-Cạnh (Knowledge Graph)**: Lớp `GraphRuntime` quản lý mô hình đồ thị cấu trúc phẳng liên kết giữa các đỉnh (`document`, `block`, `tag`) thông qua các cạnh tương ứng.
  - *Mục tiêu:* Mô hình hóa toàn bộ mạng lưới ghi chú của Vault thành cấu trúc đồ thị toán học để xử lý các thuật toán liên kết phức tạp.
- **Phân giải đường dẫn**: Hàm `resolveLinkPath` và hàm `parseReferenceTarget` chịu trách nhiệm ánh xạ chính xác đích đến của WikiLink (kể cả Obsidian-style tìm kiếm fallback).
  - *Mục tiêu:* Xác định đúng tệp tin đích khi người dùng chỉ viết tên tệp trong WikiLink mà không ghi rõ đường dẫn đầy đủ.
- **Công cụ Truy vấn Ngữ nghĩa**: Lớp `KnowledgeQueryEngine` cung cấp API Facade cho UI hiển thị danh sách backlinks, các khối chứa liên kết nhắc tới note hiện tại (`LinkedMentions`).
  - *Mục tiêu:* Gom nhóm các hàm truy vấn quan hệ và trích xuất dữ liệu gọn gàng để UI chỉ việc sử dụng để vẽ giao diện.

### 4. Tầng Pipeline Đồng bộ Hóa Dữ liệu (Synchronization & Lifecycle Pipeline)

Tầng này kết nối tầng AST Parsing với tầng Tri thức và Cơ sở dữ liệu để thực hiện cập nhật gia tăng (Incremental Sync):

- **Điều phối Đồng bộ**: Lớp `SyncManager` tiếp nhận nội dung tệp tin thay đổi, tách Frontmatter, gọi parser chuyển đổi sang `RuntimeDocument` và cập nhật chỉ mục.
  - *Mục tiêu:* Làm đầu mối điều khiển luồng cập nhật dữ liệu của tệp tin, đảm bảo quy trình phân tích và cập nhật chỉ mục diễn ra đúng trình tự.
- **Tính toán Diffs Tài liệu**: Hàm `syncDocumentRuntime` so sánh tài liệu cũ và mới thông qua hàm so sánh cấu trúc khối `diffBlocks` và so sánh AST `diffAST` để xác định xem block nào bị xóa, thêm mới, sửa đổi hay dịch chuyển vị trí.
  - *Mục tiêu:* Xác định chính xác các thay đổi cục bộ giữa phiên bản cũ và mới của tài liệu nhằm cập nhật chính xác các sự kiện thay đổi của khối.
- **Hệ thống Sự kiện Khối (Lifecycle Events)**: Lớp `BlockRuntime` là một Pub/Sub emitter để phát các sự kiện thay đổi khối (`created`, `updated`, `deleted`) đến các bên quan tâm.
  - *Mục tiêu:* Thông báo cho các chỉ mục hoặc dịch vụ khác biết khi một khối văn bản cụ thể bị thay đổi để cập nhật trạng thái cache tương ứng.

### 5. Tầng Trình diễn & Ứng dụng (UI Application & Logic boundary)

Tầng hiển thị giao diện và quản lý tương tác người dùng phía Renderer:

- **Điều khiển Luồng & State Giao diện**: File `App.tsx` nắm giữ các trạng thái giao diện chính (danh sách tabs đang mở, cây thư mục, tệp tin hiện tại, thanh sidebar, Toast thông báo) và lắng nghe sự thay đổi tệp tin từ Main Process qua IPC.
  - *Mục tiêu:* Điểm tập trung điều phối toàn bộ trạng thái hoạt động của ứng dụng, lắng nghe sự thay đổi đĩa để cập nhật cây thư mục và tab tương ứng.
- **Trình soạn thảo Khối**: `BlockEditor.tsx` chứa mã nguồn hiển thị văn bản Markdown dưới dạng các phần tử khối có thể kéo thả, chỉnh sửa trực tiếp, hỗ trợ checklist và tự động lưu.
  - *Mục tiêu:* Giao diện soạn thảo WYSIWYG dạng khối trực quan, mang lại trải nghiệm chỉnh sửa hiện đại và nhanh chóng.
- **Cổng Dịch vụ Trung gian**: `file_Service.ts` và `vault_Service.ts` đóng gói các lệnh gọi thông qua đối tượng `window.electron` để làm sạch luồng gọi dịch vụ ở UI.
  - *Mục tiêu:* Cung cấp một tầng giao dịch (Service layer) sạch sẽ cho React UI, giúp tách biệt logic gọi IPC với logic hiển thị giao diện.
