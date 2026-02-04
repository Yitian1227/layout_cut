### 基礎工具安裝

- **Node.js**
  - 推薦版本：LTS 20.x 或 22.x
  - 下載：https://nodejs.org
  - 安裝後驗證：`node -v` 和 `npm -v`
  - 注意：安裝時勾選「Add to PATH」

- **Python**
  - 推薦版本：3.10 或 3.11
  - 下載：https://www.python.org
  - 安裝後驗證：`python --version`
  - 注意：安裝時勾選「Add Python to PATH」

- **Git**
  - 下載：https://git-scm.com 或用 winget
  - 驗證：`git --version`

------------------------------------------------------------------------------
### 前端套件安裝（npm）

在專案根目錄（有 `package.json` 的資料夾）執行以下安裝指令。
如果都還沒有的話
建立Vite + React 專案:
   -安裝指令: `npm create vite@latest frontend -- --template react`
   -版本驗證: 就會出現標準結構目錄 frontend 可以改成自己的專案資料夾名稱
   `cd frontend`
   `npm install`

- **vite**
  - 套件功能：Vite 核心，提供快速熱重載與生產打包
  - 安裝指令：`npm install -D vite @vitejs/plugin-react`
  - 版本驗證：`npm list vite`

- **@vitejs/plugin-react**（Vite 的 React 插件）
  - 套件功能：讓 Vite 支援 React 的 JSX 轉譯、Fast Refresh 等功能
  - 安裝指令：`npm install -D @vitejs/plugin-react`
  - 版本驗證：`npm list @vitejs/plugin-react`

- **react, react-dom**
  - 套件功能：React 核心庫
  - 安裝指令：`npm install react react-dom`
  - 版本驗證：`npm list react`

- **konva**
  - 套件功能：2D Canvas 繪圖庫
  - 安裝指令：`npm install konva`
  - 版本驗證：`npm list konva`

- **react-konva**
  - 套件功能：將 Konva 元件包裝成 React 元件（<Stage>、<Layer>、<Image> 等）
  - 安裝指令：`npm install react-konva`
  - 版本驗證：`npm list react-konva`
  - 注意：版本需與 react 相容（推薦使用 18.x 系列，避免 React 19 衝突）

- **use-image**
  - 套件功能：方便載入圖片到 Konva
  - 安裝指令：`npm install use-image`
  - 版本驗證：`npm list use-image`

------------------------------------------------------------------------------
### 後端套件安裝（pip）

先啟動虛擬環境避免套件和其他專案套件衝突
#先cd到專案目錄，有app.py的地方
`C:\Users\User\Desktop\layout_cut`
# 建立虛擬環境
`python -m venv venv`
# 啟動虛擬環境（Windows）
`.\venv\Scripts\activate`

- **fastapi**
  - 套件功能：Web API 框架
  - 安裝指令：`pip install fastapi`
  - 版本驗證：`pip show fastapi`

- **uvicorn**
  - 套件功能：ASGI 伺服器
  - 安裝指令：`pip install uvicorn`
  - 版本驗證：`pip show uvicorn`

- **python-multipart**
  - 套件功能：支援檔案上傳
  - 安裝指令：`pip install python-multipart`
  - 版本驗證：`pip show python-multipart`

- **pillow**
  - 套件功能：圖片處理
  - 安裝指令：`pip install pillow`
  - 版本驗證：`pip show pillow`

- **numpy**
  - 套件功能：陣列處理
  - 安裝指令：`pip install numpy`
  - 版本驗證：`pip show numpy`

- **opencv-python-headless**
  - 套件功能：影像處理
  - 安裝指令：`pip install opencv-python-headless`
  - 版本驗證：`pip show opencv-python-headless`

- **torch (CPU版)**
  - 套件功能：深度學習框架
  - 安裝指令：`pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu`
  - 版本驗證：`pip show torch`

- **segment-anything**
  - 套件功能：SAM 模型
  - 安裝指令：`pip install git+https://github.com/facebookresearch/segment-anything.git`
  - 版本驗證：`pip show segment-anything`

------------------------------------------------------------------------------
### 程式運行
開啟兩個終端機

開啟後端:
`C:\Users\User\Desktop\layout_cut` 先cd到專案目錄，有app.py的地方
`.\venv\Scripts\activate` 啟動虛擬環境，如啟動成功，會出現(venv)開頭
`uvicorn app:app --reload --port 8000`

開啟前端:
`cd C:\Users\User\Desktop\layout_cut\layout_cut` 先cd到具有package.json檔案的子資料夾
`npm run dev`
如啟動成功會出現: ➜  Local:   http://localhost:xxxx/