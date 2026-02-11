# 最終修復分析：圖層分割破碎問題

## 問題根源

經過深入分析，發現了導致圖層分割破碎的**關鍵競態條件**：

### 競態條件問題

在 `handleConfirmBrush` 中，狀態更新的順序存在問題：

```javascript
// 原始代碼（有問題）
await handleConfirmBrushInternal((data) => {
  setSegmentedMasks(data.masks || [])
  setCurrentStep(2)
})
// finally 塊中
setIsSegmenting(false)  // ← 這會在狀態更新之前執行！
```

**問題**：
1. `setSegmentedMasks` 和 `setCurrentStep` 是同步調用，但 React 狀態更新是異步的
2. `finally` 塊中的 `setIsSegmenting(false)` 會在 `await` 完成後立即執行
3. 這導致 `useLayerInitialization` 的 useEffect 可能在狀態更新之前就檢查條件
4. 條件檢查：`segmentedMasks.length > 0 && currentStep === 2 && !isSegmenting`
5. 如果 `isSegmenting` 先變成 `false`，但 `segmentedMasks` 和 `currentStep` 還沒更新，條件就不滿足

### 為什麼加入新功能後問題才出現？

1. **狀態更新時機改變**：
   - 新功能要求在分割開始時立即設置 `setCompletedSteps([1, 2])`
   - 這可能觸發更多的 React 重新渲染
   - 導致狀態更新的時機更加敏感

2. **條件渲染改變**：
   - 控制面板和圖層列表的條件渲染 (`layers.length > 0`)
   - 可能導致組件重新掛載/卸載
   - 間接影響了狀態更新的時機

3. **時序問題**：
   - 原本的問題（競態條件）一直存在
   - 但由於狀態更新時機的改變，現在更容易觸發
   - 導致問題變得明顯

## 修復方案

### 修復 1: 確保狀態更新順序

```javascript
await handleConfirmBrushInternal((data) => {
  // 1. 先設置分割結果和當前步驟（在同一個渲染週期中）
  setSegmentedMasks(data.masks || [])
  setCurrentStep(2)
  // 2. 使用 requestAnimationFrame 確保在下一個渲染週期設置 isSegmenting
  // 這樣可以確保 useLayerInitialization 的 useEffect 能正確觸發
  requestAnimationFrame(() => {
    setIsSegmenting(false)
  })
})
```

**為什麼使用 `requestAnimationFrame`**：
- `requestAnimationFrame` 會在瀏覽器下一次重繪之前執行
- 這確保了 React 狀態更新已經完成
- 比 `setTimeout` 更可靠，因為它與瀏覽器的渲染週期同步

### 修復 2: 防止 useEffect 干擾

```javascript
useEffect(() => {
  if (baseImage && imageSize.width > 0 && !isSegmenting && layers.length === 0) {
    setCurrentStep(3)
  }
}, [baseImage, imageSize.width, isSegmenting, layers.length, setCurrentStep])
```

**為什麼添加條件**：
- `!isSegmenting`：防止在分割過程中錯誤地重置 `currentStep`
- `layers.length === 0`：防止在有圖層時錯誤地重置 `currentStep`

### 修復 3: 後端 mask 約束

在 `app.py` 中添加用戶 mask 約束，確保 SAM 預測結果嚴格遵守用戶圈選範圍。

## 測試建議

1. **測試分割流程**：
   - 上傳圖片
   - 圈選物件
   - 點擊"開始分割圖層"
   - 確認分割結果不破碎
   - 確認圖層列表正確顯示

2. **測試狀態更新**：
   - 確認進度條正確顯示
   - 確認 `isSegmenting` 狀態正確更新
   - 確認 `useLayerInitialization` 正確觸發

3. **測試邊界情況**：
   - 快速連續點擊按鈕
   - 在分割過程中上傳新圖片
   - 確認不會出現狀態混亂

## 總結

**根本原因**：React 狀態更新的異步性和批處理特性，導致狀態更新順序不確定，產生競態條件。

**解決方案**：使用 `requestAnimationFrame` 確保狀態更新的正確順序，並添加條件保護防止 useEffect 干擾。
