import { useState, useEffect, useRef } from 'react'

/**
 * 動畫生成提示輸入組件
 * 當用戶點擊圖層時，在被點選的物件右方顯示動作描述輸入框和生成按鈕
 */
function AnimationPrompt({
  selectedLayerIndex,
  selectedLayer,
  layerPosition, // { x, y, width, height } - 圖層在畫布上的位置
  canvasScale,
  onGenerate
}) {
  const [prompt, setPrompt] = useState('')
  const inputRef = useRef(null)

  // 當選中圖層改變時，重置狀態
  useEffect(() => {
    if (selectedLayerIndex !== null) {
      setPrompt('')
      // 自動聚焦輸入框
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
        }
      }, 100)
    }
  }, [selectedLayerIndex])

  // 處理生成按鈕點擊
  const handleGenerate = () => {
    if (!prompt.trim()) {
      alert('請輸入動作描述')
      return
    }

    if (!selectedLayer) {
      alert('請先選擇一個圖層')
      return
    }

    // 目前按鈕還沒功能，先做 UI
    console.log('生成動態影片:', {
      layerIndex: selectedLayerIndex,
      layer: selectedLayer,
      prompt: prompt.trim()
    })
    
    // 如果提供了回調函數，調用它
    if (onGenerate) {
      onGenerate({
        layerIndex: selectedLayerIndex,
        layer: selectedLayer,
        prompt: prompt.trim()
      })
    }
  }

  // 如果沒有選中圖層，不顯示
  if (selectedLayerIndex === null || !selectedLayer) {
    return null
  }

  // 計算輸入框位置（圖層右側）
  const inputBoxStyle = {
    position: 'fixed', // 使用 fixed 以便相對於視窗定位
    left: layerPosition ? `${layerPosition.x + layerPosition.width + 20}px` : '50%',
    top: layerPosition ? `${layerPosition.y}px` : '50%',
    transform: layerPosition ? 'none' : 'translate(-50%, -50%)',
    zIndex: 1000,
    backgroundColor: '#fff',
    border: '2px solid #4a90e2',
    borderRadius: '8px',
    padding: '16px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    minWidth: '300px',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  }

  return (
    <div 
      style={inputBoxStyle}
      onClick={(e) => e.stopPropagation()} // 阻止點擊事件冒泡到畫布
    >
      {/* 標題 */}
      <div>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#333' }}>
          生成動態影片
        </h3>
      </div>

      {/* 圖層信息 */}
      <div style={{ fontSize: '12px', color: '#666', paddingBottom: '8px', borderBottom: '1px solid #e0e0e0' }}>
        圖層: {selectedLayer.name || `圖層 ${selectedLayerIndex + 1}`}
      </div>

      {/* 輸入框 */}
      <div>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#333' }}>
          動作描述（Prompt）
        </label>
        <textarea
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="例如：讓人物跳舞、物體旋轉、角色走動..."
          style={{
            width: '100%',
            minHeight: '80px',
            padding: '10px',
            fontSize: '14px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            resize: 'vertical',
            fontFamily: 'inherit',
            boxSizing: 'border-box'
          }}
          onKeyDown={(e) => {
            // Ctrl/Cmd + Enter 快速生成
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              handleGenerate()
            }
          }}
        />
        <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
          提示：按 Ctrl/Cmd + Enter 快速生成
        </div>
      </div>

      {/* 生成按鈕 */}
      <button
        onClick={handleGenerate}
        disabled={!prompt.trim()}
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          fontWeight: '600',
          backgroundColor: !prompt.trim() ? '#ccc' : '#4a90e2',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: !prompt.trim() ? 'not-allowed' : 'pointer',
          transition: 'background-color 0.2s'
        }}
      >
        生成動態
      </button>
    </div>
  )
}

export default AnimationPrompt
