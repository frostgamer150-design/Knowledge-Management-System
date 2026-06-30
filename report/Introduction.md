## 1.1 Context & Motivation

In the digital age, individuals process a large amount of information daily. Traditional document-based note-taking systems mainly rely on rigid folder structures, making it difficult to connect ideas and manage knowledge effectively over time.

Modern Personal Knowledge Management (PKM) approaches focus on interconnected knowledge through features such as bi-directional linking, block-based editing, and knowledge graphs. However, many existing solutions depend heavily on cloud ecosystems, limit data ownership, or lack flexibility in organizing reusable information.

This project aims to develop a desktop-based PKM application that helps users build a “second brain,” where information is interconnected, reusable, and fully controlled by the user.

---

## 1.2 Problem Statement

Despite the popularity of modern note-taking applications, several limitations remain:

- Rigid folder structures limit the discovery of relationships between ideas.
- Many systems lack effective bi-directional linking and backlinking.
- Notes are often treated as large static documents instead of reusable blocks.
- Search systems usually provide only basic keyword matching without advanced querying capabilities.
- Vendor lock-in restricts portability and ownership of personal data.
- Cloud-dependent systems may reduce privacy and offline accessibility.

These issues make long-term knowledge management and information retrieval more difficult.

---

## 1.3 Proposed Solution & Objectives

This project proposes a desktop-based PKM application built on **Block-based** and **Local-first** principles.

The system uses plain Markdown files as the single source of truth, ensuring portability and full user ownership of data. Notes are organized into reusable and interconnected blocks that support linking, embedding, and hierarchical structures.

Core features include:

- Real-time file explorer
- Markdown block editor
- Bi-directional linking and backlinks
- Advanced search and query system
- Knowledge graph visualization
- Properties and metadata management
- Template and daily note workflows

The objectives of the project are:

- To provide a flexible block-based note-taking experience
- To support interconnected knowledge organization
- To improve information retrieval through advanced search and metadata queries
- To ensure portability and user ownership through local-first architecture and Markdown storage
- To provide a scalable foundation for future PKM features and semantic knowledge exploration

# Technologies  

| Thành phần              | Công nghệ đề xuất                  | Lý do                                       |
| ----------------------- | ---------------------------------- | ------------------------------------------- |
| **Framework**           | Electron.js + React                | Desktop app, truy cập file system trực tiếp |
| **Editor**              | ProseMirror hoặc TipTap            | Block-based, extensible, hỗ trợ `[[link]]`  |
| **Database (Index)**    | better-sqlite3                     | SQLite nhẹ, đồng bộ, phù hợp với kiến trúc  |
| **Graph Visualization** | Cytoscape.js hoặc D3.js            | Force-directed graph, dễ tích hợp           |
| **Markdown Parser**     | unified + remark                   | Parse → AST, chuẩn công nghiệp              |
| **State Management**    | Zustand                            | Nhẹ, đơn giản hơn Redux                     |
| **Styling**             | CSS Modules + custom design system | Kiểm soát tốt                               |

Analysis
## 1.4 Analysis

The proposed system adopts a **Local-first** and **Block-based** architecture to address the limitations of traditional note-taking applications. By using plain Markdown files as the primary data source, the system ensures portability, transparency, and long-term accessibility of user data without dependence on proprietary cloud services.

The application separates responsibilities into multiple core components, including file management, block editing, indexing, search, and graph visualization. A lightweight SQLite indexing layer is used to improve the performance of backlink retrieval, metadata querying, and full-text search while preserving Markdown files as the single source of truth.

The block-based structure enables reusable and hierarchical content organization, allowing users to manipulate information more flexibly compared to traditional document-oriented systems. In addition, bi-directional linking and graph visualization enhance knowledge discovery by exposing relationships between notes and ideas.

From a technical perspective, the combination of Electron.js, React, SQLite, and Markdown processing libraries provides a scalable foundation for building a cross-platform desktop PKM application with extensible future features such as semantic search, query engines, and AI-assisted knowledge organization.