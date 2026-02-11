# 圖層分割破碎問題全面修復分析

## 發現的所有問題

### 問題 1: useEffect 依賴項不穩定導致重複執行 ⚠️ **已修復**

**位置**: `useLayerInitialization.js`

**問題**:
- `layerManagement` 對象在每次渲染時都會創建新的引用
- `imageSize` 對象也可能不穩定
- 這導致 `useEffect` 的依賴項每次都是新的，觸發不必要的重新執行
- 可能導致圖層初始化邏輯被多次執行，造成狀態混亂

**修復**:
1. 使用 `useRef` 來追蹤是否已經初始化，防止重複執行
2. 使用 `useRef` 來存儲最新的 `layerManagement`，避免依賴項變化導致重複執行
3. 移除 `layerManagement` 和 `setCompletedSteps` 從依賴項
4. 只依賴 `imageSize.width` 和 `imageSize.height`，而不是整個 `imageSize` 對象

### 問題 2: 狀態更新順序導致的競態條件 ⚠️ **已修復**

**位置**: `App.jsx` `handleConfirmBrush`

**問題**:
- `setIsSegmenting(false)` 在 `finally` 塊中立即執行
- 可能導致 `useLayerInitialization` 的 useEffect 在狀態更新之前就檢查條件
- 條件檢查：`segmentedMasks.length > 0 && currentStep === 2 && !isSegmenting`

**修復**:
- 使用 `requestAnimationFrame` 確保 `setIsSegmenting(false)` 在狀態更新之後執行

### 問題 3: useEffect 在分割過程中干擾流程 ⚠️ **已修復**

**位置**: `App.jsx` 第 108-116 行

**問題**:
- `useEffect` 會在 `baseImage` 或 `imageSize.width` 改變時觸發
- 可能在分割過程中錯誤地重置 `currentStep`

**修復**:
- 添加 `!isSegmenting && layers.length === 0` 條件保護

### 問題 4: 後端缺少用戶 mask 約束 ⚠️ **已修復**

**位置**: `app.py` SAM 預測後處理

**問題**:
- SAM 預測後沒有使用用戶原始 mask 約束預測結果
- 形態學處理可能進一步擴大範圍

**修復**:
- 在關鍵位置添加 `cv2.bitwise_and` 約束

## 為什麼加入新功能後問題才出現？

1. **狀態更新時機改變**：
   - 新功能要求在分割開始時立即設置 `setCompletedSteps([1, 2])`
   - 這可能觸發更多的 React 重新渲染
   - 導致 `layerManagement` 對象引用更頻繁地變化
   - 觸發 `useLayerInitialization` 的 `useEffect` 重複執行

2. **條件渲染改變**：
   - 控制面板和圖層列表的條件渲染 (`layers.length > 0`)
   - 可能導致組件重新掛載/卸載
   - 間接影響了狀態更新的時機

3. **時序問題**：
   - 原本的問題（依賴項不穩定、競態條件）一直存在
   - 但由於狀態更新時機的改變，現在更容易觸發
   - 導致問題變得明顯

## 修復總結

### 前端修復：
1. ✅ 修復 `useLayerInitialization` 的依賴項不穩定問題
2. ✅ 添加 `hasInitializedRef` 防止重複執行
3. ✅ 使用 `layerManagementRef` 避免依賴項變化
4. ✅ 修復狀態更新順序的競態條件
5. ✅ 防止 useEffect 在分割過程中干擾流程

### 後端修復：
1. ✅ 添加用戶 mask 約束，確保 SAM 預測結果嚴格遵守用戶圈選範圍
2. ✅ 在每個形態學處理步驟後都添加約束

## 測試建議

1. **測試分割流程**：
   - 上傳圖片
   - 圈選物件
   - 點擊"開始分割圖層"
   - 確認分割結果不破碎
   - 確認圖層列表正確顯示
   - 確認不會重複初始化

2. **測試狀態更新**：
   - 確認進度條正確顯示
   - 確認 `isSegmenting` 狀態正確更新
   - 確認 `useLayerInitialization` 只執行一次

3. **測試邊界情況**：
   - 快速連續點擊按鈕
   - 在分割過程中上傳新圖片
   - 確認不會出現狀態混亂

## 關鍵修復點

**最重要的修復**：使用 `useRef` 來防止 `useLayerInitialization` 重複執行。這是導致圖層分割破碎的主要原因，因為重複執行會導致狀態混亂，進而影響分割結果的顯示。
