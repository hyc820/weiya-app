import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../context/AuthContext'

export default function MyQR() {
  const { employee } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="app-container">
      <div className="navbar">
        <button className="back-btn" onClick={() => navigate('/')}>←</button>
        <span className="title">我的二维码</span>
        <span></span>
      </div>

      <div className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{employee?.name}</div>
        <div style={{ color: '#666', fontSize: 14, marginTop: 4 }}>
          {employee?.department} · {employee?.employee_no}
        </div>

        <div
          style={{
            margin: '24px auto',
            padding: 16,
            background: 'white',
            borderRadius: 12,
            display: 'inline-block',
            border: '1px solid #eee'
          }}
        >
          <QRCodeSVG value={employee?.employee_no || ''} size={220} level="M" />
        </div>

        <div style={{ color: '#FF6B35', fontWeight: 600, fontSize: 15 }}>
          请将此码出示给关主扫描
        </div>
        <div style={{ color: '#999', fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
          扫描后可获得游戏积分<br />
          如果关主扫不到，请调高屏幕亮度
        </div>
      </div>
    </div>
  )
}
