import React from 'react'

function SegmentButton({ baseImage, isSegmenting, hasSegmentedMasks, hasBrushPath, onSegment }) {
  if (!baseImage) return null

  // 檢查是否應該禁用按鈕：正在分割中，或者沒有圈選範圍
  const isDisabled = isSegmenting || !hasBrushPath

  return (
    <div style={{ marginTop: '20px' }}>
      <button 
        onClick={onSegment}
        disabled={isDisabled}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: isDisabled ? '#ccc' : '#4a90e2',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          position: 'relative'
        }}
        title={!hasBrushPath && !isSegmenting ? '需先用滑鼠圈選想分割的物件歐!' : ''}
      >
        {isSegmenting ? '分割中...' : (hasSegmentedMasks ? '重新進行分割圖層' : '開始分割圖層')}
      </button>
      {!hasBrushPath && !isSegmenting && (
        <div style={{
          marginTop: '8px',
          fontSize: '12px',
          color: '#ff6b6b',
          textAlign: 'center'
        }}>
          需先用滑鼠圈選想分割的物件歐!
        </div>
      )}
    </div>
  )
}

export default SegmentButton
