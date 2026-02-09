import React from 'react'

function SegmentedPreview({ segmentedMasks, currentStep }) {
  if (currentStep !== 2 || segmentedMasks.length === 0) return null

  return (
    <div style={{ 
      marginTop: '30px',
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '16px'
    }}>
      {segmentedMasks.map((maskData, index) => {
        // 兼容新舊格式：如果是對象則使用 image 屬性，否則直接使用
        const maskSrc = typeof maskData === 'string' ? maskData : maskData.image
        return (
          <img
            key={index}
            src={maskSrc}
            alt={`Segmented Mask ${index + 1}`}
            style={{
              width: '100%',
              aspectRatio: '1',
              objectFit: 'contain',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              backgroundColor: '#f5f5f5'
            }}
          />
        )
      })}
    </div>
  )
}

export default SegmentedPreview
