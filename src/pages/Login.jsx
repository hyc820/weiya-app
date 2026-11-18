import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../lib/supabase'
import { Html5Qrcode } from 'html5-qrcode'

export default function Login() {
  const [employeeNo, setEmployeeNo] = useState('')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const isWeChat = /MicroMessenger/i.test(navigator.userAgent)
  const { login } = useAuth()
  const navigate = useNavigate()
  const scannerRef = useRef(null)
  const scannerContainerId = 'login-qr-reader'

  const doLogin = async (empNo) => {
    if (!empNo.trim()) {
      setError('请输入工号')
      return
    }
    try {
      const emp = await login(empNo)
      if (!emp.has_checked_in) {
        try {
          await db.checkIn(emp.id)
        } catch (e) {
          console.log('签到失败:', e.message)
        }
      }
      stopScanner()
      navigate('/')
    } catch (e) {
      setError(e.message || '登录失败')
    }
  }

  const startScanner = async () => {
    setScanning(true)
    setError('')
    try {
      const scanner = new Html5Qrcode(scannerContainerId)
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => { doLogin(decodedText) },
        () => {}
      )
    } catch (err) {
      setError(isWeChat
        ? '微信内无法调用相机，请点右上角 ⋯ 选择「在浏览器打开」'
        : '无法启动相机，请手动输入工号')
      setScanning(false)
    }
  }

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch (e) {}
      scannerRef.current = null
    }
    setScanning(false)
  }

  useEffect(() => {
    return () => { stopScanner() }
  }, [])

  const handleLogin = (e) => {
    e.preventDefault()
    doLogin(employeeNo)
  }

  return (
    <div className="app-container" style={{ background: 'linear-gradient(135deg, #FF6B35, #FF8F5E)' }}>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 60, marginBottom: 16 }}>🎉</div>
          <h1 style={{ color: 'white', fontSize: 28, marginBottom: 8 }}>2027尾牙</h1>
          <h2 style={{ color: 'white', fontSize: 18, fontWeight: 400, opacity: 0.9 }}>积分竞技暨竞标平台</h2>
        </div>

        <div className="card">
          {scanning ? (
            <div>
              <div id={scannerContainerId} style={{ width: '100%', borderRadius: 12, overflow: 'hidden' }} />
              <button
                className="btn btn-outline"
                style={{ marginTop: 12 }}
                onClick={stopScanner}
              >
                关闭相机
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={handleLogin}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8, color: '#666', fontSize: 14 }}>请输入您的工号</label>
                  <input
                    className="input"
                    placeholder="例如：EMP001"
                    value={employeeNo}
                    onChange={(e) => setEmployeeNo(e.target.value)}
                    autoCapitalize="characters"
                  />
                </div>

                {error && <div style={{ color: '#E63946', fontSize: 14, marginBottom: 12 }}>{error}</div>}

                <button className="btn btn-primary" type="submit">登 录</button>
              </form>

              <div style={{ textAlign: 'center', margin: '16px 0', color: '#999', fontSize: 12 }}>— 或 —</div>

              <button className="btn btn-outline" onClick={startScanner}>
                📷 扫描工号二维码
              </button>

              {isWeChat && (
                <div style={{ marginTop: 12, padding: 10, background: '#FFF4E5', borderRadius: 8, fontSize: 12, color: '#A66300', lineHeight: 1.6 }}>
                  微信内无法调用相机。请点右上角 ⋯ 选择「在浏览器打开」后再扫码；也可直接输入工号登录。
                </div>
              )}
            </>
          )}

          <p style={{ textAlign: 'center', color: '#999', fontSize: 12, marginTop: 16 }}>
            工号由管理员提前导入，如有问题请联系管理员
          </p>
        </div>
      </div>
    </div>
  )
}
