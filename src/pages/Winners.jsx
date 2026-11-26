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
        employees (name, department, employee_no)
      `)
      .order('settled_at', { ascending: false })

    const list = data || []
    const ids = [...new Set(list.map((w) => w.item_id))]
    const itemMap = {}

    if (ids.length > 0) {
      const { data: items } = await supabase
        .from('auction_items_public')
        .select('*')
        .in('id', ids)
      ;(items || []).forEach((it) => { itemMap[it.id] = it })
    }

    setWinners(list.map((w) => ({ ...w, item: itemMap[w.item_id] })))
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
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{w.item?.item_name || '未知商品'}</div>
                  <div style={{ fontSize: 14, marginTop: 4 }}>
                    <span style={{ color: '#FF6B35', fontWeight: 600 }}>
                      {w.employees?.name || '未知'}
                    </span>
                    <span style={{ color: '#999', fontSize: 12, marginLeft: 6 }}>
                      {w.employees?.department} · {w.employees?.employee_no}
                    </span>
                  </div>
                  <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>得标积分：{w.win_points}</div>
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
