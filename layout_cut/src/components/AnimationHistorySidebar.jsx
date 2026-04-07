import { useRef } from 'react'
import { videoSrcWithPosterFragment } from '../utils/animationHistoryStorage'

const SIDEBAR_WIDTH = 320

function truncate(text, maxLen = 48) {
  if (!text) return ''
  const t = String(text).trim()
  return t.length <= maxLen ? t : `${t.slice(0, maxLen)}…`
}

/**
 * 右側「動畫紀錄」側邊欄：與左側 320px 對稱
 */
function AnimationHistorySidebar({ records, onViewAgain, onDownloadRecord }) {
  return (
    <div
      className="right-sidebar-scroll"
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        width: `${SIDEBAR_WIDTH}px`,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        padding: 0,
        backgroundColor: '#f5f5f5',
        borderLeft: '1px solid #e0e0e0',
        overflowY: 'auto',
        overflowX: 'hidden',
        zIndex: 10
      }}
    >
      <div
        style={{
          padding: '16px',
          backgroundColor: '#fff',
          borderBottom: '1px solid #e0e0e0',
          flexShrink: 0
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '16px',
            fontWeight: 600,
            color: '#333'
          }}
        >
          動畫紀錄
        </h2>
      </div>

      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {records.length === 0 && (
          <div
            style={{
              fontSize: '13px',
              color: '#999',
              textAlign: 'center',
              padding: '24px 8px',
              lineHeight: 1.5
            }}
          >
            尚無紀錄
          </div>
        )}

        {records.map((rec) => (
          <HistoryCard
            key={rec.id}
            record={rec}
            onViewAgain={() => onViewAgain(rec)}
            onDownload={() => onDownloadRecord(rec)}
          />
        ))}
      </div>
    </div>
  )
}

function HistoryCard({ record, onViewAgain, onDownload }) {
  const videoRef = useRef(null)
  const videoSrc = videoSrcWithPosterFragment(record.videoUrl)

  const handleEnter = () => {
    const el = videoRef.current
    if (!el) return
    el.muted = true
    el.play().catch(() => {})
  }

  const handleLeave = () => {
    const el = videoRef.current
    if (!el) return
    el.pause()
    el.currentTime = 0
  }

  const iconBtnBase = {
    border: 'none',
    background: '#fff',
    borderRadius: '6px',
    width: '36px',
    height: '36px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
    fontSize: '16px'
  }

  return (
    <div
      style={{
        backgroundColor: '#fff',
        borderRadius: '10px',
        border: '1px solid #e8e8e8',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '120px',
          backgroundColor: '#111',
          overflow: 'hidden'
        }}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <video
          ref={videoRef}
          src={videoSrc}
          muted
          loop
          playsInline
          preload="metadata"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block'
          }}
        />
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: '#4a90e2',
            marginBottom: '4px'
          }}
        >
          {record.layerName || '圖層'}
        </div>
        <div
          style={{
            fontSize: '12px',
            color: '#555',
            lineHeight: 1.4,
            marginBottom: '10px',
            wordBreak: 'break-word'
          }}
          title={record.prompt}
        >
          {truncate(record.prompt, 52)}
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="animation-history-icon-btn"
            style={iconBtnBase}
            title="再次檢視"
            onClick={onViewAgain}
            aria-label="再次檢視"
          >
            <svg
              className="animation-history-icon-svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button
            type="button"
            className="animation-history-icon-btn"
            style={iconBtnBase}
            title="下載"
            onClick={onDownload}
            aria-label="下載"
          >
            <svg
              className="animation-history-icon-svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default AnimationHistorySidebar
export { SIDEBAR_WIDTH as ANIMATION_HISTORY_SIDEBAR_WIDTH }
