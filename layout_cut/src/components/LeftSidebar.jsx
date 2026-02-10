import React from 'react'
import ControlPanel from './ControlPanel'
import LayerList from './LayerList/LayerList'
import InstructionText from './InstructionText'
import BrushTool from './BrushTool'
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
  currentStep,
  segmentedMasks,
  isBrushMode,
  toolType,
  onSetToolType,
  brushMode,
  onSetBrushMode,
  brushSize,
  onBrushSizeChange,
  onConfirmBrush,
  hasBrushPath
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

      {/* 控制面板 */}
      <div style={{ padding: '15px', flexShrink: 0 }}>
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

      {/* 說明文字 - 置於控制面板下方，圖層列表上方 */}
      <InstructionText
        currentStep={currentStep}
        baseImage={baseImage}
        segmentedMasks={segmentedMasks}
      />

      {/* 畫筆工具 - 置於說明文字下方，圖層列表上方 */}
      <BrushTool
        isBrushMode={isBrushMode}
        toolType={toolType}
        onSetToolType={onSetToolType}
        brushMode={brushMode}
        onSetBrushMode={onSetBrushMode}
        brushSize={brushSize}
        onBrushSizeChange={onBrushSizeChange}
        onConfirmBrush={onConfirmBrush}
        hasBrushPath={hasBrushPath}
      />
      
      {/* 圖層列表 */}
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
    </div>
  )
}

export default LeftSidebar
