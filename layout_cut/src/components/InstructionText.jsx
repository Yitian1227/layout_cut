import React from 'react'

function InstructionText({ currentStep, baseImage, segmentedMasks }) {
  // 在上傳完圖片後的畫面（step 3 且有圖片但還沒有分割結果）
  if (currentStep === 3 && baseImage && segmentedMasks.length === 0) {
    return (
      <div style={{
        marginLeft: '320px', // 與 KonvaCanvas 左側對齊（為左側面板留出空間）
        padding: '20px',
        paddingTop: '10px',
        paddingBottom: '10px'
      }}>
        <div style={{
          fontSize: '16px',
          color: '#fff',
          lineHeight: '1.6',
          textAlign: 'left'
        }}>
          <div style={{ marginBottom: '8px' }}>
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
