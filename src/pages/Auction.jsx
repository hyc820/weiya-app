import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Auction() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])

  useEffect(() => {
    loadItems()
  }, [])

  const loadItems = async () => {
    const now = new Date().toISOString()
    const { data } = await supabase
      .from('auction_items')
      .select('*')
      .order('start_time', { ascending: true })
    setItems(data || [])
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active': return <span className="badge badge-active">🔥 进行中</span>
      case 'pending': return <span className="badge badge-pending">未开始</span>
      case 'settled': return <span className="badge badge-settled">已结标</span>
      default: return null
    }
  }

  return (
    <div className="app-container">
      <div className="navbar">
        <button className="back-btn" onClick={() => navigate('/')}>←</button>
        <span className="title">🎁 积分拍卖会</span>
        <span></span>
      </div>

      {items.map((item) => (
        <div className="card" key={item.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 17 }}>{item.item_name}</h3>
            {getStatusBadge(item.status)}
          </div>
          {item.image_url && (
            <img src={item.image_url} alt={item.item_name} style={{ width: '100%', borderRadius: 8, marginBottom: 12 }} />
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: 14, marginBottom: 12 }}>
            <span>起标：{item.base_points} 分</span>
            <span>数量：{item.quantity}</span>
          </div>
          {item.status === 'active' && (
            <button
              className="btn btn-primary"
              onClick={() => navigate(`/bid/${item.id}`)}
            >
              我要竞标
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
