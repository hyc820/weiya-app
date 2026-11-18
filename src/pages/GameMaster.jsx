import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, db } from '../lib/supabase'

const GAMES = ['套圈圈', '飞镖', '九宫格投球', '神射手', '趣味闯关']
const POINTS = [10, 20, 30, 50, 100]

export default function GameMaster() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [scanInput, setScanInput] = useState('')
  const [target, setTarget] = useState(null)
  const [selectedGame, setSelectedGame] = useState('')
  const [message, setMessage] = useState('')
  const [scanning, setScanning] = useState(false)
  const scannerRef = useRef(null)
  const scannerContainerId = 'qr-reader'
  const isWeChat = /MicroMessenger/i.test(navigator.userAgent)

  // 查找员工
  const findEmployee = async (empNo) => {
    const { data } = await supabase
      .from('employees')
      .select('*')
      .eq('employee_no', empNo.trim().toUpperCase())
      .single()
    if (data) {
      setTarget(data)
      setMessage('')
      setScanInput('')
      stopScanner()
    } else {
      setMessage('未找到该员工')
      setTarget(null)
    }
  }

  // 手动输入查询
  const handleSearch = async () => {
    if (!scanInput.trim()) return
    await findEmployee(scanInput)
  }

  // 启动相机扫码
  const startScanner = async () => {
    setScanning(true)
    setMessage('')
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode(scannerContainerId)
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        (decodedText) => {
          // 扫码成功
          findEmployee(decodedText)
        },
        () => {}
      )
    } catch (err) {
      setMessage(isWeChat
        ? '❌ 微信内无法调用相机，请点右上角 ⋯ 选择「在浏览器打开」，或手动输入工号'
        : '❌ 无法启动相机，请检查权限或手动输入工号')
      setScanning(false)
    }
  }

  // 停止扫码
  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
      } catch (e) {}
      scannerRef.current = null
    }
    setScanning(false)
  }

  // 组件卸载时停止相机
  useEffect(() => {
    return () => { stopScanner() }
  }, [])

  const handleAddPoint = async (points) => {
    if (!target || !selectedGame) {
      setMessage('请先选择游戏')
      return
    }
    try {
      await db.addGamePoint(target.id, selectedGame, points, employee.name)
      setMessage(`✅ ${target.name} 获得 ${points} 积分！`)
      const { data } = await supabase
        .from('employees')
        .select('*')
        .eq('id', target.id)
        .single()
      setTarget(data)
    } catch (e) {
      setMessage('❌ ' + e.message)
    }
  }

  const reset = () => {
    setTarget(null)
    setScanInput('')
    setSelectedGame('')
    setMessage('')
  }

  return (
    <div className="app-container">
      <div className="navbar">
        <button className="back-btn" onClick={() => navigate('/')}>←</button>
        <span className="title">👑 关主加分</span>
        <span></span>
      </div>

      {message && <div className="toast">{message}</div>}

      {!target ? (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>扫描员工工号二维码</h3>

          {!scanning ? (
            <>
              <button className="btn btn-primary" onClick={startScanner}>
                📷 打开相机扫码
              </button>

              {isWeChat && (
                <div style={{ marginTop: 12, padding: 10, background: '#FFF4E5', borderRadius: 8, fontSize: 12, color: '#A66300', lineHeight: 1.6 }}>
                  微信内无法调用相机。请点右上角 ⋯ 选择「在浏览器打开」后再扫码；也可直接输入工号。
                </div>
              )}

              <div style={{ textAlign: 'center', margin: '16px 0', color: '#999' }}>— 或手动输入 —</div>
              <input
                className="input"
                placeholder="工号，如 EMP001"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                autoCapitalize="characters"
              />
              <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={handleSearch}>
                查询员工
              </button>
              <p style={{ marginTop: 12, fontSize: 12, color: '#999' }}>
                💡 首次使用相机需要授权，扫码枪也可直接扫描填入
              </p>
            </>
          ) : (
            <div>
              <div id={scannerContainerId} style={{ width: '100%', borderRadius: 12, overflow: 'hidden' }} />
              <button
                className="btn btn-danger"
                style={{ marginTop: 12 }}
                onClick={stopScanner}
              >
                关闭相机
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="card" style={{ background: '#E8F5E9' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 36, marginRight: 12 }}>👤</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{target.name}</div>
                <div style={{ color: '#666' }}>{target.department} · {target.employee_no}</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12, color: '#999' }}>目前积分</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#FF6B35' }}>{target.current_points}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#999' }}>可用积分</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#16C79A' }}>
                  {target.current_points - target.locked_points}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 12 }}>选择游戏</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {GAMES.map((g) => (
                <button
                  key={g}
                  className="btn"
                  style={{
                    flex: '0 0 auto',
                    padding: '8px 16px',
                    background: selectedGame === g ? '#FF6B35' : '#f0f0f0',
                    color: selectedGame === g ? 'white' : '#333',
                    fontSize: 14,
                    width: 'auto'
                  }}
                  onClick={() => setSelectedGame(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {selectedGame && (
            <div className="card">
              <h3 style={{ marginBottom: 12 }}>选择加分</h3>
              <div className="btn-grid">
                {POINTS.map((p) => (
                  <button
                    key={p}
                    className="btn btn-success"
                    onClick={() => handleAddPoint(p)}
                  >
                    +{p} 分
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ margin: 12 }}>
            <button className="btn btn-outline" onClick={reset}>扫描下一位员工</button>
          </div>
        </>
      )}
    </div>
  )
}
