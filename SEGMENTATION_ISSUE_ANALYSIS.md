# 圖層分割破碎問題分析報告

## 問題描述
圖層分割後出現破碎（holes、fragmentation）的問題。

## 可能原因分析

### 1. **缺少用戶 Mask 邊界約束** ⚠️ 主要問題
**位置**: `app.py` 第 385-451 行

**問題**:
- SAM 預測後，沒有使用用戶原始圈選的 mask 作為約束
- SAM 可能會預測出超出用戶圈選範圍的區域
- 預測結果可能包含用戶未圈選的部分

**當前代碼**:
```python
# 執行預測後直接進行形態學處理
masks, scores, logits = predictor.predict(...)
best_mask = masks[best_mask_idx]
best_mask_binary = (best_mask > 0).astype(np.uint8) * 255
# 沒有使用 resized_mask 或 binary_mask 進行約束
```

**建議修復**:
- 在 SAM 預測後，立即使用 `cv2.bitwise_and()` 與用戶原始 mask (`resized_mask`) 進行交集運算
- 確保預測結果嚴格限制在用戶圈選範圍內

---

### 2. **形態學處理參數可能不夠強** ⚠️ 次要問題
**位置**: `app.py` 第 408-426 行

**當前參數**:
- CLOSE: kernel 7x7, iterations=2
- OPEN: kernel 3x3, iterations=1
- CLOSE (二次): kernel 5x5, iterations=1
- medianBlur: 3x3

**問題**:
- 對於較大的孔洞，7x7 kernel 可能不夠
- OPEN 操作可能過於激進，去除了一些有效區域
- resize 後的處理 kernel 3x3 可能太小

**建議**:
- 增加 CLOSE 的 kernel 大小或 iterations
- 調整 OPEN 的參數，避免過度去除
- resize 後使用更大的 kernel 進行處理

---

### 3. **Resize 操作可能引入破碎** ⚠️ 次要問題
**位置**: `app.py` 第 430-435 行

**問題**:
- 從低分辨率 (1024x1024) resize 回原始尺寸時，可能引入新的小洞
- INTER_NEAREST 插值雖然保持二值特性，但可能產生不連續區域

**當前處理**:
- resize 後有輕微的形態學處理（kernel 3x3），但可能不夠

**建議**:
- resize 後使用更強的形態學處理
- 考慮使用 GaussianBlur + threshold 來平滑邊緣

---

### 4. **缺少連通組件檢查** ⚠️ 次要問題
**位置**: 無

**問題**:
- 沒有檢查 mask 是否有多個分離的區域
- 沒有確保 mask 是連通的
- 可能保留了一些小的孤立區域

**建議**:
- 使用 `cv2.connectedComponents()` 檢查連通組件
- 只保留最大的連通組件
- 填充小洞（使用 `cv2.floodFill()` 或形態學操作）

---

### 5. **SAM 預測參數** ℹ️ 參考
**位置**: `app.py` 第 386-392 行

**當前設置**:
- `multimask_output=True` - 獲取多個候選 mask
- 選擇分數最高的 mask

**問題**:
- 分數最高的 mask 不一定是最完整的
- 可能需要考慮 mask 的面積或完整性

**建議**:
- 可以考慮選擇面積最大的 mask（如果分數相近）
- 或者結合分數和面積來選擇最佳 mask

---

## 修復優先級

1. **高優先級**: 添加用戶 mask 邊界約束（使用 `cv2.bitwise_and()`）
2. **中優先級**: 增強形態學處理參數
3. **中優先級**: resize 後加強處理
4. **低優先級**: 添加連通組件檢查

---

## 建議的修復代碼位置

在 `app.py` 第 400-428 行之間，SAM 預測後立即添加：

```python
# 1. 立即使用用戶 mask 約束預測結果
best_mask_binary = cv2.bitwise_and(best_mask_binary, resized_mask)

# 2. 增強形態學處理
# 3. resize 後加強處理
# 4. 可選：連通組件檢查
```
