import React from 'react'

function LayerList({ 
  layers, 
  selectedLayerIndex, 
  selectedLayers, 
  hoveredLayerIndex, 
  onLayerClick,
  layerItemRefs 
}) {
  return (
    <div 
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        padding: '15px',
        backgroundColor: '#fff',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden'
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '18px', color: '#333' }}>
        圖層列表 (共{layers.length}張)
      </h3>
    
      {layers.map((layer, index) => {
        const isSelected = selectedLayerIndex === index || selectedLayers.includes(index)
        const isHovered = hoveredLayerIndex === index
        
        // 確保引用數組有足夠的長度
        if (!layerItemRefs.current[index]) {
          layerItemRefs.current[index] = { current: null }
        }
        
        return (
          <div
            key={layer.id}
            ref={(el) => {
              if (layerItemRefs.current[index]) {
                layerItemRefs.current[index].current = el
              }
            }}
            className={isHovered ? 'hovered' : ''}
            style={{
              padding: '10px',
              marginBottom: '8px',
              border: isSelected ? '2px solid #4a90e2' : (isHovered ? '2px solid #ffc107' : '1px solid #e0e0e0'),
              borderRadius: '4px',
              backgroundColor: isSelected ? '#e3f2fd' : (isHovered ? '#fff9c4' : '#f9f9f9'),
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              position: 'relative'
            }}
            onClick={(e) => onLayerClick(index, e)}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img 
                src={layer.src} 
                className="thumbnail" 
                alt={`圖層 ${index + 1}`}
                style={{
                  width: '60px',
                  height: '60px',
                  objectFit: 'contain',
                  border: isSelected ? '2px solid #4a90e2' : '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: '#fff',
                  padding: '2px',
                  opacity: layer.visible ? 1 : 0.3
                }}
              />
            </div>
            {!layer.visible && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: '12px',
                color: '#f44336',
                fontWeight: 'bold',
                pointerEvents: 'none',
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                padding: '2px 6px',
                borderRadius: '3px'
              }}>
                隱藏
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default LayerList
