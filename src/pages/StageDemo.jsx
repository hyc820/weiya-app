import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

const DURATION = 30

const PLAYERS = [
  { name: '王小明', dept: '研发部' },
  { name: '李思思', dept: '市场部' },
  { name: '张伟', dept: '生产部' },
  { name: '陈静', dept: '财务部' },
  { name: '刘洋', dept: '品质部' },
  { name: '赵敏', dept: '人事部' },
  { name: '孙强', dept: '研发部' },
  { name: '周芳', dept: '业务部' },
  { name: '吴磊', dept: '生产部' },
  { name: '郑欣', dept: '采购部' },
  { name: '冯涛', dept: '工程部' },
  { name: '许婷', dept: '市场部' },
  { name: '何俊', dept: '研发部' },
  { name: '林小雨', dept: '财务部' }
]

const CONFETTI_COLORS = ['#FFD166', '#FF6B35', '#FF8FA3', '#7ED957', '#8FD3FF', '#C9A6FF']

function formatMoney(n) {
  return n.toLocaleString('zh-CN')
}

export default function StageDemo() {
  const [phase, setPhase] = useState('idle')
  const [countdown, setCountdown] = useState(3)
  const [remaining, setRemaining] = useState(DURATION)
  const [scores, setScores] = useState(() => PLAYERS.map(() => 0))
  const [combos, setCombos] = useState(() => PLAYERS.map(() => 0))
  const [participants, setParticipants] = useState(102)
  const [confetti, setConfetti] = useState([])
  const idRef = useRef(1)

  const start = () => {
    setScores(PLAYERS.map(() => 0))
    setCombos(PLAYERS.map(() => 0))
    setParticipants(102)
    setRemaining(DURATION)
    setConfetti([])
    setCountdown(3)
    setPhase('countdown')
  }

  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) {
      setPhase('live')
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 800)
    return () => clearTimeout(t)
  }, [phase, countdown])

  useEffect(() => {
    if (phase !== 'live') return
    const end = Date.now() + DURATION * 1000
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000))
      setRemaining(left)
      if (Date.now() >= end) setPhase('result')
    }, 100)

    const ticker = setInterval(() => {
      setScores((prev) =>
        prev.map((s, i) => {
          const speed = 0.55 + ((i * 7) % 10) / 20
          return s + (Math.random() < 0.72 ? Math.floor(Math.random() * 55 * speed) + 3 : 0)
        })
      )
      setParticipants((p) => (p < 118 && Math.random() < 0.35 ? p + 1 : p))
      setCombos((prev) =>
        prev.map((c) => (Math.random() < 0.35 ? c + 1 + Math.floor(Math.random() * 2) : c))
      )
    }, 320)

    return () => {
      clearInterval(timer)
      clearInterval(ticker)
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'result') return
    const list = Array.from({ length: 70 }, () => ({
      id: idRef.current++,
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 2.4 + Math.random() * 2,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 6 + Math.random() * 8
    }))
    setConfetti(list)
  }, [phase])

  const ranked = PLAYERS.map((p, i) => ({ ...p, score: scores[i] || 0, combo: combos[i] || 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
  const maxScore = Math.max(1, ranked[0]?.score || 0)
  const totalScore = scores.reduce((a, b) => a + b, 0)
  const maxCombo = Math.max(0, ...combos)

  return (
    <div className="st-root">
      <style>{`
        .st-root {
          min-height: 100vh;
          background:
            radial-gradient(circle at 50% -10%, #6b1414 0%, #360808 45%, #170303 100%);
          color: #fff;
          overflow: hidden;
          position: relative;
          padding: 3vh 4vw;
          box-sizing: border-box;
        }
        @keyframes st-pop {
          0% { transform: scale(.5); opacity: 0; }
          60% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes st-fall {
          0% { transform: translate3d(0,-10vh,0) rotate(0); opacity: 1; }
          100% { transform: translate3d(0,110vh,0) rotate(720deg); opacity: .9; }
        }
        @keyframes st-glow {
          0%, 100% { box-shadow: 0 0 30px rgba(255,209,102,.25); }
          50% { box-shadow: 0 0 55px rgba(255,209,102,.5); }
        }
        .st-bar {
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #FF8F1F, #FFD166);
          transition: width .3s ease-out;
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2vh' }}>
        <div>
          <div style={{ fontSize: 'clamp(12px,1vw,16px)', letterSpacing: 6, color: '#FFD166' }}>尾牙热场</div>
          <h1 style={{ fontSize: 'clamp(32px,4vw,64px)', lineHeight: 1.05, marginTop: 6 }}>
            数钱大作战
          </h1>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: 'clamp(40px,6vw,96px)',
              fontWeight: 900,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              color: phase === 'live' && remaining <= 5 ? '#FF6B6B' : '#FFD166'
            }}
          >
            {phase === 'live' ? `${remaining}s` : phase === 'countdown' ? '准备' : phase === 'result' ? '结束' : '待开始'}
          </div>
          <div style={{ fontSize: 'clamp(12px,1vw,16px)', opacity: 0.6, marginTop: 6 }}>
            {phase === 'live' ? '剩余时间' : '数钱大赛'}
          </div>
        </div>
      </div>

      {phase === 'idle' && (
        <div
          style={{
            marginTop: '8vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center'
          }}
        >
          <div style={{ fontSize: 'clamp(60px,10vw,140px)', animation: 'st-pop .6s ease-out' }}>💴</div>
          <p style={{ fontSize: 'clamp(16px,1.6vw,24px)', color: 'rgba(255,255,255,.75)', lineHeight: 1.9, marginTop: 20 }}>
            30 秒内疯狂点击掉落的钞票<br />
            面额越大得分越高，连击还有倍率加成
          </p>
          <div style={{ marginTop: '4vh', color: 'rgba(255,255,255,.45)', fontSize: 'clamp(12px,1vw,16px)' }}>
            原型演示 · 榜单为模拟数据
          </div>
          <button
            onClick={start}
            style={{
              marginTop: '5vh',
              padding: '18px 70px',
              borderRadius: 999,
              border: 'none',
              background: 'linear-gradient(135deg,#FFD166,#FF8F1F)',
              color: '#3A1600',
              fontSize: 'clamp(18px,1.8vw,26px)',
              fontWeight: 900,
              cursor: 'pointer',
              animation: 'st-glow 2s infinite'
            }}
          >
            开始演示
          </button>
        </div>
      )}

      {phase === 'countdown' && (
        <div
          style={{
            height: '62vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div style={{ fontSize: 'clamp(14px,1.4vw,22px)', opacity: 0.7, letterSpacing: 4 }}>所有人准备</div>
          <div
            key={countdown}
            style={{
              fontSize: 'clamp(140px,22vw,340px)',
              fontWeight: 900,
              color: '#FFD166',
              lineHeight: 1,
              animation: 'st-pop .45s ease-out'
            }}
          >
            {countdown}
          </div>
          <div style={{ fontSize: 'clamp(13px,1.2vw,18px)', opacity: 0.55 }}>打开手机，准备开抢</div>
        </div>
      )}

      {(phase === 'live' || phase === 'result') && (
        <>
          <div
            style={{
              display: 'flex',
              gap: '3vw',
              marginBottom: '2vh',
              fontSize: 'clamp(13px,1.2vw,20px)'
            }}
          >
            <div>
              <span style={{ opacity: 0.55 }}>参与人数 </span>
              <b style={{ fontSize: 'clamp(22px,2.2vw,36px)', color: '#FFD166', fontVariantNumeric: 'tabular-nums' }}>
                {participants}
              </b>
            </div>
            <div>
              <span style={{ opacity: 0.55 }}>累计金额 </span>
              <b style={{ fontSize: 'clamp(22px,2.2vw,36px)', color: '#FFD166', fontVariantNumeric: 'tabular-nums' }}>
                ¥{formatMoney(totalScore)}
              </b>
            </div>
            <div>
              <span style={{ opacity: 0.55 }}>最高连击 </span>
              <b style={{ fontSize: 'clamp(22px,2.2vw,36px)', color: '#FFD166', fontVariantNumeric: 'tabular-nums' }}>
                x{maxCombo}
              </b>
            </div>
            <div>
              <span style={{ opacity: 0.55 }}>当前第一 </span>
              <b style={{ fontSize: 'clamp(22px,2.2vw,36px)' }}>{ranked[0]?.name || '—'}</b>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1vh' }}>
            {ranked.map((p, i) => (
              <div
                key={p.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1.2vw',
                  padding: '1.1vh 1.4vw',
                  borderRadius: 12,
                  background:
                    i === 0
                      ? 'linear-gradient(90deg, rgba(255,209,102,.22), rgba(255,209,102,.04))'
                      : 'rgba(255,255,255,.05)',
                  border: i === 0 ? '1px solid rgba(255,209,102,.45)' : '1px solid rgba(255,255,255,.06)'
                }}
              >
                <div
                  style={{
                    width: 'clamp(28px,2.6vw,44px)',
                    textAlign: 'center',
                    fontSize: 'clamp(16px,1.5vw,26px)',
                    fontWeight: 900,
                    color: i < 3 ? '#FFD166' : 'rgba(255,255,255,.55)'
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ width: 'clamp(100px,11vw,190px)' }}>
                  <div style={{ fontSize: 'clamp(16px,1.5vw,26px)', fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 'clamp(10px,.85vw,14px)', opacity: 0.5 }}>
                    {p.dept}
                    {p.combo >= 5 && (
                      <span style={{ marginLeft: 8, color: '#FF8FA3', fontWeight: 700 }}>
                        🔥x{p.combo}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ flex: 1, height: 'clamp(10px,1.2vh,18px)', background: 'rgba(255,255,255,.07)', borderRadius: 999 }}>
                  <div className="st-bar" style={{ width: `${(p.score / maxScore) * 100}%` }} />
                </div>
                <div
                  style={{
                    width: 'clamp(100px,10vw,170px)',
                    textAlign: 'right',
                    fontSize: 'clamp(16px,1.6vw,28px)',
                    fontWeight: 900,
                    color: '#FFD166',
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  ¥{formatMoney(p.score)}
                </div>
              </div>
            ))}
          </div>

          {phase === 'result' && (
            <div
              style={{
                marginTop: '3vh',
                textAlign: 'center',
                fontSize: 'clamp(14px,1.3vw,20px)',
                color: 'rgba(255,255,255,.7)'
              }}
            >
              本局结束 · 前 10 名将按配置获得积分奖励（原型为模拟数据）
            </div>
          )}
        </>
      )}

      {phase === 'result' && (
        <>
          {confetti.map((c) => (
            <span
              key={c.id}
              style={{
                position: 'absolute',
                top: 0,
                left: `${c.left}%`,
                width: c.size,
                height: c.size * 0.6,
                background: c.color,
                borderRadius: 2,
                animation: `st-fall ${c.duration}s linear ${c.delay}s forwards`,
                pointerEvents: 'none',
                zIndex: 5
              }}
            />
          ))}
        </>
      )}

      <div
        style={{
          position: 'fixed',
          right: 24,
          bottom: 22,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          zIndex: 10
        }}
      >
        {(phase === 'idle' || phase === 'result') && (
          <button
            onClick={start}
            style={{
              padding: '12px 24px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg,#FFD166,#FF8F1F)',
              color: '#3A1600',
              fontWeight: 800,
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            {phase === 'idle' ? '开始演示' : '重新演示'}
          </button>
        )}
        <Link
          to="/admin"
          style={{
            padding: '12px 18px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,.2)',
            color: 'rgba(255,255,255,.7)',
            textDecoration: 'none',
            fontSize: 13
          }}
        >
          返回后台
        </Link>
      </div>

      <div
        style={{
          position: 'fixed',
          left: 18,
          bottom: 14,
          fontSize: 11,
          color: 'rgba(255,255,255,.3)',
          letterSpacing: 1
        }}
      >
        原型 · 模拟数据
      </div>
    </div>
  )
}
