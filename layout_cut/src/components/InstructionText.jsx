import React from 'react'

function InstructionText({ currentStep, baseImage, segmentedMasks }) {
  // 在上傳完圖片後的畫面（step 3 且有圖片但還沒有分割結果）
  if (currentStep === 3 && baseImage && segmentedMasks.length === 0) {
    return (
      <div style={{
        padding: '15px',
        flexShrink: 0
      }}>
        <div style={{
          fontSize: '14px',
          color: '#333',
          lineHeight: '1.6',
          textAlign: 'left',
          backgroundColor: '#fff',
          padding: '12px 16px',
          borderRadius: '4px',
          border: '1px solid #e0e0e0'
        }}>
          <div style={{ marginBottom: '6px' }}>
            1. 請使用紅色畫筆 圈選欲分割出的圖層
          </div>
          <div>
            2. 按下開始分割按鈕
          </div>
        </div>
      </div>
    )
  }

  // 其他情況暫時不顯示文字
  return null
}

export default InstructionText
