import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

const DURATION = 30
const NOTE_STYLES = {
  1: { bg: 'linear-gradient(135deg,#7ED957,#3FA34D)', color: '#0B3D1C' },
  5: { bg: 'linear-gradient(135deg,#C9A6FF,#8E5CF7)', color: '#2B1259' },
  10: { bg: 'linear-gradient(135deg,#8FD3FF,#3B82F6)', color: '#0B2A5B' },
  20: { bg: 'linear-gradient(135deg,#FFD79A,#D97706)', color: '#4A2503' },
  50: { bg: 'linear-gradient(135deg,#9BE7C4,#0E9F6E)', color: '#063D2A' },
  100: { bg: 'linear-gradient(135deg,#FFF3B0,#FFB703)', color: '#5A3200' }
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
  const [milestone, setMilestone] = useState(null)
  const [muted, setMuted] = useState(() => localStorage.getItem('mg_muted') === '1')
  const [best, setBest] = useState(() => Number(localStorage.getItem('mg_best') || 0))

  const idRef = useRef(1)
  const startAtRef = useRef(0)
  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const maxComboRef = useRef(0)
  const lastTapRef = useRef(0)
  const audioRef = useRef(null)
  const perfectAudioRef = useRef(null)
  const unbelievableAudioRef = useRef(null)
  const spawnTimerRef = useRef(null)
  const milestoneTimerRef = useRef(null)

  // ===== 音效 =====
  const ensureAudio = () => {
    try {
      if (!audioRef.current) {
        const Ctx = window.AudioContext || window.webkitAudioContext
        if (!Ctx) return null
        audioRef.current = new Ctx()
      }
      if (audioRef.current.state === 'suspended') audioRef.current.resume()
      return audioRef.current
    } catch {
      return null
    }
  }

  const tone = (freq, duration = 0.07, type = 'sine', volume = 0.06, delay = 0, glideTo = 0) => {
    if (muted) return
    const ctx = ensureAudio()
    if (!ctx) return
    try {
      const t0 = ctx.currentTime + delay
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, t0)
      if (glideTo > 0) {
        osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + duration)
      }
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + duration + 0.03)
    } catch {
      // 忽略音频异常
    }
  }

  const speak = (text) => {
    if (muted) return
    if (!('speechSynthesis' in window)) return
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'en-US'
      u.rate = 1.05
      u.pitch = 1.3
      u.volume = 1
      window.speechSynthesis.speak(u)
    } catch {
      // 忽略语音异常
    }
  }

  // 预加载英文语音，避免现场首次播放延迟
  useEffect(() => {
    const base = import.meta.env.BASE_URL
    perfectAudioRef.current = new Audio(`${base}sounds/perfect.m4a`)
    unbelievableAudioRef.current = new Audio(`${base}sounds/unbelievable.m4a`)
    ;[perfectAudioRef.current, unbelievableAudioRef.current].forEach((a) => {
      a.preload = 'auto'
      a.volume = 1
    })
  }, [])

  const playVoice = (kind) => {
    if (muted) return
    const audio = kind === 'perfect' ? perfectAudioRef.current : unbelievableAudioRef.current
    const fallback = kind === 'perfect' ? 'Perfect!' : 'Unbelievable!'
    if (audio) {
      try {
        audio.currentTime = 0
        const p = audio.play()
        if (p && p.catch) p.catch(() => speak(fallback))
        return
      } catch {
        // 继续走语音合成兜底
      }
    }
    speak(fallback)
  }

  useEffect(() => {
    localStorage.setItem('mg_muted', muted ? '1' : '0')
  }, [muted])

  const startGame = () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    ensureAudio()
    // 在用户点击时解锁音频，保证 iOS 上连击语音能播放
    ;[perfectAudioRef.current, unbelievableAudioRef.current].forEach((a) => {
      if (!a) return
      try {
        const p = a.play()
        if (p && p.then) {
          p.then(() => {
            a.pause()
            a.currentTime = 0
          }).catch(() => {})
        } else {
          a.pause()
          a.currentTime = 0
        }
      } catch {
        // 忽略解锁异常
      }
    })
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
    setMilestone(null)
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
    tone(countdown === 1 ? 760 : 540, 0.1, 'square', 0.05)
    const t = setTimeout(() => setCountdown((c) => c - 1), 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, countdown])

  // 计时
  useEffect(() => {
    if (phase !== 'playing') return
    startAtRef.current = Date.now()
    const end = Date.now() + DURATION * 1000
    tone(1040, 0.2, 'sine', 0.08)
    tone(1320, 0.2, 'sine', 0.05, 0.09)
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000))
      setRemaining(left)
      if (Date.now() >= end) {
        clearInterval(t)
        setPhase('ended')
      }
    }, 100)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // 连击衰减：0.85 秒没有点击就断开
  useEffect(() => {
    if (phase !== 'playing') return
    const t = setInterval(() => {
      if (comboRef.current > 0 && Date.now() - lastTapRef.current > 850) {
        comboRef.current = 0
        setCombo(0)
      }
    }, 100)
    return () => clearInterval(t)
  }, [phase])

  // 钞票生成：普通节奏 + 三波钞票雨 + 最后 5 秒加速
  useEffect(() => {
    if (phase !== 'playing') return
    let cancelled = false

    const spawn = () => {
      if (cancelled) return
      const elapsed = (Date.now() - startAtRef.current) / 1000
      const rush =
        (elapsed >= 6 && elapsed < 8.5) ||
        (elapsed >= 13 && elapsed < 16) ||
        (elapsed >= 21 && elapsed < 24) ||
        elapsed >= 25

      setBills((prev) => {
        if (prev.length >= (rush ? 16 : 11)) return prev
        const roll = Math.random()
        let value
        if (rush) {
          value =
            roll < 0.05 ? 100 :
            roll < 0.16 ? 50 :
            roll < 0.38 ? 20 :
            roll < 0.64 ? 10 :
            roll < 0.85 ? 5 : 1
        } else {
          value =
            roll < 0.015 ? 100 :
            roll < 0.07 ? 50 :
            roll < 0.2 ? 20 :
            roll < 0.44 ? 10 :
            roll < 0.7 ? 5 : 1
        }
        const duration =
          value === 100 ? 1.7 :
          value === 50 ? 2.1 :
          value === 20 ? 2.4 :
          value === 10 ? 2.8 : 3.1
        return [
          ...prev,
          {
            id: idRef.current++,
            left: 2 + Math.random() * 82,
            value,
            duration: duration + Math.random() * 0.5,
            drift: (Math.random() - 0.5) * 180
          }
        ]
      })

      const delay = rush ? 115 + Math.random() * 90 : 275 + Math.random() * 190
      spawnTimerRef.current = setTimeout(spawn, delay)
    }

    spawn()
    return () => {
      cancelled = true
      clearTimeout(spawnTimerRef.current)
    }
  }, [phase])

  // 结束音效与成绩
  useEffect(() => {
    if (phase !== 'ended') return
    ;[880, 740, 620].forEach((f, i) => tone(f, 0.2, 'sine', 0.07, i * 0.15))
    if (scoreRef.current > best) {
      setBest(scoreRef.current)
      localStorage.setItem('mg_best', String(scoreRef.current))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => {
    return () => {
      clearTimeout(spawnTimerRef.current)
      clearTimeout(milestoneTimerRef.current)
      if (window.speechSynthesis) window.speechSynthesis.cancel()
    }
  }, [])

  const collect = (bill) => {
    if (phase !== 'playing') return
    setBills((prev) => prev.filter((b) => b.id !== bill.id))

    const now = Date.now()
    const nextCombo = now - lastTapRef.current < 850 ? comboRef.current + 1 : 1
    lastTapRef.current = now
    comboRef.current = nextCombo
    if (nextCombo > maxComboRef.current) {
      maxComboRef.current = nextCombo
      setMaxCombo(nextCombo)
    }
    setCombo(nextCombo)

    const multiplier = nextCombo >= 30 ? 2 : nextCombo >= 15 ? 1.5 : 1
    const gain = Math.round(bill.value * multiplier)
    scoreRef.current += gain
    setScore(scoreRef.current)

    if (!muted) {
      const pitch = 900 + Math.min(nextCombo, 30) * 26
      // 向上滑音的“啵”声，接近消消乐的点击反馈
      tone(pitch, 0.065, 'sine', bill.value >= 50 ? 0.075 : 0.055, 0, pitch * 1.55)
      tone(pitch * 2.1, 0.03, 'triangle', 0.018, 0.005)
    }
    if (navigator.vibrate) navigator.vibrate(bill.value >= 50 ? 18 : 8)

    if (nextCombo === 15) {
      ;[784, 988, 1319].forEach((f, i) => tone(f, 0.17, 'sine', 0.09, i * 0.07))
      tone(2093, 0.12, 'triangle', 0.035, 0.22)
      playVoice('perfect')
      showMilestone('Perfect!', '#FFD166')
    } else if (nextCombo === 30) {
      ;[784, 988, 1175, 1568, 2093].forEach((f, i) => tone(f, 0.16, 'sine', 0.09, i * 0.065))
      tone(2637, 0.14, 'triangle', 0.03, 0.34)
      playVoice('unbelievable')
      showMilestone('Unbelievable!', '#FF6B9D')
    }

    const id = idRef.current++
    setFloats((prev) => [
      ...prev.slice(-6),
      { id, left: bill.left, text: `+${gain}${multiplier > 1 ? ` ×${multiplier}` : ''}` }
    ])
    setTimeout(() => setFloats((prev) => prev.filter((f) => f.id !== id)), 650)
  }

  const showMilestone = (text, color) => {
    clearTimeout(milestoneTimerRef.current)
    setMilestone({ text, color })
    milestoneTimerRef.current = setTimeout(() => setMilestone(null), 1200)
  }

  const multiplier = combo >= 30 ? 2 : combo >= 15 ? 1.5 : 1

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
          to { transform: translate3d(var(--drift, 0px), 108vh, 0) rotate(10deg); }
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
        @keyframes mg-milestone {
          0% { opacity: 0; transform: translate(-50%, 10px) scale(.6); }
          25% { opacity: 1; transform: translate(-50%, 0) scale(1.12); }
          70% { opacity: 1; transform: translate(-50%, 0) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -24px) scale(.95); }
        }
        @keyframes mg-combo-countdown {
          from { width: 100%; }
          to { width: 0%; }
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

      <button
        onClick={() => {
          const next = !muted
          setMuted(next)
          if (!next) {
            ensureAudio()
            setTimeout(() => tone(880, 0.08, 'sine', 0.05), 30)
          }
        }}
        aria-label={muted ? '开启音效' : '关闭音效'}
        style={{
          position: 'fixed',
          top: 14,
          right: 14,
          zIndex: 20,
          width: 38,
          height: 38,
          borderRadius: 19,
          border: '1px solid rgba(255,255,255,.18)',
          background: 'rgba(0,0,0,.28)',
          color: '#fff',
          fontSize: 16,
          cursor: 'pointer'
        }}
      >
        {muted ? '🔇' : '🔊'}
      </button>

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
              key={combo}
              style={{
                position: 'absolute',
                top: 78,
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '4px 14px 6px',
                borderRadius: 999,
                background: 'rgba(255,209,102,.18)',
                border: '1px solid rgba(255,209,102,.5)',
                color: '#FFD166',
                fontWeight: 800,
                fontSize: 14,
                overflow: 'hidden'
              }}
            >
              连击 x{combo}{multiplier > 1 ? ` · ${multiplier}倍` : ''}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  bottom: 0,
                  height: 2,
                  background: '#FFD166',
                  animation: 'mg-combo-countdown .85s linear forwards'
                }}
              />
            </div>
          )}

          {remaining <= 5 && (
            <div
              style={{
                position: 'absolute',
                top: 122,
                left: '50%',
                transform: 'translateX(-50%)',
                color: '#FF6B6B',
                fontWeight: 800,
                fontSize: 13,
                letterSpacing: 2,
                animation: 'mg-pulse .8s infinite'
              }}
            >
              最后冲刺 · 钞票雨
            </div>
          )}

          {milestone && (
            <div
              style={{
                position: 'absolute',
                top: '30%',
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: milestone.text.length > 8 ? 30 : 46,
                fontWeight: 900,
                color: milestone.color,
                textShadow: `0 0 30px ${milestone.color}`,
                animation: 'mg-milestone 1.2s ease-out forwards',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 6
              }}
            >
              {milestone.text}
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
                  animation: `mg-fall ${bill.duration}s linear forwards`,
                  '--drift': `${bill.drift}px`,
                  width: bill.value === 100 ? 88 : 78,
                  height: bill.value === 100 ? 50 : 46
                }}
                onPointerDown={(e) => {
                  e.preventDefault()
                  collect(bill)
                }}
                onAnimationEnd={() => setBills((prev) => prev.filter((b) => b.id !== bill.id))}
              >
                <div style={{ fontSize: bill.value === 100 ? 21 : 19, lineHeight: 1 }}>¥{bill.value}</div>
                <div style={{ fontSize: 8, opacity: 0.65, letterSpacing: 1 }}>
                  {bill.value === 100 ? '金砖' : '尾牙钞'}
                </div>
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
            中间会有三波钞票雨，最后 5 秒全面加速。<br />
            连续点击触发连击，15 连击开启 1.5 倍并提示 Perfect，30 连击开启 2 倍并提示 Unbelievable。
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
