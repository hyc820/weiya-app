import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Ranking() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)

  const loadRanking = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('employees')
      .select('id, name, department, current_points, rank_no')
      .order('current_points', { ascending: false })
      .limit(50)
    setList(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadRanking()
    // 每 30 秒自动刷新
    const timer = setInterval(loadRanking, 30000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="app-container">
      <div className="navbar">
        <button className="back-btn" onClick={() => navigate('/')}>←</button>
        <span className="title">🏆 排行榜</span>
        <button className="back-btn" onClick={loadRanking} disabled={loading}>
          {loading ? '...' : '🔄'}
        </button>
      </div>

      <div className="card">
        {list.map((item, idx) => {
          const rank = idx + 1
          const isMe = item.id === employee?.id
          return (
            <div
              className="rank-item"
              key={item.id}
              style={{ background: isMe ? '#FFF3E0' : 'transparent' }}
            >
              <div className={`rank-no ${rank <= 3 ? `rank-${rank}` : ''}`}>
                {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}
              </div>
              <div className="rank-info">
                <div className="rank-name">
                  {item.name} {isMe && '(我)'}
                </div>
                <div className="rank-dept">{item.department}</div>
              </div>
              <div className="rank-points">{item.current_points}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
