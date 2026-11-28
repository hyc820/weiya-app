import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

const DURATION = 30
const NOTE_VALUES = [1, 1, 1, 1, 1, 5, 5, 5, 10, 10, 20, 50]

const NOTE_STYLES = {
  1: { bg: 'linear-gradient(135deg,#7ED957,#3FA34D)', color: '#0B3D1C' },
  5: { bg: 'linear-gradient(135deg,#C9A6FF,#8E5CF7)', color: '#2B1259' },
  10: { bg: 'linear-gradient(135deg,#8FD3FF,#3B82F6)', color: '#0B2A5B' },
  20: { bg: 'linear-gradient(135deg,#FFD79A,#D97706)', color: '#4A2503' },
  50: { bg: 'linear-gradient(135deg,#9BE7C4,#0E9F6E)', color: '#063D2A' }
}

function formatMoney(n) {
  return n.toLocaleString('zh-CN')
}

export default function MoneyGame() {
  const [phase, setPhase] = useState('idle')
  const [countdown, setCountdown] = useState(3)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [remaining, setRemaining] = useState(DURATION)
  const [bills, setBills] = useState([])
  const [floats, setFloats] = useState([])
  const [best, setBest] = useState(() => Number(localStorage.getItem('mg_best') || 0))

  const idRef = useRef(1)
  const endAtRef = useRef(0)
  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const maxComboRef = useRef(0)
  const lastTapRef = useRef(0)

  const startGame = () => {
    scoreRef.current = 0
    comboRef.current = 0
    maxComboRef.current = 0
    lastTapRef.current = 0
    setScore(0)
    setCombo(0)
    setMaxCombo(0)
    setRemaining(DURATION)
    setBills([])
    setFloats([])
    setCountdown(3)
    setPhase('countdown')
  }

  // 倒计时
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) {
      setPhase('playing')
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 800)
    return () => clearTimeout(t)
  }, [phase, countdown])

  // 计时
  useEffect(() => {
    if (phase !== 'playing') return
    const end = Date.now() + DURATION * 1000
    endAtRef.current = end
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000))
      setRemaining(left)
      if (Date.now() >= end) {
        clearInterval(t)
        setPhase('ended')
      }
    }, 100)
    return () => clearInterval(t)
  }, [phase])

  // 钞票生成
  useEffect(() => {
    if (phase !== 'playing') return
    const t = setInterval(() => {
      if (Math.random() < 0.18) return
      setBills((prev) => {
        if (prev.length >= 12) return prev
        return [
          ...prev,
          {
            id: idRef.current++,
            left: 4 + Math.random() * 80,
            value: NOTE_VALUES[Math.floor(Math.random() * NOTE_VALUES.length)],
            duration: 2.1 + Math.random() * 1.3
          }
        ]
      })
    }, 300)
    return () => clearInterval(t)
  }, [phase])

  // 结束保存最好成绩
  useEffect(() => {
    if (phase !== 'ended') return
    if (scoreRef.current > best) {
      setBest(scoreRef.current)
      localStorage.setItem('mg_best', String(scoreRef.current))
    }
  }, [phase, best])

  const collect = (bill) => {
    if (phase !== 'playing') return
    setBills((prev) => prev.filter((b) => b.id !== bill.id))

    const now = Date.now()
    const nextCombo = now - lastTapRef.current < 480 ? comboRef.current + 1 : 1
    lastTapRef.current = now
    comboRef.current = nextCombo
    if (nextCombo > maxComboRef.current) {
      maxComboRef.current = nextCombo
      setMaxCombo(nextCombo)
    }
    setCombo(nextCombo)

    const multiplier = nextCombo >= 20 ? 2 : nextCombo >= 10 ? 1.5 : 1
    const gain = Math.round(bill.value * multiplier)
    scoreRef.current += gain
    setScore(scoreRef.current)

    if (navigator.vibrate) navigator.vibrate(8)

    const id = idRef.current++
    setFloats((prev) => [
      ...prev.slice(-6),
      { id, left: bill.left, text: `+${gain}${multiplier > 1 ? ` ×${multiplier}` : ''}` }
    ])
    setTimeout(() => setFloats((prev) => prev.filter((f) => f.id !== id)), 650)
  }

  const multiplier = combo >= 20 ? 2 : combo >= 10 ? 1.5 : 1

  return (
    <div className="mg-root">
      <style>{`
        .mg-root {
          min-height: 100vh;
          background: radial-gradient(circle at 50% 0%, #4a0d0d 0%, #2a0505 55%, #150202 100%);
          color: #fff;
          overflow: hidden;
          position: relative;
          touch-action: manipulation;
          user-select: none;
          -webkit-user-select: none;
        }
        @keyframes mg-fall {
          from { transform: translate3d(0, -120px, 0) rotate(-10deg); }
          to { transform: translate3d(0, 108vh, 0) rotate(10deg); }
        }
        @keyframes mg-float {
          0% { opacity: 0; transform: translate(-50%, 0) scale(.8); }
          20% { opacity: 1; transform: translate(-50%, -10px) scale(1.1); }
          100% { opacity: 0; transform: translate(-50%, -70px) scale(1); }
        }
        @keyframes mg-pop {
          0% { transform: scale(.6); opacity: 0; }
          60% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes mg-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .mg-note {
          position: absolute;
          width: 78px;
          height: 46px;
          border-radius: 6px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 6px 18px rgba(0,0,0,.35), inset 0 0 0 2px rgba(255,255,255,.35);
          font-weight: 800;
          will-change: transform;
        }
        .mg-note:active { filter: brightness(1.15); }
      `}</style>

      {phase === 'playing' && (
        <>
          <div style={{ padding: '18px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, letterSpacing: 2 }}>本局金额</div>
              <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', color: '#FFD166' }}>
                ¥{formatMoney(score)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 34, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: remaining <= 5 ? '#FF6B6B' : '#fff' }}>
                {remaining}s
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>剩余时间</div>
            </div>
          </div>

          <div style={{ height: 4, margin: '0 16px', background: 'rgba(255,255,255,.15)', borderRadius: 2 }}>
            <div
              style={{
                height: '100%',
                width: `${(remaining / DURATION) * 100}%`,
                background: 'linear-gradient(90deg,#FFD166,#FF6B35)',
                borderRadius: 2,
                transition: 'width .2s linear'
              }}
            />
          </div>

          {combo >= 3 && (
            <div
              style={{
                position: 'absolute',
                top: 78,
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '4px 14px',
                borderRadius: 999,
                background: 'rgba(255,209,102,.18)',
                border: '1px solid rgba(255,209,102,.5)',
                color: '#FFD166',
                fontWeight: 800,
                fontSize: 14,
                animation: 'mg-pulse .6s infinite'
              }}
            >
              连击 x{combo}{multiplier > 1 ? ` · ${multiplier}倍` : ''}
            </div>
          )}

          {bills.map((bill) => {
            const style = NOTE_STYLES[bill.value] || NOTE_STYLES[1]
            return (
              <div
                key={bill.id}
                className="mg-note"
                style={{
                  left: `${bill.left}%`,
                  top: 0,
                  background: style.bg,
                  color: style.color,
                  animation: `mg-fall ${bill.duration}s linear forwards`
                }}
                onPointerDown={(e) => {
                  e.preventDefault()
                  collect(bill)
                }}
                onAnimationEnd={() => setBills((prev) => prev.filter((b) => b.id !== bill.id))}
              >
                <div style={{ fontSize: 19, lineHeight: 1 }}>¥{bill.value}</div>
                <div style={{ fontSize: 8, opacity: 0.65, letterSpacing: 1 }}>尾牙钞</div>
              </div>
            )
          })}

          {floats.map((f) => (
            <div
              key={f.id}
              style={{
                position: 'absolute',
                top: '46%',
                left: `${f.left + 3}%`,
                fontWeight: 900,
                fontSize: 20,
                color: '#FFD166',
                textShadow: '0 2px 8px rgba(0,0,0,.5)',
                animation: 'mg-float .65s ease-out forwards',
                pointerEvents: 'none'
              }}
            >
              {f.text}
            </div>
          ))}
        </>
      )}

      {phase === 'countdown' && (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 18, opacity: 0.75, marginBottom: 12 }}>准备好了吗</div>
          <div
            key={countdown}
            style={{
              fontSize: 140,
              fontWeight: 900,
              color: '#FFD166',
              lineHeight: 1,
              animation: 'mg-pop .4s ease-out'
            }}
          >
            {countdown}
          </div>
          <div style={{ marginTop: 16, fontSize: 14, opacity: 0.6 }}>看到钞票就疯狂点</div>
        </div>
      )}

      {phase === 'idle' && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 24 }}>
          <div style={{ fontSize: 13, color: '#FFD166', letterSpacing: 4, marginBottom: 8 }}>尾牙热场</div>
          <h1 style={{ fontSize: 42, lineHeight: 1.15, marginBottom: 12 }}>
            数钱<br />大作战
          </h1>
          <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 14, lineHeight: 1.8, marginBottom: 24 }}>
            {DURATION} 秒内狂点掉落的钞票，面额越大得分越高。<br />
            连续点击会触发连击倍率，最高 2 倍。
          </p>

          {best > 0 && (
            <div style={{ marginBottom: 20, fontSize: 14, color: '#FFD166' }}>
              我的最好成绩：¥{formatMoney(best)}
            </div>
          )}

          <button
            onClick={startGame}
            style={{
              padding: '18px',
              borderRadius: 14,
              border: 'none',
              background: 'linear-gradient(135deg,#FFD166,#FF8F1F)',
              color: '#3A1600',
              fontSize: 20,
              fontWeight: 900,
              cursor: 'pointer',
              boxShadow: '0 10px 30px rgba(255,143,31,.35)'
            }}
          >
            开始数钱
          </button>

          <div style={{ marginTop: 18, fontSize: 12, color: 'rgba(255,255,255,.45)', textAlign: 'center' }}>
            原型模式 · 成绩仅保存在本机，不计入积分
          </div>
          <div style={{ marginTop: 10, textAlign: 'center' }}>
            <Link to="/stage-demo" style={{ color: '#FFD166', fontSize: 13 }}>查看大屏预览 →</Link>
          </div>
        </div>
      )}

      {phase === 'ended' && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 24 }}>
          <div style={{ fontSize: 13, color: '#FFD166', letterSpacing: 4, marginBottom: 10 }}>本局结束</div>
          <div style={{ fontSize: 64, fontWeight: 900, color: '#FFD166', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
            ¥{formatMoney(score)}
          </div>
          <div style={{ marginTop: 8, color: 'rgba(255,255,255,.7)', fontSize: 15 }}>
            最高连击 x{maxCombo}
            {best > 0 && ` · 历史最好 ¥${formatMoney(best)}`}
          </div>

          <div style={{ marginTop: 10, color: 'rgba(255,255,255,.55)', fontSize: 13 }}>
            {score >= 1500
              ? '手速惊人，现场前几名稳了'
              : score >= 800
                ? '成绩不错，再练一局还能更高'
                : '手速还有提升空间，再来一局'}
          </div>

          <button
            onClick={startGame}
            style={{
              marginTop: 28,
              padding: '16px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg,#FFD166,#FF8F1F)',
              color: '#3A1600',
              fontSize: 18,
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            再来一局
          </button>

          <Link
            to="/"
            style={{
              marginTop: 12,
              padding: '14px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,.25)',
              color: '#fff',
              textAlign: 'center',
              textDecoration: 'none',
              fontSize: 15
            }}
          >
            返回首页
          </Link>

          <div style={{ marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,.4)', textAlign: 'center' }}>
            原型模式 · 成绩未上传，不计入积分
          </div>
        </div>
      )}
    </div>
  )
}
