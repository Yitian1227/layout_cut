import React from 'react'
import ControlPanel from './ControlPanel'
import LayerList from './LayerList/LayerList'
import InstructionText from './InstructionText'
import BrushTool from './BrushTool'
import SegmentButton from './SegmentButton'
import '../App.css'

function LeftSidebar({
  baseImage,
  fileInputRef,
  onImageUpload,
  onButtonClick,
  layers,
  selectedLayerIndex,
  selectedLayers,
  hoveredLayerIndex,
  layerItemRefs,
  onLayerClick,
  onMergeLayers,
  onScaleLayer,
  onRotateLayer,
  onToggleLayerVisible,
  onDeleteLayer,
  onBackToSelection,
  currentStep,
  segmentedMasks,
  interactionMode,
  onToggleMode,
  hasAutoMasks,
  isBrushMode,
  toolType,
  onSetToolType,
  brushMode,
  onSetBrushMode,
  brushSize,
  onBrushSizeChange,
  onConfirmBrush,
  hasBrushPath,
  isSegmenting
}) {
  return (
    <div 
      className="left-sidebar-scroll"
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: '320px',
        height: '100vh', // 等同於視窗高度
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        padding: 0,
        backgroundColor: '#f5f5f5',
        borderRight: '1px solid #e0e0e0',
        overflowY: 'auto',
        overflowX: 'hidden',
        zIndex: 10
      }}
    >
      {/* 替換圖片按鈕 - 最上方 */}
      <div style={{
        padding: '16px',
        backgroundColor: '#fff',
        borderBottom: '1px solid #e0e0e0',
        flexShrink: 0
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
            width: '100%',
            padding: '8px 16px',
            fontSize: '14px',
            backgroundColor: '#4a90e2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          {baseImage ? '替換圖片' : '新增圖片'}
        </button>
      </div>

      {/* 控制面板 - 只在圖層分割完成後顯示 */}
      {layers.length > 0 && (
        <div style={{ padding: '15px', flexShrink: 0 }}>
          <button
            onClick={onBackToSelection}
            style={{
              width: '100%',
              padding: '8px 12px',
              marginBottom: '10px',
              fontSize: '13px',
              backgroundColor: '#ffedd5',
              color: '#9a3412',
              border: '1px solid #fdba74',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            重新選擇物件 (Back to Selection)
          </button>
          <ControlPanel
            selectedLayers={selectedLayers}
            selectedLayerIndex={selectedLayerIndex}
            layers={layers}
            onMergeLayers={onMergeLayers}
            onScaleLayer={onScaleLayer}
            onRotateLayer={onRotateLayer}
            onToggleLayerVisible={onToggleLayerVisible}
            onDeleteLayer={onDeleteLayer}
          />
        </div>
      )}

      {/* 說明文字 - 置於控制面板下方，圖層列表上方 */}
      <InstructionText
        currentStep={currentStep}
        baseImage={baseImage}
        segmentedMasks={segmentedMasks}
      />

      {/* 模式切換：智慧點擊 / 手畫筆刷 */}
      {baseImage && layers.length === 0 && (
        <div
          style={{
            padding: '12px 15px',
            display: 'flex',
            gap: '8px',
            backgroundColor: '#fff',
            borderBottom: '1px solid #e0e0e0',
            flexShrink: 0
          }}
        >
          <button
            onClick={() => onToggleMode('smart')}
            disabled={!hasAutoMasks}
            style={{
              flex: 1,
              padding: '8px 10px',
              border: 'none',
              borderRadius: '4px',
              cursor: hasAutoMasks ? 'pointer' : 'not-allowed',
              backgroundColor: interactionMode === 'smart' ? '#4a90e2' : '#f0f0f0',
              color: interactionMode === 'smart' ? '#fff' : '#333',
              opacity: hasAutoMasks ? 1 : 0.5,
              fontWeight: interactionMode === 'smart' ? 600 : 400
            }}
          >
            智慧點擊
          </button>
          <button
            onClick={() => onToggleMode('brush')}
            style={{
              flex: 1,
              padding: '8px 10px',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: interactionMode === 'brush' ? '#4a90e2' : '#f0f0f0',
              color: interactionMode === 'brush' ? '#fff' : '#333',
              fontWeight: interactionMode === 'brush' ? 600 : 400
            }}
          >
            手畫筆刷
          </button>
        </div>
      )}

      {/* 畫筆工具 - 置於說明文字下方，圖層列表上方 */}
      {/* 當圖層列表有圖層時，隱藏筆刷工具；僅在 brush 模式顯示 */}
      {layers.length === 0 && interactionMode === 'brush' && (
        <BrushTool
          isBrushMode={isBrushMode}
          toolType={toolType}
          onSetToolType={onSetToolType}
          brushMode={brushMode}
          onSetBrushMode={onSetBrushMode}
          brushSize={brushSize}
          onBrushSizeChange={onBrushSizeChange}
          hasBrushPath={hasBrushPath}
        />
      )}
      
      {/* 開始分割圖層按鈕 - 只在沒有圖層時顯示 */}
      {baseImage && layers.length === 0 && (
        <div style={{ padding: '15px', flexShrink: 0 }}>
          <SegmentButton
            baseImage={baseImage}
            isSegmenting={isSegmenting}
            hasSegmentedMasks={false}
            hasBrushPath={hasBrushPath}
            onSegment={onConfirmBrush}
          />
        </div>
      )}
      
      {/* 圖層列表 - 只在圖層分割完成後顯示 */}
      {layers.length > 0 && (
        <div style={{ padding: '15px', flex: 1, minHeight: 0 }}>
          <LayerList
            layers={layers}
            selectedLayerIndex={selectedLayerIndex}
            selectedLayers={selectedLayers}
            hoveredLayerIndex={hoveredLayerIndex}
            onLayerClick={onLayerClick}
            layerItemRefs={layerItemRefs}
          />
        </div>
      )}
    </div>
  )
}

export default LeftSidebar
