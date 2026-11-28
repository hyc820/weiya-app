import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { db } from '../lib/supabase'

const CONFETTI_COLORS = ['#FFD166', '#FF6B35', '#FF8FA3', '#7ED957', '#8FD3FF', '#C9A6FF']

function formatMoney(n) {
  return Number(n || 0).toLocaleString('zh-CN')
}

export default function Stage() {
  const [session, setSession] = useState(null)
  const [top, setTop] = useState([])
  const [stats, setStats] = useState({ participant_count: 0, total_score: 0, max_combo: 0 })
  const [loaded, setLoaded] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [confetti, setConfetti] = useState([])

  const offsetRef = useRef(0)
  const confettiForRef = useRef(null)
  const idRef = useRef(1)

  // 轮询真实数据
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const s = await db.getCurrentGameSession()
        if (cancelled) return
        setSession(s)
        if (s) {
          offsetRef.current = new Date(s.server_now).getTime() - Date.now()
          const [t, st] = await Promise.all([
            db.getGameLeaderboard(s.id, 10),
            db.getGameStats(s.id)
          ])
          if (cancelled) return
          setTop(t)
          setStats(st)
        } else {
          setTop([])
          setStats({ participant_count: 0, total_score: 0, max_combo: 0 })
        }
      } catch {
        // 网络抖动时忽略
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }

    load()
    const timer = setInterval(load, 1500)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  // 本地秒表，保证倒计时平滑
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(t)
  }, [])

  // 结算撒花（每局只生成一次）
  useEffect(() => {
    if (!session || session.status !== 'settled') return
    if (confettiForRef.current === session.id) return
    confettiForRef.current = session.id
    setConfetti(
      Array.from({ length: 70 }, () => ({
        id: idRef.current++,
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2.4 + Math.random() * 2,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: 6 + Math.random() * 8
      }))
    )
  }, [session])

  const serverNow = now + offsetRef.current
  const remaining =
    session && session.status === 'running' && session.end_at
      ? Math.max(0, Math.ceil((new Date(session.end_at).getTime() - serverNow) / 1000))
      : 0
  const finished = session && session.status === 'running' && remaining <= 0
  const showBoard = session && (session.status === 'running' || session.status === 'settled')

  const statusText = !session
    ? '等待发起'
    : session.status === 'waiting'
      ? '待开始'
      : session.status === 'running'
        ? remaining > 0
          ? `${remaining}s`
          : '已结束'
        : session.status === 'settled'
          ? '已结算'
          : '已取消'

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}${import.meta.env.BASE_URL}` : ''
  const maxScore = Math.max(1, top[0]?.score || 0)

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
            {session?.title || '数钱大作战'}
          </h1>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: 'clamp(40px,6vw,96px)',
              fontWeight: 900,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              color: session?.status === 'running' && remaining <= 5 ? '#FF6B6B' : '#FFD166'
            }}
          >
            {statusText}
          </div>
          <div style={{ fontSize: 'clamp(12px,1vw,16px)', opacity: 0.6, marginTop: 6 }}>
            {session?.status === 'running' && remaining > 0
              ? '剩余时间'
              : session?.status === 'settled'
                ? '本局已结算'
                : '数钱大赛'}
          </div>
        </div>
      </div>

      {!loaded && (
        <div style={{ marginTop: '28vh', textAlign: 'center', opacity: 0.5, fontSize: 'clamp(14px,1.4vw,20px)' }}>
          正在连接…
        </div>
      )}

      {loaded && (!session || session.status === 'cancelled') && (
        <div
          style={{
            marginTop: '10vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center'
          }}
        >
          <div style={{ fontSize: 'clamp(60px,10vw,140px)', animation: 'st-pop .6s ease-out' }}>💴</div>
          <p style={{ fontSize: 'clamp(16px,1.6vw,24px)', color: 'rgba(255,255,255,.75)', lineHeight: 1.9, marginTop: 20 }}>
            {session ? '本局已取消，等待主持人发起下一局' : '等待主持人发起数钱大作战'}
          </p>
          <div style={{ marginTop: '3vh', color: 'rgba(255,255,255,.4)', fontSize: 'clamp(12px,1vw,16px)' }}>
            员工从首页进入「数钱大作战」，不需要扫码也能看到本页进度
          </div>
        </div>
      )}

      {loaded && session && session.status === 'waiting' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6vw', marginTop: '4vh', flexWrap: 'wrap' }}>
          <div
            style={{
              background: 'white',
              padding: 18,
              borderRadius: 18,
              animation: 'st-glow 2.4s infinite'
            }}
          >
            <QRCodeSVG value={joinUrl} size={230} level="M" />
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: 'clamp(28px,3vw,52px)', fontWeight: 900, lineHeight: 1.2 }}>
              全员准备<br />即将开始
            </div>
            <p style={{ fontSize: 'clamp(14px,1.4vw,22px)', color: 'rgba(255,255,255,.75)', lineHeight: 1.9, marginTop: 16 }}>
              扫码登录后从首页进入「数钱大作战」<br />
              本局时长 {session.duration_seconds} 秒 · 结束后按名次发放积分
            </p>
            <div style={{ marginTop: 18, fontSize: 'clamp(13px,1.1vw,18px)', color: 'rgba(255,255,255,.55)', lineHeight: 1.8 }}>
              {(session.rewards || []).length > 0
                ? session.rewards.map((r) => `第 ${r.from}-${r.to} 名 +${r.points} 分`).join('　·　')
                : '本局未配置积分奖励'}
            </div>
          </div>
        </div>
      )}

      {loaded && showBoard && (
        <>
          <div
            style={{
              display: 'flex',
              gap: '3vw',
              marginBottom: '2vh',
              fontSize: 'clamp(13px,1.2vw,20px)',
              flexWrap: 'wrap'
            }}
          >
            <div>
              <span style={{ opacity: 0.55 }}>参与人数 </span>
              <b style={{ fontSize: 'clamp(22px,2.2vw,36px)', color: '#FFD166', fontVariantNumeric: 'tabular-nums' }}>
                {Number(stats.participant_count || 0)}
              </b>
            </div>
            <div>
              <span style={{ opacity: 0.55 }}>累计金额 </span>
              <b style={{ fontSize: 'clamp(22px,2.2vw,36px)', color: '#FFD166', fontVariantNumeric: 'tabular-nums' }}>
                ¥{formatMoney(stats.total_score)}
              </b>
            </div>
            <div>
              <span style={{ opacity: 0.55 }}>最高连击 </span>
              <b style={{ fontSize: 'clamp(22px,2.2vw,36px)', color: '#FFD166', fontVariantNumeric: 'tabular-nums' }}>
                x{Number(stats.max_combo || 0)}
              </b>
            </div>
            <div>
              <span style={{ opacity: 0.55 }}>当前第一 </span>
              <b style={{ fontSize: 'clamp(22px,2.2vw,36px)' }}>{top[0]?.name || '—'}</b>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1vh' }}>
            {top.map((p, i) => (
              <div
                key={p.employee_id}
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
                  {p.rank_no}
                </div>
                <div style={{ width: 'clamp(110px,12vw,200px)' }}>
                  <div style={{ fontSize: 'clamp(16px,1.5vw,26px)', fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 'clamp(10px,.85vw,14px)', opacity: 0.5 }}>
                    {p.department || '—'}
                    {p.max_combo >= 5 && (
                      <span style={{ marginLeft: 8, color: '#FF8FA3', fontWeight: 700 }}>
                        🔥x{p.max_combo}
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
                <div
                  style={{
                    width: 'clamp(64px,6vw,100px)',
                    textAlign: 'right',
                    fontSize: 'clamp(13px,1.1vw,20px)',
                    fontWeight: 700,
                    color: p.reward_points > 0 ? '#7ED957' : 'rgba(255,255,255,.25)'
                  }}
                >
                  {p.reward_points > 0 ? `+${p.reward_points}` : ''}
                </div>
              </div>
            ))}
            {top.length === 0 && (
              <div style={{ textAlign: 'center', padding: '8vh 0', color: 'rgba(255,255,255,.4)', fontSize: 'clamp(14px,1.3vw,20px)' }}>
                {finished ? '本局已结束，暂无成绩' : '还没有人提交成绩，快让全场打开手机'}
              </div>
            )}
          </div>

          {finished && (
            <div
              style={{
                marginTop: '3vh',
                textAlign: 'center',
                fontSize: 'clamp(15px,1.4vw,22px)',
                color: '#FFD166',
                animation: 'st-glow 2s infinite',
                padding: '12px 0'
              }}
            >
              时间到 · 等待主持人结算发奖
            </div>
          )}

          {session.status === 'settled' && (
            <div
              style={{
                marginTop: '3vh',
                textAlign: 'center',
                fontSize: 'clamp(14px,1.3vw,20px)',
                color: 'rgba(255,255,255,.7)'
              }}
            >
              本局结束 · 奖励已按名次发放到员工积分
            </div>
          )}
        </>
      )}

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

      <div
        style={{
          position: 'fixed',
          right: 18,
          bottom: 14,
          fontSize: 11,
          color: 'rgba(255,255,255,.3)',
          letterSpacing: 1
        }}
      >
        数钱大作战 · 实时大屏
      </div>
    </div>
  )
}
