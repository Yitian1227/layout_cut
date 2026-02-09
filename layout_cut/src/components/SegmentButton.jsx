import React from 'react'

function SegmentButton({ baseImage, isSegmenting, hasSegmentedMasks, onSegment }) {
  if (!baseImage) return null

  return (
    <div style={{ marginTop: '20px' }}>
      <button 
        onClick={onSegment}
        disabled={isSegmenting}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: isSegmenting ? '#ccc' : '#4a90e2',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: isSegmenting ? 'not-allowed' : 'pointer'
        }}
      >
        {isSegmenting ? '分割中...' : (hasSegmentedMasks ? '重新進行分割圖層' : '開始分割圖層')}
      </button>
    </div>
  )
}

export default SegmentButton
