import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function MyPoints() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [history, setHistory] = useState([])

  const available = (employee?.current_points || 0) - (employee?.locked_points || 0)

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    const { data } = await supabase
      .from('point_history')
      .select('*')
      .eq('employee_id', employee.id)
      .order('created_at', { ascending: false })
    setHistory(data || [])
  }

  return (
    <div className="app-container">
      <div className="navbar">
        <button className="back-btn" onClick={() => navigate('/')}>←</button>
        <span className="title">我的积分</span>
        <span></span>
      </div>

      {/* 积分汇总 */}
      <div className="card">
        <div className="point-display">
          <div className="label">总积分</div>
          <div className="value">{employee?.current_points || 0}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#999', fontSize: 13 }}>已冻结</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#F9A826' }}>{employee?.locked_points || 0}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#999', fontSize: 13 }}>可用积分</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#16C79A' }}>{available}</div>
          </div>
        </div>
      </div>

      {/* 积分明细 */}
      <div className="card">
        <h3 style={{ marginBottom: 12, fontSize: 16 }}>积分明细</h3>
        {history.length === 0 ? (
          <div className="empty">暂无积分记录</div>
        ) : (
          history.map((h) => (
            <div className="list-item" key={h.id}>
              <div>
                <div style={{ fontWeight: 500 }}>{h.reference || h.point_type}</div>
                <div style={{ fontSize: 12, color: '#999' }}>
                  {new Date(h.created_at).toLocaleString('zh-CN')}
                </div>
              </div>
              <div style={{
                fontSize: 18,
                fontWeight: 700,
                color: h.points > 0 ? '#16C79A' : '#E63946'
              }}>
                {h.points > 0 ? '+' : ''}{h.points}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
