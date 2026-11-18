import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function MyBids() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [bids, setBids] = useState([])

  useEffect(() => {
    loadBids()
  }, [])

  const loadBids = async () => {
    const { data } = await supabase
      .from('auction_bids')
      .select(`
        *,
        auction_items (item_name)
      `)
      .eq('employee_id', employee.id)
      .order('created_at', { ascending: false })
    setBids(data || [])
  }

  return (
    <div className="app-container">
      <div className="navbar">
        <button className="back-btn" onClick={() => navigate('/')}>←</button>
        <span className="title">我的出价</span>
        <span></span>
      </div>

      <div className="card" style={{ background: '#FFF8E1' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#999', fontSize: 13 }}>总冻结积分</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#F9A826' }}>{employee?.locked_points || 0}</div>
        </div>
      </div>

      {bids.length === 0 ? (
        <div className="empty">暂无出价记录</div>
      ) : (
        bids.map((b) => (
          <div className="card" key={b.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{b.auction_items?.item_name}</div>
                <div style={{ fontSize: 12, color: '#999' }}>
                  {new Date(b.created_at).toLocaleString('zh-CN')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#FF6B35' }}>{b.bid_points} 分</div>
                <span className={`badge ${b.status === 'won' ? 'badge-active' : b.status === 'lost' ? 'badge-settled' : 'badge-pending'}`}>
                  {b.status === 'active' ? '出价中' : b.status === 'won' ? '🏆 得标' : b.status === 'lost' ? '未得标' : b.status}
                </span>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
