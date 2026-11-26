import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [employeeNo, setEmployeeNo] = useState('')
  const [error, setError] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  const doLogin = async (empNo) => {
    if (!empNo.trim()) {
      setError('请输入工号')
      return
    }
    try {
      await login(empNo)
      navigate('/')
    } catch (e) {
      setError(e.message || '登录失败')
    }
  }

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

          <p style={{ textAlign: 'center', color: '#999', fontSize: 12, marginTop: 16 }}>
            工号由管理员提前导入，如有问题请联系管理员
          </p>
        </div>
      </div>
    </div>
  )
}
