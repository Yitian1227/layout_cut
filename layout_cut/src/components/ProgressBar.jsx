import React from 'react'

function ProgressBar({ stepNames, currentStep, completedSteps, isSegmenting }) {
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '20px'
    }}>
      {stepNames.map((stepName, index) => {
        const stepNumber = index + 1
        const isCompleted = completedSteps.includes(stepNumber)
        const isCurrent = currentStep === stepNumber
        const isActive = isCurrent || (isCompleted && !isSegmenting)
        // 第二項（圈選物件）在分割時應該顯示為完成
        // 第三項（物件分割）在分割時顯示 loading，不顯示完成狀態
        const showCompleted = isCompleted && !(isSegmenting && index === 2)
        
        return (
          <div key={index} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: showCompleted ? '#4a90e2' : 'transparent',
                  border: showCompleted ? 'none' : '2px solid #b0b0b0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: showCompleted ? 'white' : '#b0b0b0',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}
              >
                {showCompleted ? '✓' : stepNumber}
              </div>
              <div style={{ 
                marginTop: '8px', 
                fontSize: '14px',
                color: isActive ? '#4a90e2' : '#b0b0b0',
                fontWeight: isActive ? 'bold' : 'normal',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                {stepName}
                {/* 第三項（物件分割）在分割時顯示 loading */}
                {isSegmenting && index === 2 && (
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid #4a90e2',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }}
                  />
                )}
              </div>
            </div>
            {index < stepNames.length - 1 && (
              <div
                style={{
                  width: '80px',
                  height: '2px',
                  backgroundColor: completedSteps.includes(stepNumber + 1) ? '#4a90e2' : '#e0e0e0',
                  margin: '0 10px',
                  marginTop: '-20px'
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default ProgressBar
