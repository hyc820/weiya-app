import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Winners() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [winners, setWinners] = useState([])

  useEffect(() => {
    loadWinners()
  }, [])

  const loadWinners = async () => {
    const { data } = await supabase
      .from('auction_winners')
      .select(`
        *,
        auction_items (item_name)
      `)
      .order('settled_at', { ascending: false })
    setWinners(data || [])
  }

  return (
    <div className="app-container">
      <div className="navbar">
        <button className="back-btn" onClick={() => navigate('/')}>←</button>
        <span className="title">得标结果</span>
        <span></span>
      </div>

      {winners.length === 0 ? (
        <div className="empty">暂无得标结果</div>
      ) : (
        winners.map((w) => {
          const isMe = w.employee_id === employee.id
          return (
            <div className="card" key={w.id} style={{ background: isMe ? '#E8F5E9' : 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{w.auction_items?.item_name}</div>
                  <div style={{ color: '#666', fontSize: 13 }}>得标积分：{w.win_points}</div>
                </div>
                <span className={`badge ${isMe ? 'badge-active' : 'badge-settled'}`}>
                  {isMe ? '🏆 我得标了！' : '已结束'}
                </span>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
