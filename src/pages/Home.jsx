import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Home() {
  const { employee, logout, refreshEmployee } = useAuth()
  const navigate = useNavigate()
  const [announcements, setAnnouncements] = useState([])

  useEffect(() => {
    refreshEmployee()
    loadAnnouncements()
  }, [])

  const loadAnnouncements = async () => {
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    setAnnouncements(data || [])
  }

  const isAdmin = employee?.role === 'admin'
  const isGameMaster = employee?.role === 'gamemaster' || isAdmin

  return (
    <div className="app-container">
      <div className="navbar">
        <span className="title">2027 尾牙积分平台</span>
        <button className="back-btn" onClick={logout}>退出</button>
      </div>

      {/* 员工信息卡片 */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #FF6B35, #FF8F5E)', color: 'white' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 40, marginRight: 12 }}>👤</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{employee?.name}</div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>{employee?.department} · {employee?.employee_no}</div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <span className={`badge badge-${employee?.role}`}>
              {isAdmin ? '管理员' : isGameMaster ? '关主' : '员工'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>目前积分</div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{employee?.current_points || 0}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>即时排名</div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>#{employee?.rank_no || '-'}</div>
          </div>
        </div>
      </div>

      {/* 功能按钮 */}
      <div className="btn-grid">
        <button className="btn btn-secondary" onClick={() => navigate('/points')}>💰 我的积分</button>
        <button className="btn btn-secondary" onClick={() => navigate('/ranking')}>🏆 排行榜</button>
        <button className="btn btn-secondary" onClick={() => navigate('/auction')}>🎁 竞标中心</button>
        <button className="btn btn-secondary" onClick={() => navigate('/announcement')}>📢 活动公告</button>
        <button className="btn btn-secondary" onClick={() => navigate('/my-bids')}>📋 我的出价</button>
        <button className="btn btn-secondary" onClick={() => navigate('/winners')}>🎉 得标结果</button>
      </div>

      {/* 关主/管理员专属按钮 */}
      {isGameMaster && (
        <div style={{ margin: '0 12px' }}>
          <button className="btn btn-success" onClick={() => navigate('/game-master')}>
            👑 关主加分模式
          </button>
        </div>
      )}
      {isAdmin && (
        <div style={{ margin: '12px' }}>
          <button className="btn btn-danger" onClick={() => navigate('/admin')}>
            ⚙️ 管理员后台
          </button>
        </div>
      )}

      {/* 公告 */}
      {announcements.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 12, fontSize: 16 }}>📢 活动公告</h3>
          {announcements.map((a) => (
            <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{a.title}</div>
              <div style={{ color: '#666', fontSize: 14, whiteSpace: 'pre-line' }}>{a.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
