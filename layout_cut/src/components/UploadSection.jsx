import React from 'react'

function UploadSection({ baseImage, fileInputRef, onImageUpload, onButtonClick, currentStep }) {
  return (
    <>
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={onImageUpload}
        style={{ display: 'none' }}
      />
      <button onClick={onButtonClick}>
        {baseImage ? '替換圖片' : '新增圖片'}
      </button>
      {/* 圖片預覽（在 step 1-2 時顯示，step 3 時不顯示因為畫布上已有） */}
      {baseImage && currentStep !== 3 && (
        <div style={{ marginTop: '20px' }}>
          <img 
            src={baseImage} 
            alt="Base Image Preview" 
            style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px' }}
          />
        </div>
      )}
    </>
  )
}

export default UploadSection
