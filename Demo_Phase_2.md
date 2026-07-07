# Kịch Bản Thuyết Trình Demo Phase 2 - Tích Hợp Đối Chiếu Mã Nguồn

Tài liệu này cung cấp kịch bản thuyết trình (speech guide) chi tiết cho Phase 2, tích hợp đầy đủ việc đối chiếu và liên kết trực tiếp tới các file mã nguồn tương ứng trong hệ thống. Kịch bản được thiết kế giúp người nghe dễ dàng liên kết giữa hành vi giao diện bên ngoài và kiến trúc runtime bên dưới.

---

## Phần 1: Parser Runtime - Phân tích Markdown và Xây dựng cấu trúc dữ liệu

### 1. Thao tác trên giao diện (UI Show & Tell)

> **Lời thoại gợi ý:**  

> _"Chào mọi người, trong Demo Phase 2 này chúng ta sẽ đi sâu vào kiến trúc Runtime đứng sau vận hành các tính năng mạng lưới kiến thức của ứng dụng. Bắt đầu với tầng Parser Runtime. Khi một file Markdown thô được mở ra hoặc sửa đổi, hệ thống cần phải hiểu và phân tách nó thành các khối dữ liệu có cấu trúc. Các bạn có thể thấy trên màn hình: một ghi chú Markdown chứa các Heading, Paragraph, List lồng nhau, Quote và Code block đã được phân tích và hiển thị thành một cây Runtime Document thống nhất..."_

### 2. Đối chiếu mã nguồn (Code Walkthrough)

> **Lời thoại gợi ý:**  

> _"Bộ máy Parser của chúng ta thực hiện điều này qua một pipeline phối hợp chặt chẽ. Đầu tiên, hàm [parseMarkdownToRawBlocks](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/parser/markdown-parser.ts#L16-L111) sẽ phân tích văn bản Markdown dựa trên các **comment phân tách khối `<!-- block id="..." -->`**. Nếu không tìm thấy comment, hàm [parseStandardMarkdown](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/parser/markdown-parser.ts#L116-L314) đóng vai trò dự phòng để quét dòng-by-dòng với Regex, tự động nhận diện Heading, Quote, Table, Code Block..."_

>

> _"Sau khi có các block thô, hàm [normalizeRuntimeBlocks](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/parser/runtime-normalizer.ts#L7-L50) sử dụng thuật toán Stack để xác định mức độ thụt lề (indentation level) và tự động xây dựng liên kết cha-con (`parentId`, `childrenIds`) cho các khối danh sách lồng nhau. Điều này giúp Editor và các thành phần khác có thể tương tác trực tiếp trên một cấu trúc cây hoàn chỉnh thay vì văn bản thuần."_

>

> _"Để định danh duy nhất cho từng block bất kể nội dung hay vị trí thay đổi, hàm [generateBlockId](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/utils/id-generator.ts#L5-L20) sử dụng giải thuật băm FNV-1a 32-bit mã hóa từ đường dẫn file, vị trí tương đối và nội dung khối để sinh ra một ID ổn định có định dạng `block://<hash>`."_

>

> _"Ở cấp độ nội dung văn bản trong block, hàm [tokenizeInlineContent](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/parser/runtime-builder.ts#L24-L162) thực hiện bóc tách đệ quy các phần tử nội dòng như WikiLink `[[link]]`, Embed `![[link]]`, Hashtag `#tag`, Bold, Italic... để tạo thành cây AST inline phong phú."_

>

> _"Tất cả các bước trên được kết nối hoàn chỉnh thông qua đầu nối [extractBlocksFromMarkdown](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/parser/block-extractor.ts#L9-L13) để xuất ra mảng các đối tượng `RuntimeBlock` đã được chuẩn hóa và lồng ghép cây quan hệ."_

---

## Phần 2: Knowledge Runtime - Phân giải liên kết và Xây dựng đồ thị tri thức

### 1. Thao tác trên giao diện (UI Show & Tell)

> **Lời thoại gợi ý:**  

> _"Tiếp theo là phần cốt lõi của ứng dụng - Knowledge Runtime. Khi chúng ta tạo các WikiLink hay Hashtags, hệ thống ngay lập tức ghi nhận các mối liên hệ này. Nếu tôi chuyển sang tab của một ghi chú khác, các bạn có thể thấy ở mục **Backlinks** góc phải hiển thị toàn bộ những tài liệu đang liên kết đến ghi chú hiện tại kèm theo trích dẫn ngữ cảnh (Linked Mentions). Ngoài ra, chúng ta còn có thể hiển thị Đồ thị kiến thức (Knowledge Graph) tương tác kết nối giữa các document, tag và block dưới dạng các đỉnh và cạnh trực quan để thấy mạng lưới liên kết thông tin."_

### 2. Đối chiếu mã nguồn (Code Walkthrough)

> **Lời thoại gợi ý:**  

> _"Để duy trì mạng lưới tri thức này trong RAM, chúng tôi sử dụng lớp [RelationshipIndex](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/graph/relationship-index.ts#L4-L141). Khi một file thay đổi, hàm [registerFileRelations](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/graph/relationship-index.ts#L32-L65) sẽ dọn dẹp các liên kết cũ và cập nhật các liên kết mới vào cấu trúc Map `backlinks` (Map đích -> các nguồn) và `forwardReferences` (Map nguồn -> các đích)."_

>

> _"Các metadata và tag được bóc tách từ cây AST inline thông qua hàm [extractMetadataFromInlineNodes](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/parser/runtime-builder.ts#L164-L183). Để liên kết hoạt động chính xác, hàm [resolveLinkPath](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/graph/link-resolver.ts#L7-L46) và [parseReferenceTarget](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/graph/reference-extractor.ts#L12-L25) sẽ thực hiện phân giải đường dẫn từ tên ghi chú thô về đường dẫn vật lý thực tế trên Workspace, hỗ trợ cả cơ chế tìm kiếm fallback kiểu Obsidian và bóc tách phần neo block-ref `#^id`."_

>

> _"Mô hình đồ thị kiến thức được vận hành bởi [GraphRuntime](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/graph/graph-runtime.ts#L6-L86), quản lý việc thêm/bớt các Node và Edge đại diện cho document, block hay tag (`addNode`, `addEdge`, `removeNode`, `removeEdge`)."_

>

> _"Cuối cùng, lớp [KnowledgeQueryEngine](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/graph/knowledge-query-engine.ts#L14-L77) chịu trách nhiệm cung cấp các API truy vấn backlinks và linked mentions như [getBacklinks](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/graph/knowledge-query-engine.ts#L31-L33) và [getLinkedMentions](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/graph/knowledge-query-engine.ts#L38-L61) để phục vụ cho việc render giao diện sidebar bên phải."_

---

## Phần 3: Runtime Store - Quản lý bộ nhớ đệm (Cache) & SQLite Sync

### 1. Thao tác trên giao diện (UI Show & Tell)

> **Lời thoại gợi ý:**  

> _"Để hệ thống luôn mượt mà và hoạt động tức thì ngay cả khi Workspace có hàng ngàn tệp tin, Runtime Store đóng vai trò quản lý lưu trữ tốc độ cao trên bộ nhớ RAM kết hợp với Database SQLite cục bộ. Các bạn có thể thấy khi tôi chuyển đổi qua lại giữa các file hoặc thực hiện tìm kiếm, thông tin được trả về lập tức. Kể cả khi tôi tắt ứng dụng đi và mở lại, toàn bộ cấu trúc sơ đồ liên kết được khôi phục ngay lập tức mà không cần phân tích lại từ đầu."_

### 2. Đối chiếu mã nguồn (Code Walkthrough)

> **Lời thoại gợi ý:**  

> _"Về mặt kiến trúc, lớp **[BlockRegistry](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/store/block-registry.ts#L6-L97) (`src/runtime/store/block-registry.ts`, dòng 6–97)** duy trì một Map `blocks` cho phép lấy thông tin của bất kỳ block nào theo ID với độ phức tạp O(1) qua hàm **[getBlock](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/store/block-registry.ts#L56-L58) (`src/runtime/store/block-registry.ts`, dòng 56–58)**. Các thông tin liên kết và đồ thị cũng được giữ trong RAM thông qua `RelationshipIndex` và `GraphRuntime` để truy vấn thời gian thực."_
>
> _"Để đồng bộ bền vững xuống ổ đĩa, module **[database_service.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/database_service.cjs#L71-L120) (`database_service.cjs`, dòng 71–120)** sử dụng SQLite (thông qua sql.js) để lưu trữ cấu trúc khối (`blocks`), metadata tài liệu (`documents`), nhãn (`file_tags`) và liên kết vào tệp tin `.module-test/metadata.db` ngay trong thư mục ẩn của Vault."_
>
> _"Quá trình đọc/ghi dữ liệu này được thực thi ngầm qua các IPC handler trong **[main.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/main.cjs#L400-L417) (`main.cjs`, dòng 400–417)** như `sqlite-load-cache` và `sqlite-save-document` để tải cache lúc khởi động và lưu trữ tức thì bất kỳ khi nào có thay đổi."_

---

## Phần 4: Runtime Synchronization - Theo dõi thay đổi & Đồng bộ hóa gia tăng

### 1. Thao tác trên giao diện (UI Show & Tell)

> **Lời thoại gợi ý:**  

> _"Bây giờ, tôi sẽ thử chỉnh sửa nội dung tài liệu. Khi tôi thay đổi nội dung của một block trong ghi chú, các bạn hãy chú ý đến Sidebar và Graph: các Backlinks và các mối quan hệ trên đồ thị liên quan được cập nhật lại chính xác. Thậm chí nếu tôi ra ngoài Windows Explorer và sửa đổi file Markdown bằng một trình soạn thảo khác, hệ thống vẫn tự động phát hiện và cập nhật dữ liệu Runtime tương ứng."_

### 2. Đối chiếu mã nguồn (Code Walkthrough)

> **Lời thoại gợi ý:**  

> _"Bí quyết nằm ở cơ chế đồng bộ hóa gia tăng. Khi file trên đĩa thay đổi, **[file_watcher.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/file_watcher.cjs#L7-L46) (`file_watcher.cjs`, dòng 7–46)** sử dụng Chokidar để giám sát và bắn sự kiện qua IPC. Sự kiện này được tiếp nhận bởi lớp **[SyncManager](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/sync/sync-manager.ts#L13-L163) (`src/runtime/sync/sync-manager.ts`, dòng 13–163)**, đóng vai trò nhạc trưởng điều phối toàn bộ quy trình đồng bộ."_
>
> _"Tại đây, hàm **[diffAST](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/sync/ast-diff.ts#L12-L51) (`src/runtime/sync/ast-diff.ts`, dòng 12–51)** sẽ so sánh cấu trúc AST giữa phiên bản cũ và mới để xem có sự tương đương hay không. Sau đó, hàm **[diffBlocks](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/sync/block-diff.ts#L13-L70) (`src/runtime/sync/block-diff.ts`, dòng 13–70)** so sánh tập hợp các block ID để xác định chính xác block nào mới được tạo (`added`), bị xóa (`removed`), cập nhật nội dung (`updated`), hay bị dịch chuyển vị trí/quan hệ cha-con (`moved`)."_
>
> _"Sau khi tính toán được phần thay đổi, lớp **[SyncManager](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/sync/sync-manager.ts#L13-L163) (`src/runtime/sync/sync-manager.ts`, dòng 13–163)** gọi hàm **[syncDocumentRuntime](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/sync/runtime-sync.ts#L13-L132) (`src/runtime/sync/runtime-sync.ts`, dòng 13–132)** để chỉ cập nhật Registry, Graph và Relationship Index của riêng file đó."_
>
> _"Cuối cùng, lớp **[BlockRuntime](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/store/block-runtime.ts#L12-L59) (`src/runtime/store/block-runtime.ts`, dòng 12–59)** hoạt động như một Pub/Sub emitter bắn các sự kiện lifecycle (`created`, `updated`, `deleted`) đến các component UI để cập nhật giao diện hiển thị ngay lập tức."_

---

## Phần 5: Block Editing & Rendering Runtime - Soạn thảo & Kết xuất hiển thị tương tác

### 1. Thao tác trên giao diện (UI Show & Tell)

> **Lời thoại gợi ý:**  

> _"Tiếp theo là phần giao diện tương tác người dùng. Trình soạn thảo của chúng ta cho phép chỉnh sửa từng khối văn bản một cách độc lập. Tôi có thể dễ dàng dùng chuột để kéo thả (Drag-and-Drop) thay đổi thứ tự các khối, nhấn Tab để thụt đầu dòng (Indent) hoặc Shift+Tab để lồi dòng (Outdent) danh sách. Khi tôi nhập WikiLink đến một ghi chú không tồn tại, nó sẽ có màu đỏ; nếu ghi chú tồn tại, nó sẽ có màu xanh và cho phép click để chuyển trang. Đặc biệt, với cú pháp nhúng ghi chú, nội dung của ghi chú con được render trực quan đệ quy trực tiếp bên trong ghi chú cha."_

### 2. Đối chiếu mã nguồn (Code Walkthrough)

> **Lời thoại gợi ý:**  

> _"Phần tương tác soạn thảo và kéo thả này được điều phối trong component React **[BlockEditor.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/components/BlockEditor.tsx#L603-L750) (`src/components/BlockEditor.tsx`, dòng 603–750)**. Khi người dùng kéo thả hoặc thay đổi thụt dòng, cấu trúc cây trong `RuntimeBlock` của tài liệu được cập nhật lại."_
>
> _"Khi lưu file, hàm **[serializeBlocksToMarkdown](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/parser/markdown-parser.ts#L319-L348) (`src/runtime/parser/markdown-parser.ts`, dòng 319–348)** chuyển đổi mảng các block ngược lại thành chuỗi Markdown tiêu chuẩn có kèm comment metadata rồi gọi qua lớp **[file_Service.ts](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/file_Service.ts#L43-L50) (`src/file_Service.ts`, dòng 43–50)** (`writeFile`) để ghi xuống đĩa, đồng thời gọi hàm **[SyncManager.getInstance().handleFileChange](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/sync/sync-manager.ts#L32) (`src/runtime/sync/sync-manager.ts`, dòng 32)** để đồng bộ hóa lập tức các cấu trúc mới vào cache."_
>
> _"Cơ chế render tương tác nằm trong component **[RenderParsedBlock](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/components/BlockEditor.tsx#L117-L203) (`src/components/BlockEditor.tsx`, dòng 117–203)**. Nó duyệt qua các inline nodes để render WikiLinks (tự động phân giải link qua hàm **[resolveLinkPath](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/graph/link-resolver.ts#L7-L46) (`src/runtime/graph/link-resolver.ts`, dòng 7–46)** để kiểm tra sự tồn tại và gắn class CSS tương ứng), nhúng ghi chú đệ quy qua component `EmbeddedNoteView`, và render Hashtag có gắn sự kiện click để nhảy nhanh đến nhãn tương ứng."_

---

## Phần 6: Runtime Type System - Cấu trúc kiểu dữ liệu thống nhất

### 1. Thiết kế hệ thống (System Design Overview)

> **Lời thoại gợi ý:**  

> _"Cuối cùng, để toàn bộ các module và layer từ tầng xử lý I/O hệ thống (Main Process), phân tích cú pháp (Parser), quản lý đồ thị (Graph) cho tới tầng giao diện người dùng (Renderer React) có thể giao tiếp một cách chặt chẽ, nhất quán và không xảy ra lỗi sai lệch kiểu dữ liệu, chúng tôi thiết lập một hệ thống kiểu dữ liệu thống nhất."_

### 2. Đối chiếu mã nguồn (Code Walkthrough)

> **Lời thoại gợi ý:**  

> _"Toàn bộ cấu trúc kiểu dữ liệu tĩnh được định nghĩa trong **[runtime-types.ts](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/types/runtime-types.ts) (`src/runtime/types/runtime-types.ts`)**. Chúng ta có:"_
>
> - _Interface **[RuntimeDocument](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/types/runtime-types.ts#L50-L59) (`src/runtime/types/runtime-types.ts`, dòng 50–59)** lưu giữ thông tin đường dẫn, tiêu đề, danh sách các block, nhãn tag và frontmatter properties._
> - _Interface **[RuntimeBlock](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/types/runtime-types.ts#L38-L48) (`src/runtime/types/runtime-types.ts`, dòng 38–48)** mô tả ID, kiểu block (paragraph, list-item, heading...), mức độ lồng nhau, nội dung thô và các metadata liên quan._
> - _Interface **[InlineNode](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/types/runtime-types.ts#L20-L25) (`src/runtime/types/runtime-types.ts`, dòng 20–25)** mô tả các phần tử con đệ quy trong văn bản._
> - _Interface **[GraphNode và GraphEdge](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/types/runtime-types.ts#L61-L73) (`src/runtime/types/runtime-types.ts`, dòng 61–73)** định nghĩa cấu trúc đỉnh và cạnh cho đồ thị kiến thức._

>

> _"Nhờ hệ thống kiểu dữ liệu tĩnh này, việc bảo trì và nâng cấp các tính năng của ứng dụng ở cả frontend và backend trở nên cực kỳ an toàn và tin cậy."_
