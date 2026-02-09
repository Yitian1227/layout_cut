import React from 'react'

function ControlPanel({
  selectedLayers,
  selectedLayerIndex,
  layers,
  onMergeLayers,
  onScaleLayer,
  onRotateLayer,
  onToggleLayerVisible,
  onDeleteLayer
}) {
  return (
    <div style={{
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      padding: '15px',
      backgroundColor: '#fff',
      flexShrink: 0
    }}>
      <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '18px', color: '#333' }}>
        控制面板
      </h3>
      
      {/* 合併按鈕 */}
      {selectedLayers.length >= 2 && (
        <button
          onClick={onMergeLayers}
          style={{
            width: '100%',
            padding: '8px',
            marginBottom: '15px',
            backgroundColor: '#4a90e2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          合併選中圖層 ({selectedLayers.length})
        </button>
      )}
      
      {/* 選中圖層的控制 */}
      {selectedLayerIndex !== null && layers[selectedLayerIndex] && (
        <div style={{
          padding: '10px',
          marginBottom: '10px',
          border: '1px solid #4a90e2',
          borderRadius: '4px',
          backgroundColor: '#f0f8ff'
        }}>
          <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '14px', color: '#333' }}>
            圖層 {selectedLayerIndex + 1} 控制
          </div>
          
          {/* 縮放控制 */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', marginBottom: '5px', color: '#333' }}>
              縮放: {((layers[selectedLayerIndex].scaleX || 1) * 100).toFixed(0)}%
            </div>
            <div style={{ display: 'flex', gap: '5px' }}>
              <button
                onClick={() => onScaleLayer(selectedLayerIndex, -0.1)}
                style={{
                  flex: 1,
                  padding: '4px',
                  fontSize: '12px',
                  backgroundColor: '#4a90e2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                -10%
              </button>
              <button
                onClick={() => onScaleLayer(selectedLayerIndex, 0.1)}
                style={{
                  flex: 1,
                  padding: '4px',
                  fontSize: '12px',
                  backgroundColor: '#4a90e2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                +10%
              </button>
            </div>
          </div>
          
          {/* 旋轉控制 */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', marginBottom: '5px', color: '#333' }}>
              旋轉: {(layers[selectedLayerIndex].rotation || 0).toFixed(0)}°
            </div>
            <div style={{ display: 'flex', gap: '5px' }}>
              <button
                onClick={() => onRotateLayer(selectedLayerIndex, -15)}
                style={{
                  flex: 1,
                  padding: '4px',
                  fontSize: '12px',
                  backgroundColor: '#4a90e2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                -15°
              </button>
              <button
                onClick={() => onRotateLayer(selectedLayerIndex, 15)}
                style={{
                  flex: 1,
                  padding: '4px',
                  fontSize: '12px',
                  backgroundColor: '#4a90e2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                +15°
              </button>
            </div>
          </div>
          
          {/* 顯示/隱藏和刪除按鈕 */}
          <div style={{ display: 'flex', gap: '5px' }}>
            <button
              onClick={() => onToggleLayerVisible(selectedLayerIndex)}
              style={{
                flex: 1,
                padding: '6px',
                fontSize: '12px',
                backgroundColor: layers[selectedLayerIndex].visible ? '#4caf50' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              {layers[selectedLayerIndex].visible ? '顯示' : '隱藏'}
            </button>
            <button
              onClick={() => onDeleteLayer(selectedLayerIndex)}
              style={{
                flex: 1,
                padding: '6px',
                fontSize: '12px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              刪除
            </button>
          </div>
        </div>
      )}
      
      {/* 未選中圖層時的提示 */}
      {selectedLayerIndex === null && selectedLayers.length === 0 && (
        <div style={{ 
          padding: '10px', 
          fontSize: '12px', 
          color: '#888', 
          textAlign: 'center',
          fontStyle: 'italic'
        }}>
          請選擇圖層以進行操作
        </div>
      )}
    </div>
  )
}

export default ControlPanel
