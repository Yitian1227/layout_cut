import React from 'react'

function UploadSection({
  baseImage,
  fileInputRef,
  onImageUpload,
  onButtonClick,
  currentStep
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      minHeight: '400px'
    }}>
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={onImageUpload}
        style={{ display: 'none' }}
      />
      <button 
        onClick={onButtonClick}
        style={{
          padding: '12px 24px',
          fontSize: '16px',
          backgroundColor: '#4a90e2',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: '500',
          transition: 'background-color 0.2s'
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = '#357abd'
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = '#4a90e2'
        }}
      >
        {baseImage ? '替換圖片' : '新增圖片'}
      </button>
      
      {baseImage && (
        <div style={{
          marginTop: '20px',
          maxWidth: '100%',
          textAlign: 'center'
        }}>
          <img 
            src={baseImage} 
            alt="預覽" 
            style={{
              maxWidth: '100%',
              maxHeight: '400px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
          />
        </div>
      )}
    </div>
  )
}

export default UploadSection
