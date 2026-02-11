# 圖層分割破碎問題根本原因分析

## 問題描述
在加入三個新功能後，圖層分割結果出現破碎問題。

## 發現的兩個關鍵問題

### 問題 1: useEffect 在分割過程中干擾流程 ⚠️ **已修復**

**位置**: `App.jsx` 第 108-113 行

**問題**:
```javascript
// 圖片載入完成後，立即進入畫布模式
useEffect(() => {
  if (baseImage && imageSize.width > 0) {
    setCurrentStep(3)  // ← 這會在分割過程中錯誤地重置 currentStep
  }
}, [baseImage, imageSize.width, setCurrentStep])
```

**影響**:
1. 在 `handleConfirmBrush` 中設置 `setCurrentStep(2)` 後
2. 如果 `baseImage` 或 `imageSize.width` 有任何變化（可能是由於狀態更新導致的重新渲染）
3. 這個 useEffect 會被觸發，將 `currentStep` 設置為 3
4. 這會干擾分割流程，導致 `useLayerInitialization` 無法正確執行

**修復**:
```javascript
// 圖片載入完成後，立即進入畫布模式
// 但不要在分割過程中干擾流程（當 isSegmenting 為 true 時不執行）
useEffect(() => {
  if (baseImage && imageSize.width > 0 && !isSegmenting && layers.length === 0) {
    // 只有在沒有圖層且不在分割中時，才自動進入畫布模式
    // 這可以防止在分割過程中錯誤地重置 currentStep
    setCurrentStep(3)
  }
}, [baseImage, imageSize.width, isSegmenting, layers.length, setCurrentStep])
```

### 問題 2: 後端缺少用戶 mask 約束 ⚠️ **已修復**

**位置**: `app.py` SAM 預測後處理

**問題**:
- SAM 預測後沒有使用用戶原始 mask (`resized_mask`) 約束預測結果
- 形態學處理可能進一步擴大範圍
- 導致預測結果超出用戶圈選範圍，造成破碎

**修復**:
- 在 SAM 預測後立即使用 `cv2.bitwise_and` 約束
- 在每個形態學處理步驟後都添加約束
- 確保最終結果嚴格遵守用戶圈選範圍

## 為什麼加入新功能後問題才出現？

### 原因分析：

1. **狀態更新時機改變**:
   - 新功能要求在分割開始時立即設置 `setCompletedSteps([1, 2])`
   - 這可能觸發了更多的 React 重新渲染
   - 導致 `baseImage` 或 `imageSize.width` 的依賴項 useEffect 被觸發

2. **條件渲染改變**:
   - 控制面板和圖層列表的條件渲染 (`layers.length > 0`)
   - 可能導致組件重新掛載/卸載
   - 間接影響了狀態更新的時機

3. **時序問題**:
   - 原本的問題（useEffect 干擾）一直存在
   - 但由於狀態更新時機的改變，現在更容易觸發
   - 導致問題變得明顯

## 修復總結

### 前端修復：
1. ✅ 修復 `useEffect` 在分割過程中干擾流程的問題
2. ✅ 添加 `!isSegmenting && layers.length === 0` 條件保護

### 後端修復：
1. ✅ 添加用戶 mask 約束，確保 SAM 預測結果嚴格遵守用戶圈選範圍
2. ✅ 在每個形態學處理步驟後都添加約束

## 測試建議

1. **測試分割流程**:
   - 上傳圖片
   - 圈選物件
   - 點擊"開始分割圖層"
   - 確認分割結果不破碎

2. **測試狀態更新**:
   - 確認進度條正確顯示
   - 確認圖層列表正確顯示
   - 確認控制面板正確顯示

3. **測試邊界情況**:
   - 快速連續點擊按鈕
   - 在分割過程中上傳新圖片
   - 確認不會出現狀態混亂
