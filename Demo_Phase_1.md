# Kịch Bản Thuyết Trình Demo Phase 1 - Tích Hợp Đối Chiếu Mã Nguồn

Tài liệu này được thiết kế như một kịch bản nói (speech guide) tự nhiên giúp bạn vừa trình diễn ứng dụng vừa nhấp mở trực tiếp các đoạn code tương ứng để thuyết minh mục tiêu thiết kế và luồng dữ liệu cho người nghe.

---

## Phần 1: Khởi động - Mở và Đóng Vault

### 1. Thao tác trên giao diện (UI Show & Tell)

> **Lời thoại gợi ý:**  
> _"Chào mọi người, tôi xin phép bắt đầu phần demo ứng dụng. Như các bạn đang thấy trên màn hình, khi ứng dụng được mở lên lần đầu hoặc khi tôi nhấn vào nút chọn Vault, một hộp thoại hệ thống sẽ xuất hiện. Tôi sẽ chọn thư mục dự án của mình làm Vault làm việc. Ngay lập tức, giao diện File Explorer ở sidebar bên trái được cập nhật và hiển thị toàn bộ cây thư mục..."_

### 2. Đối chiếu mã nguồn (Code Walkthrough)

> **Lời thoại gợi ý:**  
> _"Để giải thích cho luồng hoạt động này, chúng ta hãy cùng lần theo hành trình của một yêu cầu tải và khởi tạo Vault, đi từ tương tác trên giao diện cho đến tệp tin cơ sở dữ liệu vật lý ở hệ thống phía sau:"_
>
> _"Đầu tiên, khi tôi click vào nút chọn Vault được định nghĩa tại **file [App.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx#L1626-L1679) ở dòng 1626 đến 1679**, sự kiện `onClick` lập tức kích hoạt và gọi hàm xử lý **[handleSelectVault](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx#L596-L611) ở dòng 596**. Tại đây, để giữ cho code giao diện luôn tinh gọn, tôi không xử lý logic trực tiếp mà gọi qua hàm **[selectVaultDir](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/vault_Service.ts#L16-L23) trong file [vault_Service.ts](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/vault_Service.ts#L16-L23) từ dòng 16 đến 23** ở tầng Service."_
>
> _"Hàm này tiếp tục gọi qua API của Electron. Để tuân thủ đúng chuẩn bảo mật của Electron, Renderer không can thiệp trực tiếp vào hệ thống mà đi qua cầu nối Context Bridge được khai báo trong **[preload.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/preload.cjs#L10) ở dòng 10** để gửi tín hiệu `ipcRenderer.invoke` với kênh `select-vault-dir` sang Main Process."_
>
> _"Tại Main Process, **file [main.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/main.cjs#L199-L219) từ dòng 199 đến 219** sẽ đón nhận tín hiệu này để mở hộp thoại chuẩn của hệ điều hành, ghi nhớ đường dẫn Vault, và gọi hàm **[initDatabase](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/database_service.cjs#L9-L35) trong file [database_service.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/database_service.cjs#L9-L35) từ dòng 9 đến 35** để nạp tệp SQLite cục bộ ẩn (`metadata.db`) ngay trong Vault nhằm cô lập dữ liệu và tăng tốc truy vấn."_
>
> _"Khi Main Process hoàn thành và phản hồi đường dẫn Vault qua IPC, Promise ở Renderer được giải quyết. Lúc này, hàm **handleSelectVault** sẽ gọi hàm **[loadVaultInfo](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx#L248-L258) ở dòng 248** để cập nhật thông tin cấu hình và hàm **[loadTree](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx#L373-L380) ở dòng 373** để đọc cây thư mục mới. Trạng thái React thay đổi lập tức kích hoạt re-render để hiển thị cây thư mục mới lên Sidebar bên trái."_
>
> _"Cuối cùng, ứng dụng sẽ chạy hàm quét ngầm **[initialVaultScan](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx#L184-L246) ở dòng 184 trong file [App.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx#L184-L246)** để khôi phục đồ thị liên kết kiến thức. Nhờ tệp SQLite Cache cục bộ vừa được nạp, hệ thống chỉ cần so sánh thông số thời gian cập nhật và kích thước file để nạp thẳng các tệp tin chưa thay đổi vào RAM mà không phải đọc lại từ đầu, giúp ứng dụng sẵn sàng làm việc lập tức."_

---

## Phần 2: Quét cây thư mục đệ quy & Đồng bộ hóa thời gian thực

### 2. Đối chiếu mã nguồn (Code Walkthrough)

> **Lời thoại gợi ý:**  
> _"Để giải thích cho luồng quét và đồng bộ thư mục thời gian thực, chúng ta sẽ xem cách cây thư mục được tải lên và cơ chế tự động cập nhật khi có thay đổi trên đĩa:"_
>
> _"Trước hết, để vẽ nên cây thư mục ban đầu, hệ thống thực hiện quét đĩa đệ quy thông qua hàm **[readDirectoryRecursive](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/main.cjs#L90-L124) trong file [main.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/main.cjs#L90-L124) từ dòng 90 đến 124**, tự động lọc bỏ các thư mục ẩn bắt đầu bằng dấu chấm như `.git` hay `.module-test` để giữ giao diện gọn gàng."_
>
> _"Để theo dõi các thay đổi tiếp theo từ bên ngoài đĩa, hệ thống thực hiện kích hoạt bộ giám sát tệp tin Watcher (Trigger) tại hai thời điểm: một là khi cửa sổ tải giao diện thành công thông qua hàm **[startVaultWatch](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/main.cjs#L149) ở dòng 149 của file [main.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/main.cjs#L149)**; hai là khi chuyển đổi sang một Vault mới thông qua hàm **[handleVaultChange](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/vault_watcher.cjs#L9-L15) từ dòng 9 đến 15 trong file [vault_watcher.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/vault_watcher.cjs#L9-L15)** để giải phóng watcher cũ và theo dõi thư mục mới."_
>
> _"Lúc này, nỗ lực tạo, xóa, hoặc sửa đổi file ngoài Windows Explorer sẽ được bộ giám sát tệp tin phát hiện. Bộ watcher này sử dụng thư viện Chokidar và được triển khai trong hàm **[startFileWatch](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/file_watcher.cjs#L7-L46) từ dòng 7 đến 46 trong file [file_watcher.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/file_watcher.cjs#L7-L46)**. Khi phát hiện bất kỳ thao tác tạo, sửa, hoặc xóa file nào ngoài đĩa, nó sẽ bỏ qua các file ẩn và lập tức bắn tín hiệu `vault-tree-changed` qua IPC bridge về Renderer."_
>
> _"Tại Renderer, hàm hook **[useEffect](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx#L288-L332) từ dòng 288 đến 332 trong file [App.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx#L288-L332)** sẽ tiếp nhận tín hiệu này. Nếu có file Markdown được tạo hoặc sửa đổi, Renderer sẽ đọc file, đưa nội dung qua lớp quản lý **[SyncManager](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/sync/sync-manager.ts#L32)** để trích xuất liên kết rồi cập nhật bộ đệm SQLite. Đặc biệt, nếu tệp tin bị tác động chính là ghi chú đang mở, giao diện Editor cũng sẽ tự động làm mới nội dung theo thời gian thực."_

---

## Phần 3: Thao tác tệp vật lý (CRUD) & Kéo thả (Drag & Drop)

### 1. Thao tác trên giao diện (UI Show & Tell)

> **Lời thoại gợi ý:**  
> _"Ngay trên giao diện cây thư mục, tôi có thể click chuột phải để thực hiện các thao tác nhanh như tạo file mới, tạo thư mục mới, đổi tên hoặc xóa vĩnh viễn tệp tin. Ngoài ra, thay vì nhấp chuột phải để di chuyển file, tôi cũng có thể nhấp giữ chuột và kéo thả tệp tin này trực tiếp vào một thư mục khác. Cây thư mục sẽ tự động cập nhật vị trí mới."_

### 2. Đối chiếu mã nguồn (Code Walkthrough)

> **Lời thoại gợi ý:**  
> _"Để trả lời cho câu hỏi: 'Sau khi người dùng nhấn nút hoặc kéo thả một tệp trên giao diện thì chuyện gì xảy ra dưới hệ thống?', chúng ta sẽ cùng lần theo hành trình dữ liệu đi từ tương tác của người dùng cho đến khi giao diện được cập nhật lại tự động:"_
>
> _"Đầu tiên, khi người dùng thao tác menu chuột phải hoặc kéo giữ và thả một thư mục/tệp tin, tầng giao diện React trong **file [App.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx#L988-L1011) (`src/App.tsx`, dòng 988–1011)** sẽ bắt lấy sự kiện để kích hoạt menu chuột phải, và **file [App.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx#L383-L475) (`src/App.tsx`, dòng 383–475)** sẽ đón nhận sự kiện kéo thả `onDrop` để xác định đường dẫn tương đối."_
>
> _"Để thực hiện hành động, Renderer không gọi trực tiếp API hệ thống mà thông qua lớp Service **[file_Service.ts](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/file_Service.ts#L16-L68) (`src/file_Service.ts`, dòng 16–68)** để gửi tín hiệu xuống Main Process. Lớp này đóng gói và che giấu toàn bộ chi tiết liên lạc IPC của Electron khỏi mã nguồn của tầng Renderer."_
>
> _"Tại Main Process, **file [main.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/main.cjs#L252-L365) (`main.cjs`, dòng 252–365)** tiếp nhận tin nhắn IPC này để trực tiếp thực hiện I/O vật lý xuống hệ điều hành thông qua các hàm Node.js như `fs.writeFileSync`, `fs.mkdirSync` hoặc `fs.rmSync`. Đặc biệt đối với hành động đổi tên hoặc di chuyển tệp (`fs.renameSync`), Main Process sẽ kích hoạt giải thuật kiểm tra trùng lặp để tự động sinh tên dự phòng dạng `(1)`, `(2)`, tránh ghi đè dữ liệu cũ."_
>
> _"Ngay khi ổ đĩa thay đổi vật lý, bộ giám sát Chokidar ngầm chạy trong **file [file_watcher.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/file_watcher.cjs#L7-L46) (`file_watcher.cjs`, dòng 7–46)** sẽ tự động phát hiện sự kiện và phát tín hiệu `vault-tree-changed` qua IPC bridge về phía Renderer."_
>
> _"Cuối cùng, Renderer đón nhận sự kiện, tự động cập nhật lại state cây thư mục để React re-render giao diện mới nhất. Đồng thời, Renderer chuyển dữ liệu nội dung file mới qua lớp quản lý **[SyncManager](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/sync/sync-manager.ts#L32) (`src/runtime/sync/sync-manager.ts`, dòng 32–101)** để cập nhật lại chỉ mục liên kết ngược và đồ thị kiến thức trong RAM một cách nhất quán."_

---

## Phần 4: Quản lý Workspace & Tabs

### 1. Thao tác trên giao diện (UI Show & Tell)

> **Lời thoại gợi ý:**  
> _"Khi tôi nhấp đúp vào nhiều tệp tin Markdown khác nhau, các bạn có thể thấy hệ thống Workspace mở ra các Tab công tác riêng biệt ở panel trung tâm. Tôi có thể dễ dàng click chuyển đổi qua lại giữa các tab để làm việc mà không làm gián đoạn trạng thái soạn thảo. Tệp tin nào đang được mở trong tab hiện hành cũng sẽ được làm nổi bật (highlight) trên Sidebar trái giúp tôi dễ nhận biết."_

### 2. Đối chiếu mã nguồn (Code Walkthrough)

> **Lời thoại gợi ý:**  
> _"Để làm được điều này, giao diện React trong **file [App.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx#L111-L112) (`src/App.tsx`, dòng 111–112)** duy trì hai trạng thái quan trọng trong state: mảng `openTabs` lưu trữ danh sách các tab đang hoạt động và biến `activeTabPath` chỉ định đường dẫn của tab hiện tại."_
>
> _"Khi hiển thị cây thư mục, hệ thống so sánh thuộc tính đường dẫn của từng node với biến `activeTabPath` (`src/App.tsx`, dòng 112). Nếu trùng khớp, lớp CSS highlight sẽ lập tức được kích hoạt để đánh dấu tệp tin đang hoạt động."_
>
> _"Hệ thống quản lý tab này còn được đồng bộ chặt chẽ với Watcher: khi một file bị đổi tên hoặc xóa vật lý ngoài đĩa, tab tương ứng sẽ tự động cập nhật lại tiêu đề mới hoặc đóng lại ngay lập tức mà người dùng không gặp bất kỳ lỗi hiển thị nào."_

---

## Phần 5: Soạn thảo WYSIWYG theo khối (Block Editor) & Bộ Parser Markdown

### 1. Thao tác trên giao diện (UI Show & Tell)

> **Lời thoại gợi ý:**  
> _"Bây giờ, chúng ta hãy chuyển sang phần soạn thảo văn bản. Editor của ứng dụng hoạt động theo cơ chế dạng khối (Block Editor) tương tự như Notion. Khi tôi click vào một dòng, nó là một khối độc lập và tôi có thể sửa đổi. Đặc biệt, khi tôi chuyển sang chế độ 'Preview Mode', tài liệu Markdown thô ban đầu sẽ lập tức được kết xuất thành giao diện hiển thị tĩnh đẹp mắt."_
>
> _"Khi tôi soạn thảo xong và click ra ngoài hoặc chuyển tab, hệ thống sẽ tự động lưu lại các thay đổi xuống đĩa mà tôi không cần phải ấn tổ hợp phím Ctrl + S."_

### 2. Đối chiếu mã nguồn (Code Walkthrough)

> **Lời thoại gợi ý:**  
> _"Chúng tôi xây dựng Trình soạn thảo khối trực quan này trong component **[BlockEditor.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/components/BlockEditor.tsx) (`src/components/BlockEditor.tsx`, dòng 387)**."_
>
> _"Về mặt xử lý dữ liệu, khi một tệp Markdown được tải lên, nó đi qua bộ bóc tách khối **[block-extractor.ts](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/parser/block-extractor.ts#L9-L13) (`src/runtime/parser/block-extractor.ts`, dòng 9–13)**. Hàm `extractBlocksFromMarkdown` sẽ phối hợp với parser chính trong **[markdown-parser.ts](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/parser/markdown-parser.ts#L16-L111) (`src/runtime/parser/markdown-parser.ts`, dòng 16–111)** để phân tích tệp Markdown thô thành mảng các đối tượng `RuntimeBlock` dựa trên các chỉ dẫn comment ID `<!-- block id="..." -->`."_
>
> _"Ngược lại, khi lưu dữ liệu xuống ổ đĩa, hàm `serializeBlocksToMarkdown` (trong `src/runtime/parser/markdown-parser.ts`, dòng 319–348) sẽ tuần tự hóa các đối tượng khối này thành chuỗi văn bản Markdown chuẩn kèm comment metadata để bảo toàn ID block cho các phiên làm việc sau."_
>
> _"Luồng tự động lưu (Auto Save) được kích hoạt thông qua hàm **[saveCurrentFile](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx#L614-L663) (`src/App.tsx`, dòng 614–663)**. Mỗi khi người dùng chỉnh sửa nội dung hoặc khi Editor bị mất tiêu điểm (`onBlur`), hàm này lập tức dịch chuyển cấu trúc khối thành Markdown và lưu xuống đĩa ngầm định, giúp bảo vệ dữ liệu người dùng tối đa."_

---

## Phần 6: Đồ thị kiến thức, WikiLinks & Backlinks

### 1. Thao tác trên giao diện (UI Show & Tell)

> **Lời thoại gợi ý:**  
> _"Cuối cùng, tôi xin giới thiệu tính năng cốt lõi: kết nối mạng lưới kiến thức phi tuyến tính. Tôi sẽ viết cú pháp liên kết WikiLink `[[Tên trang khác]]` hoặc gắn thẻ tag `#du_an` ngay trong nội dung của ghi chú hiện tại."_
>
> _"Bây giờ, khi tôi mở ghi chú đích được liên kết đến đó, các bạn hãy quan sát Sidebar bên phải. Trong mục **Backlinks**, chúng ta thấy rõ tên ghi chú nguồn kèm theo **chính xác khối văn bản chứa liên kết đó** dưới dạng ngữ cảnh trích dẫn (Linked Mentions). Tôi chỉ cần click vào dòng trích dẫn đó, ứng dụng sẽ ngay lập tức mở và điều hướng tôi quay trở lại ghi chú nguồn."_

### 2. Đối chiếu mã nguồn (Code Walkthrough)

> **Lời thoại gợi ý:**  
> _"Để hiện thực hóa tính năng liên kết mạng lưới này, bộ máy parser của chúng tôi chạy hàm **[tokenizeInlineContent](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/parser/runtime-builder.ts#L24-L162) (`src/runtime/parser/runtime-builder.ts`, dòng 24–162)** để dùng Regex trích xuất các WikiLinks và Tags khi phân tích nội dung block."_
>
> _"Khi có thay đổi, lớp **[SyncManager](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/sync/sync-manager.ts#L32-L101) (`src/runtime/sync/sync-manager.ts`, dòng 32–101)** sẽ bắt đầu quy trình đồng bộ gia tăng cục bộ bằng cách gọi hàm **[syncDocumentRuntime](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/sync/runtime-sync.ts#L13-L131) (`src/runtime/sync/runtime-sync.ts`, dòng 13–131)** để chỉ cập nhật đồ thị kiến thức của riêng file đó, tránh việc phải dựng lại toàn bộ đồ thị gây chậm ứng dụng."_
>
> _"Đồ thị liên kết trong RAM được quản trị bởi hai lớp:"_
>
> 1. _Lớp **[RelationshipIndex](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/graph/relationship-index.ts#L4-L141) (`src/runtime/graph/relationship-index.ts`, dòng 4–141)** chịu trách nhiệm lưu trữ ánh xạ hai chiều giữa các tài liệu._
> 2. _Lớp **[GraphRuntime](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/graph/graph-runtime.ts#L6-L86) (`src/runtime/graph/graph-runtime.ts`, dòng 6–86)** đóng vai trò quản lý các kết nối đỉnh và cạnh đồ thị._
>
> _"Khi người dùng mở một trang, tầng giao diện trong **[App.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx#L1311-L1311) (`src/App.tsx`, dòng 1311)** sẽ yêu cầu lớp **[knowledge-query-engine.ts](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/graph/knowledge-query-engine.ts#L38-L61) (`src/runtime/graph/knowledge-query-engine.ts`, dòng 38–61)** thực thi hàm `getLinkedMentions` để tìm ra tất cả các khối văn bản cụ thể đang liên kết tới ghi chú hiện hành và render chúng lên thanh sidebar bên phải một cách nhanh chóng."_
